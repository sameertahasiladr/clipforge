/**
 * Authentication Middleware — ClipForge AI
 * Authoritative Server-Side Firebase ID Token Verification and PostgreSQL User Mapping.
 * Enforces verified user identity on all private routes.
 * Never trusts client-supplied user IDs.
 */

import { Request, Response, NextFunction } from 'express';
import { initializeApp, getApps, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import fs from 'node:fs';
import path from 'node:path';
import { UserRepository } from '../repositories/userRepository.ts';
import type { UserItem } from '../db/store.ts';

export interface AuthenticatedUser {
  uid: string;
  email: string;
  userId: string;
  name?: string;
  user: UserItem;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthenticatedUser;
    }
  }
}

let firebaseAdminApp: App | null = null;

/**
 * Initializes Firebase Admin instance with the provisioned project ID
 */
export function getFirebaseAdminApp(): App {
  if (firebaseAdminApp) return firebaseAdminApp;

  const existingApps = getApps();
  if (existingApps.length > 0 && existingApps[0]) {
    firebaseAdminApp = existingApps[0];
    return firebaseAdminApp;
  }

  let projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT;
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');

  if (fs.existsSync(configPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (cfg.projectId) {
        projectId = cfg.projectId;
      }
    } catch (err) {
      console.warn('[AuthMiddleware] Error parsing firebase-applet-config.json:', err);
    }
  }

  firebaseAdminApp = initializeApp({
    projectId: projectId || 'helical-abstraction-m0w9t',
  });

  return firebaseAdminApp;
}

/**
 * Extracts Bearer token from Authorization header or URL query parameter
 */
function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && typeof authHeader === 'string') {
    const parts = authHeader.trim().split(' ');
    if (parts.length === 2 && /^Bearer$/i.test(parts[0])) {
      return parts[1].trim();
    }
  }

  // Fallback query parameters for browser-level media streaming or direct downloads
  if (typeof req.query.token === 'string' && req.query.token.trim()) {
    return req.query.token.trim();
  }
  if (typeof req.query.auth_token === 'string' && req.query.auth_token.trim()) {
    return req.query.auth_token.trim();
  }

  return null;
}

/**
 * Verifies a token and maps it to a PostgreSQL user record
 */
async function verifyAndMapUser(token: string): Promise<AuthenticatedUser> {
  // Support controlled internal test tokens only if explicitly enabled in environment
  if (process.env.ALLOW_DEV_TOKEN === 'true' && token.startsWith('test_token_')) {
    const testUid = token.replace('test_token_', '').trim() || 'test-user';
    const decoded = {
      uid: testUid,
      email: `${testUid}@clipforge.test`,
      name: `Test Creator (${testUid})`,
    };
    const user = await UserRepository.findOrCreateByFirebase(decoded);
    return {
      uid: decoded.uid,
      email: user.email,
      userId: user.id,
      name: user.fullName,
      user,
    };
  }

  // Real production verification via Firebase Admin SDK public certs
  const adminApp = getFirebaseAdminApp();
  const decoded = await getAuth(adminApp).verifyIdToken(token);

  if (!decoded || !decoded.uid) {
    throw new Error('Invalid Firebase ID token: missing UID.');
  }

  // Authoritatively map Firebase UID to PostgreSQL user record
  const user = await UserRepository.findOrCreateByFirebase({
    uid: decoded.uid,
    email: decoded.email,
    name: decoded.name || (decoded as any).displayName,
    picture: decoded.picture,
  });

  return {
    uid: decoded.uid,
    email: user.email,
    userId: user.id,
    name: user.fullName,
    user,
  };
}

/**
 * Authentication Middleware (Mandatory)
 * Rejects unauthenticated requests with HTTP 401.
 */
export async function authenticateRequest(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = extractToken(req);

  if (!token) {
    res.status(401).json({
      error: 'Authentication required. Please provide a valid Firebase ID token in Authorization header.',
      code: 'UNAUTHORIZED',
    });
    return;
  }

  try {
    const authData = await verifyAndMapUser(token);
    req.auth = authData;
    next();
  } catch (err: any) {
    console.warn('[AuthMiddleware] Token verification failed:', err?.message || err);
    res.status(401).json({
      error: 'Authentication failed. Invalid, revoked, or expired Firebase ID token.',
      code: 'INVALID_TOKEN',
    });
  }
}

/**
 * Optional Authentication Middleware
 * Populates req.auth if a valid token is present, but allows unauthenticated requests to proceed.
 */
export async function optionalAuthenticateRequest(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const token = extractToken(req);
  if (!token) {
    req.auth = undefined;
    return next();
  }

  try {
    const authData = await verifyAndMapUser(token);
    req.auth = authData;
  } catch {
    req.auth = undefined;
  }
  next();
}
