/**
 * YouTube Cookie Service — ClipForge AI
 * Secure, Multi-Tenant Per-User Cookie Isolation with AES-256-GCM Encryption at Rest.
 * Backed authoritatively by PostgreSQL (Cloud SQL).
 * Netscape cookies are stored encrypted per user and never exposed in API responses.
 * Isolated temporary cookie files are created on-demand for yt-dlp operations and immediately unlinked.
 */

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { Database } from '../db/database.ts';
import { CryptoService } from './cryptoService.ts';
import { YouTubeService } from './youtubeService.ts';

export interface CookieInfo {
  configured: boolean;
  filePath: string | null;
  sizeBytes: number;
  cookieCount: number;
  youtubeCookieCount: number;
  hasSessionCookies: boolean;
  lastModified: string | null;
  sampleDomains: string[];
}

export class CookieService {
  /**
   * Initializes user_cookies table if not exists
   */
  public static async init(): Promise<void> {
    try {
      await Database.query(`
        CREATE TABLE IF NOT EXISTS user_cookies (
            user_id VARCHAR(100) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            encrypted_cookies TEXT NOT NULL,
            cookie_count INT DEFAULT 0,
            youtube_cookie_count INT DEFAULT 0,
            has_session_cookies BOOLEAN DEFAULT FALSE,
            sample_domains TEXT[],
            size_bytes INT DEFAULT 0,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_user_cookies_user ON user_cookies(user_id);
      `);
    } catch (err: any) {
      console.warn('[CookieService] Notice during user_cookies initialization:', err?.message || err);
    }
  }

  /**
   * Parses and inspects cookie text in-memory to compute metadata without persisting secrets in plaintext
   */
  private static inspectCookieText(content: string): {
    cookieCount: number;
    youtubeCookieCount: number;
    hasSessionCookies: boolean;
    sampleDomains: string[];
    sizeBytes: number;
  } {
    const lines = content.split('\n');
    let cookieCount = 0;
    let youtubeCookieCount = 0;
    let hasSessionCookies = false;
    const domainsSet = new Set<string>();

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      const parts = line.split('\t');
      if (parts.length >= 7) {
        cookieCount++;
        const domain = parts[0].toLowerCase();
        domainsSet.add(domain);

        if (domain.includes('youtube.com') || domain.includes('google.com')) {
          youtubeCookieCount++;
        }

        const name = parts[5];
        if (
          [
            'VISITOR_INFO1_LIVE',
            'LOGIN_INFO',
            'SID',
            'HSID',
            'SSID',
            'APISID',
            'SAPISID',
            '__Secure-3PSID',
            '__Secure-1PSID',
          ].includes(name)
        ) {
          hasSessionCookies = true;
        }
      }
    }

