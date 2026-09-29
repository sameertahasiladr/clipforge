/**
 * OAuth State Security Service — ClipForge AI
 * Provides CSRF-protected, cryptographically secure, single-use, timed OAuth state management.
 * Associates state with authenticated user and intended platform without exposing user ID in callback URLs.
 */

import crypto from 'node:crypto';

export interface OAuthStateData {
  userId: string;
  platform: 'instagram' | 'facebook' | 'youtube';
  createdAt: number;
  expiresAt: number;
}

export class OAuthStateService {
  private static states = new Map<string, OAuthStateData>();
  private static TTL_MS = 10 * 60 * 1000; // 10 minutes

  /**
   * Generates a cryptographically secure random state token and registers it server-side.
   * Does NOT contain the user's UID.
   */
  public static createState(userId: string, platform: 'instagram' | 'facebook' | 'youtube'): string {
    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      throw new Error('Authenticated user ID is required to generate OAuth state.');
    }

    // Purge expired tokens
    this.cleanExpired();

    // 32 cryptographically secure random bytes = 64 hex characters
    const token = crypto.randomBytes(32).toString('hex');
    const now = Date.now();

    this.states.set(token, {
      userId: userId.trim(),
      platform,
      createdAt: now,
      expiresAt: now + this.TTL_MS,
    });

    return token;
  }

  /**
   * Validates and single-use consumes the state token.
   * Rejects missing, invalid, expired, reused, or platform-mismatched states.
   */
  public static validateAndConsumeState(
    state: string | undefined | null,
    expectedPlatform: 'instagram' | 'facebook' | 'youtube'
  ): { valid: boolean; userId?: string; error?: string } {
    if (!state || typeof state !== 'string' || !state.trim()) {
      return { valid: false, error: 'OAuth state is missing.' };
    }

    const trimmed = state.trim();
    const record = this.states.get(trimmed);

    if (!record) {
      return { valid: false, error: 'OAuth state is invalid, expired, or has already been used.' };
    }

    // Immediately remove token to ensure single-use replay protection
    this.states.delete(trimmed);

    // Verify expiration
    if (Date.now() > record.expiresAt) {
      return { valid: false, error: 'OAuth state has expired. Please initiate connection again.' };
    }

    // Verify platform match
    if (record.platform !== expectedPlatform) {
      return {
        valid: false,
        error: `OAuth state platform mismatch: expected ${expectedPlatform}, got ${record.platform}.`,
      };
    }

    return { valid: true, userId: record.userId };
  }

  /**
   * Cleans up expired state entries
   */
  private static cleanExpired(): void {
    const now = Date.now();
    for (const [key, data] of this.states.entries()) {
      if (now > data.expiresAt) {
        this.states.delete(key);
      }
    }
  }

  /**
   * Utility for testing and diagnostics
   */
  public static clearAll(): void {
    this.states.clear();
  }
}
