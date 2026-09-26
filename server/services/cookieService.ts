/**
 * YouTube Cookie Service — ClipForge AI
 * Manages Netscape-formatted YouTube cookies for yt-dlp to bypass bot verification,
 * IP blocks, and sign-in gates on the server.
 */

import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
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
  private static defaultStoragePath = path.join(process.cwd(), 'storage', 'youtube_cookies.txt');

  /**
   * Initializes cookie storage and syncs from environment variables if present
   */
  public static init(): void {
    const storageDir = path.dirname(this.defaultStoragePath);
    if (!fs.existsSync(storageDir)) {
      try {
        fs.mkdirSync(storageDir, { recursive: true });
      } catch {}
    }

    // Auto-sync from env var if provided and storage file doesn't exist
    const envCookies = process.env.YOUTUBE_COOKIES || process.env.YOUTUBE_COOKIES_CONTENT;
    if (envCookies && !fs.existsSync(this.defaultStoragePath)) {
      try {
        const cleaned = envCookies.replace(/\\n/g, '\n').replace(/\r\n/g, '\n').trim();
        if (cleaned.length > 0) {
          fs.writeFileSync(this.defaultStoragePath, cleaned + '\n', 'utf8');
          console.log('[CookieService] Initialized youtube_cookies.txt from environment variable.');
        }
      } catch (err: any) {
        console.warn('[CookieService] Failed to write cookies from env var:', err?.message);
      }
    }
  }

  /**
   * Returns path to active valid cookies file, or null if none configured
   */
  public static getCookiesPath(): string | null {
    // 1. Check custom path in environment
    if (process.env.YOUTUBE_COOKIES_PATH && fs.existsSync(process.env.YOUTUBE_COOKIES_PATH)) {
      try {
        const stats = fs.statSync(process.env.YOUTUBE_COOKIES_PATH);
        if (stats.size > 20) return process.env.YOUTUBE_COOKIES_PATH;
      } catch {}
    }

    // 2. Candidate files in descending priority
    const candidates = [
      this.defaultStoragePath,
      path.join(process.cwd(), 'storage', 'cookies.txt'),
      path.join(process.cwd(), 'cookies.txt'),
      path.join(process.cwd(), 'youtube-cookies.txt'),
    ];

    for (const c of candidates) {
      if (fs.existsSync(c)) {
        try {
          const stats = fs.statSync(c);
          if (stats.size > 20) return c;
        } catch {}
      }
    }

    return null;
  }

  /**
   * Reads and inspects current cookie configuration metadata
   */
  public static getCookieInfo(): CookieInfo {
    const cookiesPath = this.getCookiesPath();
    if (!cookiesPath || !fs.existsSync(cookiesPath)) {
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

    try {
      const stats = fs.statSync(cookiesPath);
      const content = fs.readFileSync(cookiesPath, 'utf8');
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
          if (['VISITOR_INFO1_LIVE', 'LOGIN_INFO', 'SID', 'HSID', 'SSID', 'APISID', 'SAPISID', '__Secure-3PSID'].includes(name)) {
            hasSessionCookies = true;
          }
        }
      }

      return {
        configured: cookieCount > 0,
        filePath: path.relative(process.cwd(), cookiesPath),
        sizeBytes: stats.size,
        cookieCount,
        youtubeCookieCount,
        hasSessionCookies,
        lastModified: stats.mtime.toISOString(),
        sampleDomains: Array.from(domainsSet).slice(0, 5),
      };
    } catch {
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
  }

  /**
   * Saves new Netscape cookie file content to storage
   */
  public static saveCookies(rawContent: string): CookieInfo {
    if (!rawContent || typeof rawContent !== 'string') {
      throw new Error('Cookie content must be a non-empty string.');
    }

    let cleaned = rawContent.replace(/\r\n/g, '\n').trim();
    if (!cleaned) {
      throw new Error('Provided cookie content is empty.');
    }

    // Ensure header if missing
    if (!cleaned.includes('# Netscape HTTP Cookie File')) {
      cleaned = `# Netscape HTTP Cookie File\n# http://curl.haxx.se/rfc/cookie_spec.html\n# This file was generated by ClipForge AI\n\n${cleaned}`;
    }

    const storageDir = path.dirname(this.defaultStoragePath);
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }

    fs.writeFileSync(this.defaultStoragePath, cleaned + '\n', 'utf8');
    return this.getCookieInfo();
  }

  /**
   * Deletes the user-configured cookies file
   */
  public static deleteCookies(): boolean {
    const targetPath = this.getCookiesPath() || this.defaultStoragePath;
    if (fs.existsSync(targetPath)) {
      try {
        fs.unlinkSync(targetPath);
        return true;
      } catch (err: any) {
        throw new Error(`Failed to delete cookies file: ${err.message}`);
      }
    }
    return true;
  }

  /**
   * Returns array of CLI arguments for yt-dlp to use cookies if available
   */
  public static getYtDlpCookieArgs(): string[] {
    const cookiesPath = this.getCookiesPath();
    if (cookiesPath) {
      return ['--cookies', cookiesPath];
    }
    return [];
  }

  /**
   * Tests YouTube connectivity with the active cookies file using yt-dlp simulation
   */
  public static async testActiveCookies(): Promise<{
    success: boolean;
    message: string;
    details?: string;
  }> {
    const cookiesPath = this.getCookiesPath();
    if (!cookiesPath) {
      return {
        success: false,
        message: 'No YouTube cookies are currently configured.',
      };
    }

    const ytdlp = await YouTubeService.ensureYtDlp();
    if (!ytdlp) {
      return {
        success: false,
        message: 'yt-dlp is not available to test cookies.',
      };
    }

    const jsRuntimeArgs = YouTubeService.getJsRuntimeArgs();
    const testUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

    return new Promise((resolve) => {
      const proc = spawn(
        ytdlp,
        [
          '--simulate',
          '--no-warnings',
          '--socket-timeout',
          '15',
          '--cookies',
          cookiesPath,
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
  }
}
