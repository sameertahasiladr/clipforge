/**
 * Cryptographic Utility for Secure Server-Side OAuth Credential Storage
 * Uses AES-256-GCM authenticated encryption.
 * Keys and secrets are strictly server-side and never exposed to client.
 */

import crypto from 'node:crypto';

// Use a server-side encryption key derived from environment or internal salt
const ENCRYPTION_SECRET = process.env.SESSION_SECRET || process.env.APP_SECRET || 'clipforge-master-encryption-key-2026';
const ALGORITHM = 'aes-256-gcm';

function getDerivedKey(): Buffer {
  return crypto.scryptSync(ENCRYPTION_SECRET, 'clipforge_salt_v1', 32);
}

export class CryptoService {
  /**
   * Encrypts plaintext string into hex representation (iv:authTag:encrypted)
   */
  public static encrypt(plainText: string): string {
    if (!plainText) return '';
    const iv = crypto.randomBytes(12);
    const key = getDerivedKey();
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  /**
   * Decrypts encrypted string payload
   */
  public static decrypt(cipherPayload: string): string {
    if (!cipherPayload) return '';
    try {
      const parts = cipherPayload.split(':');
      if (parts.length !== 3) return cipherPayload; // Fallback if plain

      const iv = Buffer.from(parts[0], 'hex');
      const authTag = Buffer.from(parts[1], 'hex');
      const encrypted = parts[2];

      const key = getDerivedKey();
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (err) {
      console.error('[CryptoService] Decryption failed:', err);
      return '';
    }
  }
}
