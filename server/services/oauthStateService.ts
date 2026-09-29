/**
 * OAuth State Security Service — ClipForge AI
 * Provides CSRF-protected, cryptographically secure, single-use, timed OAuth state management
 * backed by PostgreSQL (Cloud SQL).
 * Associates state with authenticated user and intended platform without exposing user ID in callback URLs.
 * Survives server restarts and scales horizontally across multiple instances.
 */

import crypto from 'node:crypto';
import { Database } from '../db/database.ts';

export interface OAuthStateData {
  stateToken: string;
  userId: string;
  platform: 'instagram' | 'facebook' | 'youtube';
  createdAt: Date;
  expiresAt: Date;
  consumedAt?: Date | null;
}

export class OAuthStateService {
  private static TTL_MINUTES = 10;

  /**
   * Generates a cryptographically secure random state token and registers it in PostgreSQL.
   * Associates state strictly with authenticated user and expected platform.
   * Never exposes user ID in the state token or URL.
   */
  public static async createState(
    userId: string,
    platform: 'instagram' | 'facebook' | 'youtube'
  ): Promise<string> {
    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      throw new Error('Authenticated user ID is required to generate OAuth state.');
    }

    const cleanUserId = userId.trim();
    // 32 cryptographically secure random bytes = 64 hex characters
    const token = crypto.randomBytes(32).toString('hex');

    const insertSql = `
      INSERT INTO oauth_states (
        state_token, user_id, platform, created_at, expires_at
      ) VALUES (
        $1, $2, $3, NOW(), NOW() + INTERVAL '${this.TTL_MINUTES} minutes'
      )
      RETURNING state_token;
    `;

    await Database.query(insertSql, [token, cleanUserId, platform]);

    // Background asynchronous purge of stale records older than 1 hour (non-blocking)
    Database.query(
      "DELETE FROM oauth_states WHERE expires_at < NOW() - INTERVAL '1 hour' OR consumed_at < NOW() - INTERVAL '1 hour';"
    ).catch(() => {});

    return token;
  }

  /**
   * Validates and single-use consumes the state token atomically in PostgreSQL.
   * Rejects missing, invalid, expired, already-used, or platform-mismatched states.
   * Obtains the user ID ONLY from the server-side stored state.
   */
  public static async validateAndConsumeState(
    state: string | undefined | null,
    expectedPlatform: 'instagram' | 'facebook' | 'youtube'
  ): Promise<{ valid: boolean; userId?: string; error?: string }> {
    if (!state || typeof state !== 'string' || !state.trim()) {
      return { valid: false, error: 'OAuth state is missing.' };
    }

    const trimmed = state.trim();

    // Atomic update preventing check-then-delete race conditions
    const updateSql = `
      UPDATE oauth_states
      SET consumed_at = NOW()
      WHERE state_token = $1
        AND consumed_at IS NULL
        AND expires_at > NOW()
        AND platform = $2
      RETURNING user_id;
    `;

    const res = await Database.query(updateSql, [trimmed, expectedPlatform]);

    if (res.rows.length > 0 && res.rows[0].user_id) {
      return { valid: true, userId: res.rows[0].user_id };
    }

    // Diagnostic query to return precise security error for auditability
    try {
      const checkSql = 'SELECT user_id, platform, expires_at, consumed_at FROM oauth_states WHERE state_token = $1 LIMIT 1;';
      const checkRes = await Database.query(checkSql, [trimmed]);

      if (checkRes.rows.length === 0) {
        return { valid: false, error: 'OAuth state is invalid, expired, or has already been used.' };
      }

      const row = checkRes.rows[0];
      if (row.consumed_at) {
        return { valid: false, error: 'OAuth state has already been consumed. Replay attempt rejected.' };
      }

      const expiresAtDate = new Date(row.expires_at);
      if (Date.now() > expiresAtDate.getTime()) {
        return { valid: false, error: 'OAuth state has expired. Please initiate connection again.' };
      }

      if (row.platform !== expectedPlatform) {
        return {
          valid: false,
          error: `OAuth state platform mismatch: expected ${expectedPlatform}, got ${row.platform}.`,
        };
      }
    } catch {
      // Fall through to general failure message
    }

    return { valid: false, error: 'OAuth state validation failed.' };
  }

  /**
   * Utility for automated testing and test-reset
   */
  public static async clearAll(): Promise<void> {
    await Database.query('DELETE FROM oauth_states;');
  }

  /**
   * Utility for test verification of stored state in PostgreSQL
   */
  public static async getStateForTesting(token: string): Promise<any> {
    const res = await Database.query('SELECT * FROM oauth_states WHERE state_token = $1 LIMIT 1;', [token]);
    return res.rows[0] || null;
  }
}