    return {
      cookieCount,
      youtubeCookieCount,
      hasSessionCookies,
      sampleDomains: Array.from(domainsSet).slice(0, 5),
      sizeBytes: Buffer.byteLength(content, 'utf8'),
    };
  }

  /**
   * Reads and inspects current cookie configuration metadata for a specific authenticated user.
   * Strictly secret-safe: returns metadata only, never exposes decrypted cookie contents.
   */
  public static async getCookieInfo(userId: string): Promise<CookieInfo> {
    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      return {
        configured: false,
        filePath: null,
        sizeBytes: 0,
        cookieCount: 0,
        youtubeCookieCount: 0,
        hasSessionCookies: false,
        lastModified: null,
        sampleDomains: [],
      };
    }

    const cleanUserId = userId.trim();
    const res = await Database.query(
      'SELECT cookie_count, youtube_cookie_count, has_session_cookies, sample_domains, size_bytes, updated_at FROM user_cookies WHERE user_id = $1 LIMIT 1;',
      [cleanUserId]
    );

    if (res.rows.length === 0) {
      return {
        configured: false,
        filePath: null,
        sizeBytes: 0,
        cookieCount: 0,
        youtubeCookieCount: 0,
        hasSessionCookies: false,
        lastModified: null,
        sampleDomains: [],
      };
    }

    const row = res.rows[0];
    return {
      configured: (row.cookie_count || 0) > 0,
      filePath: null, // Secret-safe: do not expose server disk paths
      sizeBytes: row.size_bytes || 0,
      cookieCount: row.cookie_count || 0,
      youtubeCookieCount: row.youtube_cookie_count || 0,
      hasSessionCookies: Boolean(row.has_session_cookies),
      lastModified: row.updated_at ? new Date(row.updated_at).toISOString() : null,
      sampleDomains: row.sample_domains || [],
    };
  }

  /**
   * Saves new Netscape cookie file content for the authenticated user.
   * Encrypts contents with AES-256-GCM before persisting in PostgreSQL.
   */
  public static async saveCookies(userId: string, rawContent: string): Promise<CookieInfo> {
    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      throw new Error('userId is required to save YouTube cookies.');
    }

    if (!rawContent || typeof rawContent !== 'string') {
      throw new Error('Cookie content must be a non-empty string.');
    }

    let cleaned = rawContent.replace(/\r\n/g, '\n').trim();
    if (!cleaned) {
      throw new Error('Provided cookie content is empty.');
    }

    // Ensure standard Netscape header if missing
    if (!cleaned.includes('# Netscape HTTP Cookie File')) {
      cleaned = `# Netscape HTTP Cookie File\n# http://curl.haxx.se/rfc/cookie_spec.html\n# This file was generated by ClipForge AI\n\n${cleaned}`;
    }

    const metadata = this.inspectCookieText(cleaned);
    if (metadata.cookieCount === 0) {
      throw new Error('No valid Netscape format cookie entries detected in provided content.');
    }

    const encrypted = CryptoService.encrypt(cleaned);
    const cleanUserId = userId.trim();

    const sql = `
      INSERT INTO user_cookies (
        user_id, encrypted_cookies, cookie_count, youtube_cookie_count,
        has_session_cookies, sample_domains, size_bytes, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, NOW()
      )
      ON CONFLICT (user_id) DO UPDATE SET
        encrypted_cookies = EXCLUDED.encrypted_cookies,
        cookie_count = EXCLUDED.cookie_count,
        youtube_cookie_count = EXCLUDED.youtube_cookie_count,
        has_session_cookies = EXCLUDED.has_session_cookies,
        sample_domains = EXCLUDED.sample_domains,
        size_bytes = EXCLUDED.size_bytes,
        updated_at = NOW()
      RETURNING *;
    `;

    const params = [
      cleanUserId,
      encrypted,
      metadata.cookieCount,
      metadata.youtubeCookieCount,
      metadata.hasSessionCookies,
      metadata.sampleDomains,
      metadata.sizeBytes,
    ];

    const res = await Database.query(sql, params);
    const row = res.rows[0];

    return {
      configured: true,
      filePath: null,
      sizeBytes: row.size_bytes,
      cookieCount: row.cookie_count,
      youtubeCookieCount: row.youtube_cookie_count,
      hasSessionCookies: row.has_session_cookies,
      lastModified: new Date(row.updated_at).toISOString(),
      sampleDomains: row.sample_domains || [],
    };
  }

  /**
   * Deletes cookies for the specified user from PostgreSQL
   */
  public static async deleteCookies(userId: string): Promise<boolean> {
    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      return true;
    }
    const cleanUserId = userId.trim();
    await Database.query('DELETE FROM user_cookies WHERE user_id = $1;', [cleanUserId]);
    return true;
  }

  /**
   * Safely retrieves and temporarily materializes an isolated cookie file for a single operation.
   * Automatically provides a cleanup callback to ensure zero plaintext credential leakage on disk.
   */
  public static async getUserCookiesFile(userId: string): Promise<{
    filePath: string | null;
    cleanup: () => void;
  }> {
    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      return { filePath: null, cleanup: () => {} };
    }

    const cleanUserId = userId.trim();
    const res = await Database.query(
      'SELECT encrypted_cookies FROM user_cookies WHERE user_id = $1 LIMIT 1;',
      [cleanUserId]
    );

    if (res.rows.length === 0 || !res.rows[0].encrypted_cookies) {
      return { filePath: null, cleanup: () => {} };
    }

    const decrypted = CryptoService.decrypt(res.rows[0].encrypted_cookies);
    if (!decrypted || decrypted.trim().length === 0) {
      return { filePath: null, cleanup: () => {} };
    }

    const safeUid = cleanUserId.replace(/[^a-zA-Z0-9_-]/g, '');
    const rand = crypto.randomBytes(8).toString('hex');
    const tempFilePath = path.join(os.tmpdir(), `cf_cookie_${safeUid}_${rand}.txt`);

    // Write file with strict 0600 permissions (read/write by owner only)
    fs.writeFileSync(tempFilePath, decrypted + '\n', { mode: 0o600, encoding: 'utf8' });

    const cleanup = () => {
      try {
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
      } catch {}
    };

    return { filePath: tempFilePath, cleanup };
  }

  /**
   * Tests YouTube connectivity for the authenticated user using yt-dlp simulation
   */
  public static async testUserCookies(userId: string): Promise<{
    success: boolean;
    message: string;
    details?: string;
  }> {
    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      return {
        success: false,
        message: 'Authentication required to test YouTube cookies.',
      };
    }

    const { filePath, cleanup } = await this.getUserCookiesFile(userId);
    if (!filePath) {
      return {
        success: false,
        message: 'No YouTube cookies are currently configured for your account.',
      };
    }

    try {
      const ytdlp = await YouTubeService.ensureYtDlp();
      if (!ytdlp) {
        return {
          success: false,
          message: 'yt-dlp is not available to test cookies.',
        };
      }

      const jsRuntimeArgs = YouTubeService.getJsRuntimeArgs();
      const testUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

      return await new Promise((resolve) => {
        const proc = spawn(
          ytdlp,
          [
            '--simulate',
            '--no-warnings',
            '--socket-timeout',
            '15',
            '--cookies',
            filePath,
            ...jsRuntimeArgs,
            testUrl,
          ],
          { stdio: ['ignore', 'pipe', 'pipe'] }
        );

        let output = '';
        let stderr = '';

        proc.stdout.on('data', (d) => {
          output += d.toString();
        });
        proc.stderr.on('data', (d) => {
          stderr += d.toString();
        });

        const timeout = setTimeout(() => {
          try {
            proc.kill('SIGKILL');
          } catch {}
          resolve({
            success: false,
            message: 'Cookie verification timed out after 15 seconds.',
            details: stderr || output,
          });
        }, 15000);

        proc.on('close', (code) => {
          clearTimeout(timeout);
          const combined = (output + '\n' + stderr).toLowerCase();

          if (
            combined.includes('sign in to confirm you’re not a bot') ||
            combined.includes("sign in to confirm you're not a bot") ||
            combined.includes('bot verification') ||
            combined.includes('use --cookies') ||
            combined.includes('captcha')
          ) {
            resolve({
              success: false,
              message: 'YouTube rejected these cookies: session expired or bot verification triggered.',
              details: stderr.trim() || output.trim(),
            });
            return;
          }

          if (code === 0) {
            resolve({
              success: true,
              message: 'YouTube cookies verified successfully! Authenticated access confirmed.',
            });
          } else {
            const parsed = YouTubeService.parseYtDlpError(stderr);
            resolve({
              success: false,
              message: parsed.message || 'Cookie verification test failed.',
              details: stderr.trim(),
            });
          }
        });

        proc.on('error', (err) => {
          clearTimeout(timeout);
          resolve({
            success: false,
            message: `Failed to run verification process: ${err.message}`,
          });
        });
      });
    } finally {
      cleanup();
    }
  }

  /**
   * Returns array of CLI arguments for yt-dlp to use cookies if user cookies are active.
   * If userId is provided, obtains user's cookie file.
   */
  public static async getYtDlpArgsForUser(userId: string): Promise<{
    args: string[];
    cleanup: () => void;
  }> {
    const { filePath, cleanup } = await this.getUserCookiesFile(userId);
    if (filePath) {
      return { args: ['--cookies', filePath], cleanup };
    }
    return { args: [], cleanup: () => {} };
  }
}
