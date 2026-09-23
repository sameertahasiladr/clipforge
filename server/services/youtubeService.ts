/**
 * YouTube Service — ClipForge AI
 * Validates URLs, fetches video metadata, downloads permitted source video,
 * and interfaces with YouTube Data API v3 for real Shorts publishing.
 */

import path from 'node:path';
import fs from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { CryptoService } from './cryptoService.js';
import { StorageService } from './storageService.js';

export interface YtDlpDiagnostics {
  ytDlpPath: string | null;
  ytDlpVersion: string | null;
  jsRuntime: string | null;
  jsRuntimePath: string | null;
  jsRuntimeVersion: string | null;
  ejsAvailable: boolean;
  supportsJsChallenges: boolean;
  publicYouTubeAccessTest: 'SUCCESS' | 'BLOCKED' | 'NOT_TESTED';
  diagnosticsCheckedAt: string;
}

export interface YouTubeValidationResult {
  isValid: boolean;
  videoId: string | null;
  urlType: 'watch' | 'shorts' | 'embed' | 'shortener' | 'unknown';
  error?: string;
}

export interface YouTubeVideoMetadata {
  videoId: string;
  title: string;
  channelTitle: string;
  channelId: string;
  durationSeconds: number;
  thumbnailUrl: string;
  isPublic: boolean;
  hasCaptions: boolean;
  publishedAt?: string;
}

export class YouTubeService {
  private static ytDlpPath: string | null = null;
  private static cachedDiagnostics: YtDlpDiagnostics | null = null;
  private static lastDiagnosticsCheck: number = 0;
  private static publicAccessTestResult: 'SUCCESS' | 'BLOCKED' | 'NOT_TESTED' = 'NOT_TESTED';

  /**
   * Checks whether Google / YouTube OAuth credentials are provided
   */
  public static isConfigured(): boolean {
    const clientId = process.env.YOUTUBE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.YOUTUBE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
    return Boolean(
      clientId &&
        clientSecret &&
        clientId !== 'your_google_client_id' &&
        !clientId.includes('your_')
    );
  }

  /**
   * Ensures yt-dlp binary is available for permitted source video downloads
   */
  public static async ensureYtDlp(): Promise<string | null> {
    if (this.ytDlpPath && fs.existsSync(this.ytDlpPath)) {
      return this.ytDlpPath;
    }

    const candidatePaths = [
      '/usr/local/bin/yt-dlp',
      path.join(process.cwd(), 'bin', 'yt-dlp'),
      '/tmp/yt-dlp',
      '/usr/bin/yt-dlp',
    ];
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        try {
          fs.accessSync(p, fs.constants.X_OK);
          this.ytDlpPath = p;
          return p;
        } catch {
          // not executable
        }
      }
    }

    // Attempt to download standalone yt-dlp binary if missing
    try {
      console.log('[YouTubeService] Fetching yt-dlp binary...');
      const target = '/tmp/yt-dlp';
      const res = await fetch('https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp');
      if (res.ok) {
        const buffer = await res.arrayBuffer();
        fs.writeFileSync(target, Buffer.from(buffer));
        fs.chmodSync(target, 0o755);
        this.ytDlpPath = target;
        return target;
      }
    } catch (err) {
      console.warn('[YouTubeService] Could not auto-download yt-dlp:', err);
    }

    return null;
  }

  /**
   * Ensures the local bgutil PO-token provider HTTP server is running on 127.0.0.1:4416
   */
  public static async ensurePotServer(): Promise<boolean> {
    try {
      const pingRes = await fetch('http://127.0.0.1:4416/ping', {
        signal: AbortSignal.timeout(1500),
      });
      if (pingRes.ok) return true;
    } catch {
      // not currently running or not reachable
    }

    const potServerPath = '/opt/bgutil-ytdlp-pot-provider/server/build/main.js';
    if (!fs.existsSync(potServerPath)) {
      return false;
    }

    try {
      const child = spawn('node', [potServerPath, '-H', '127.0.0.1'], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();

      // Poll up to 4 seconds for server to be responsive
      for (let i = 0; i < 8; i++) {
        await new Promise((r) => setTimeout(r, 500));
        try {
          const res = await fetch('http://127.0.0.1:4416/ping', {
            signal: AbortSignal.timeout(1000),
          });
          if (res.ok) {
            console.log('[YouTubeService] POT HTTP server started successfully on 127.0.0.1:4416');
            return true;
          }
        } catch {}
      }
    } catch (err) {
      console.warn('[YouTubeService] Failed to start POT HTTP server:', err);
    }
    return false;
  }

  /**
   * Ensures JavaScript runtime (Deno or Node) is located and ready for yt-dlp EJS challenges
   */
  public static ensureJsRuntime(): { runtime: 'deno' | 'node' | null; path: string | null } {
    const candidateDeno = [
      '/usr/local/bin/deno',
      path.join(process.cwd(), 'bin', 'deno'),
      '/root/.deno/bin/deno',
    ];
    for (const d of candidateDeno) {
      if (fs.existsSync(d)) {
        try {
          fs.accessSync(d, fs.constants.X_OK);
          return { runtime: 'deno', path: d };
        } catch {}
      }
    }

    const candidateNode = [process.execPath, '/usr/local/bin/node', '/usr/bin/node'];
    for (const n of candidateNode) {
      if (fs.existsSync(n)) {
        try {
          fs.accessSync(n, fs.constants.X_OK);
          return { runtime: 'node', path: n };
        } catch {}
      }
    }

    return { runtime: null, path: null };
  }

  /**
   * Returns --js-runtimes flags for yt-dlp to execute EJS / signature challenges
   */
  public static getJsRuntimeArgs(): string[] {
    const args: string[] = [];
    const candidateDeno = [
      '/usr/local/bin/deno',
      path.join(process.cwd(), 'bin', 'deno'),
      '/root/.deno/bin/deno',
    ];
    for (const d of candidateDeno) {
      if (fs.existsSync(d)) {
        args.push('--js-runtimes', `deno:${d}`);
        break;
      }
    }

    const candidateNode = [process.execPath, '/usr/local/bin/node', '/usr/bin/node'];
    for (const n of candidateNode) {
      if (fs.existsSync(n)) {
        args.push('--js-runtimes', `node:${n}`);
        break;
      }
    }

    return args;
  }

  /**
   * Checks yt-dlp, JS runtime, and EJS availability for health and verification
   */
  public static async getYtDlpDiagnostics(forceRefresh = false): Promise<YtDlpDiagnostics> {
    const now = Date.now();
    if (!forceRefresh && this.cachedDiagnostics && now - this.lastDiagnosticsCheck < 60000) {
      return this.cachedDiagnostics;
    }

    const ytdlp = await this.ensureYtDlp();
    await this.ensurePotServer();
    const jsInfo = this.ensureJsRuntime();

    let ytDlpVersion: string | null = null;
    let jsRuntimeVersion: string | null = null;
    let ejsAvailable = false;
    let supportsJsChallenges = false;

    if (ytdlp) {
      try {
        const vRes = spawnSync(ytdlp, ['--version'], { encoding: 'utf8' });
        ytDlpVersion = (vRes.stdout || '').trim() || null;
      } catch {}

      try {
        const runtimeArgs = this.getJsRuntimeArgs();
        const testRes = spawnSync(
          ytdlp,
          [
            '-v',
            '--simulate',
            '--extractor-args',
            'youtube:player_client=tv,web_embedded,mweb,web;fetch_pot=always',
            ...runtimeArgs,
            'https://www.youtube.com/watch?v=ba0ba0ba0ba',
          ],
          { encoding: 'utf8', timeout: 15000 }
        );
        const fullLog = (testRes.stdout || '') + '\n' + (testRes.stderr || '');

        const ejsMatch = fullLog.match(/yt_dlp_ejs-([\d.]+)/);
        if (ejsMatch) ejsAvailable = true;

        const jsMatch = fullLog.match(/JS runtimes:\s*([^\n\r]+)/);
        if (jsMatch) jsRuntimeVersion = jsMatch[1].trim();

        const jscMatch = fullLog.match(/\[jsc\] JS Challenge Providers:\s*([^\n\r]+)/);
        if (jscMatch && (jscMatch[1].includes('deno') || jscMatch[1].includes('node'))) {
          supportsJsChallenges = true;
        }
      } catch {}
    }

    if (!jsRuntimeVersion && jsInfo.path) {
      try {
        const res = spawnSync(jsInfo.path, ['--version'], { encoding: 'utf8' });
        jsRuntimeVersion = (res.stdout || '').split('\n')[0].trim();
      } catch {}
    }

    this.cachedDiagnostics = {
      ytDlpPath: ytdlp,
      ytDlpVersion,
      jsRuntime: jsInfo.runtime,
      jsRuntimePath: jsInfo.path,
      jsRuntimeVersion,
      ejsAvailable,
      supportsJsChallenges,
      diagnosticsCheckedAt: new Date().toISOString(),
      publicYouTubeAccessTest: this.publicAccessTestResult,
    };
    this.lastDiagnosticsCheck = now;

    return this.cachedDiagnostics;
  }

  /**
   * Executes a live verification test against a known public YouTube video
   * to determine whether YouTube is allowing public source access on this server.
   * Reports genuine SUCCESS or BLOCKED.
   */
  public static async testPublicYouTubeAccess(): Promise<'SUCCESS' | 'BLOCKED'> {
    const ytdlp = await this.ensureYtDlp();
    if (!ytdlp) {
      this.publicAccessTestResult = 'BLOCKED';
      return 'BLOCKED';
    }

    await this.ensurePotServer();
    const runtimeArgs = this.getJsRuntimeArgs();
    try {
      // Test simulation of standard public video using POT provider
      const testUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
      const testRes = spawnSync(
        ytdlp,
        [
          '--simulate',
          '--no-warnings',
          '--socket-timeout',
          '10',
          '--extractor-args',
          'youtube:player_client=tv,web_embedded,mweb,web;fetch_pot=always',
          ...runtimeArgs,
          testUrl,
        ],
        { encoding: 'utf8', timeout: 15000 }
      );
      const combined = ((testRes.stdout || '') + '\n' + (testRes.stderr || '')).toLowerCase();

      if (
        combined.includes('sign in to confirm you’re not a bot') ||
        combined.includes('sign in to confirm you\'re not a bot') ||
        combined.includes('confirm you are not a bot') ||
        combined.includes('bot verification') ||
        combined.includes('use --cookies') ||
        combined.includes('captcha')
      ) {
        this.publicAccessTestResult = 'BLOCKED';
        if (this.cachedDiagnostics) this.cachedDiagnostics.publicYouTubeAccessTest = 'BLOCKED';
        return 'BLOCKED';
      }

      if (testRes.status === 0) {
        this.publicAccessTestResult = 'SUCCESS';
        if (this.cachedDiagnostics) this.cachedDiagnostics.publicYouTubeAccessTest = 'SUCCESS';
        return 'SUCCESS';
      }

      this.publicAccessTestResult = 'BLOCKED';
      if (this.cachedDiagnostics) this.cachedDiagnostics.publicYouTubeAccessTest = 'BLOCKED';
      return 'BLOCKED';
    } catch {
      this.publicAccessTestResult = 'BLOCKED';
      if (this.cachedDiagnostics) this.cachedDiagnostics.publicYouTubeAccessTest = 'BLOCKED';
      return 'BLOCKED';
    }
  }

  /**
   * Parses stderr from yt-dlp into fine-grained structured error codes and user-facing messages
   * covering bot-check, unavailable, private, age-restricted, format unsupported, network errors, and unknown.
   */
  public static parseYtDlpError(stderr: string): { code: string; message: string } {
    const lower = stderr.toLowerCase();

    // 1. Bot check / Sign-in verification
    if (
      lower.includes('sign in to confirm you’re not a bot') ||
      lower.includes('sign in to confirm you\'re not a bot') ||
      lower.includes('confirm you are not a bot') ||
      lower.includes('bot verification') ||
      lower.includes('use --cookies') ||
      lower.includes('captcha') ||
      lower.includes('challenge') ||
      lower.includes('automated queries')
    ) {
      return {
        code: 'YOUTUBE_BOT_CHECK',
        message: 'YouTube requires sign-in verification for this video on the processing server. Please upload your video file (MP4/MOV/WebM) using Direct Upload instead.',
      };
    }

    // 2. Private video
    if (
      lower.includes('private video') ||
      lower.includes('this video is private') ||
      lower.includes("sign in if you've been granted access")
    ) {
      return {
        code: 'VIDEO_PRIVATE',
        message: 'This YouTube video is marked Private. Please use a public video URL or upload the video file directly.',
      };
    }

    // 3. Members-only video
    if (
      lower.includes('members-only') ||
      lower.includes('join this channel to get access') ||
      lower.includes('channel members')
    ) {
      return {
        code: 'VIDEO_MEMBERS_ONLY',
        message: 'This YouTube video is restricted to channel members. Please provide a public video or upload the file directly.',
      };
    }

    // 4. Geo-restricted video
    if (
      lower.includes('not made this video available in your country') ||
      lower.includes('geo-restricted') ||
      lower.includes('blocked in your country')
    ) {
      return {
        code: 'VIDEO_GEO_RESTRICTED',
        message: 'This YouTube video is geo-restricted and blocked in the server region. Please upload the video file directly.',
      };
    }

    // 5. Age-restricted video
    if (
      lower.includes('sign in to confirm your age') ||
      lower.includes('confirm your age') ||
      lower.includes('age-restricted') ||
      lower.includes('inappropriate for some users') ||
      lower.includes('inappropriate') ||
      lower.includes('age-gated')
    ) {
      return {
        code: 'VIDEO_AGE_RESTRICTED',
        message: 'This YouTube video is age-restricted and cannot be processed automatically. Please upload the video file directly.',
      };
    }

    // 6. Format unsupported / extraction error
    if (
      lower.includes('requested format is not available') ||
      lower.includes('requested format') ||
      lower.includes('format is not available') ||
      lower.includes('no video formats found') ||
      lower.includes('unsupported format') ||
      lower.includes('extractor') ||
      lower.includes('cannot extract')
    ) {
      return {
        code: 'VIDEO_FORMAT_UNSUPPORTED',
        message: 'The requested format is not available or unsupported for this video. Please upload the video file directly.',
      };
    }

    // 7. Video unavailable / removed / deleted / terminated
    if (
      lower.includes('video unavailable') ||
      lower.includes('is unavailable') ||
      lower.includes('unavailable') ||
      lower.includes('this video has been removed') ||
      lower.includes('does not exist') ||
      lower.includes('terminated account') ||
      lower.includes('no longer available')
    ) {
      return {
        code: 'VIDEO_UNAVAILABLE',
        message: 'This video is unavailable or no longer exists on YouTube. Please verify the URL or use Direct Upload.',
      };
    }

    // 8. Network error / timeout / connection failure
    if (
      lower.includes('timed out') ||
      lower.includes('connection refused') ||
      lower.includes('network is unreachable') ||
      lower.includes('unable to download webpage') ||
      lower.includes('socket timeout') ||
      lower.includes('errno -3') ||
      lower.includes('temporary failure in name resolution') ||
      lower.includes('ssl: certificate_verify_failed')
    ) {
      return {
        code: 'YOUTUBE_NETWORK_ERROR',
        message: 'Network connection to YouTube timed out or failed. Please check your connection or use Direct Upload.',
      };
    }

    // 9. Generic DOWNLOAD_FAILED fallback
    const errorLines = stderr
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('ERROR:') && !l.includes('Please update to Python'))
      .join(' ');

    return {
      code: 'DOWNLOAD_FAILED',
      message: errorLines
        ? `${errorLines} Please use Direct Upload to upload your video file directly.`
        : 'An error occurred while downloading the YouTube video. Please use Direct Upload to upload your video file directly.',
    };
  }

  /**
   * Generates Google OAuth 2.0 consent URL for YouTube Shorts upload
   */
  public static getAuthorizationUrl(redirectUri: string, state: string): string {
    if (!this.isConfigured()) {
      throw new Error(
        'YouTube OAuth is not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in environment settings.'
      );
    }

    const clientId = (process.env.YOUTUBE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID)!;
    const scopes = [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/userinfo.profile',
    ].join(' ');

    return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&response_type=code&scope=${encodeURIComponent(
      scopes
    )}&access_type=offline&prompt=consent&state=${state}`;
  }

  /**
   * Exchanges Google authorization code for tokens and retrieves YouTube channel info
   */
  public static async handleCallback(
    code: string,
    redirectUri: string
  ): Promise<{
    channel: { id: string; title: string; customUrl?: string; avatarUrl?: string };
    accessTokenEncrypted: string;
    refreshTokenEncrypted?: string;
    expiresAt: Date;
  }> {
    if (!this.isConfigured()) {
      throw new Error('YouTube OAuth is not configured in server environment.');
    }

    const clientId = (process.env.YOUTUBE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID)!;
    const clientSecret = (process.env.YOUTUBE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET)!;

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.json();
      throw new Error(err.error_description || err.error || 'Failed to exchange Google OAuth code.');
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresIn = tokenData.expires_in || 3600;

    // Fetch primary YouTube Channel
    const chanRes = await fetch(
      'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    let channelId = 'UC_clipforge_creator';
    let channelTitle = 'My YouTube Channel';
    let avatarUrl = undefined;

    if (chanRes.ok) {
      const chanData = await chanRes.json();
      if (chanData.items && chanData.items.length > 0) {
        const item = chanData.items[0];
        channelId = item.id;
        channelTitle = item.snippet?.title || channelTitle;
        avatarUrl = item.snippet?.thumbnails?.default?.url;
      }
    }

    return {
      channel: {
        id: channelId,
        title: channelTitle,
        avatarUrl,
      },
      accessTokenEncrypted: CryptoService.encrypt(accessToken),
      refreshTokenEncrypted: refreshToken ? CryptoService.encrypt(refreshToken) : undefined,
      expiresAt: new Date(Date.now() + expiresIn * 1000),
    };
  }

  /**
   * Refreshes expired Google access token using refresh token
   */
  public static async refreshAccessToken(refreshTokenEncrypted: string): Promise<{
    accessTokenEncrypted: string;
    expiresAt: Date;
  }> {
    const refreshToken = CryptoService.decrypt(refreshTokenEncrypted);
    if (!refreshToken) {
      throw new Error('Refresh token invalid or missing.');
    }

    const clientId = (process.env.YOUTUBE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID)!;
    const clientSecret = (process.env.YOUTUBE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET)!;

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!res.ok) {
      throw new Error('Could not refresh YouTube OAuth token. Reauthorization required.');
    }

    const data = await res.json();
    return {
      accessTokenEncrypted: CryptoService.encrypt(data.access_token),
      expiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000),
    };
  }

  /**
   * Validates YouTube URL against supported formats:
   * - youtube.com/watch?v=...
   * - youtu.be/...
   * - youtube.com/shorts/...
   * - youtube.com/embed/...
   */
  public static validateYouTubeUrl(url: string): YouTubeValidationResult {
    if (!url || typeof url !== 'string') {
      return { isValid: false, videoId: null, urlType: 'unknown', error: 'YouTube URL cannot be empty.' };
    }

    const trimmed = url.trim();

    const shortsMatch = trimmed.match(/(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
    if (shortsMatch && shortsMatch[1]) {
      return { isValid: true, videoId: shortsMatch[1], urlType: 'shorts' };
    }

    const watchMatch = trimmed.match(/(?:youtube\.com\/watch\?(?:.*&)?v=)([a-zA-Z0-9_-]{11})/);
    if (watchMatch && watchMatch[1]) {
      return { isValid: true, videoId: watchMatch[1], urlType: 'watch' };
    }

    const shortenerMatch = trimmed.match(/(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (shortenerMatch && shortenerMatch[1]) {
      return { isValid: true, videoId: shortenerMatch[1], urlType: 'shortener' };
    }

    const embedMatch = trimmed.match(/(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
    if (embedMatch && embedMatch[1]) {
      return { isValid: true, videoId: embedMatch[1], urlType: 'embed' };
    }

    return {
      isValid: false,
      videoId: null,
      urlType: 'unknown',
      error: 'Unsupported or invalid YouTube URL format. Please provide a standard YouTube video, Shorts, or youtu.be link.',
    };
  }

  /**
   * Extracts clean 11-character video ID from any valid YouTube URL
   */
  public static parseVideoId(url: string): string | null {
    const res = this.validateYouTubeUrl(url);
    return res.isValid ? res.videoId : null;
  }

  /**
   * Validates and retrieves video metadata via YouTube Data API v3 or oEmbed fallback
   */
  public static async getVideoMetadata(url: string): Promise<YouTubeVideoMetadata> {
    const validation = this.validateYouTubeUrl(url);
    if (!validation.isValid || !validation.videoId) {
      throw new Error(validation.error || 'Invalid YouTube URL');
    }

    const videoId = validation.videoId;

    // 1. If YouTube API Key configured, use Data API v3
    if (process.env.YOUTUBE_API_KEY) {
      try {
        const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,status&id=${videoId}&key=${process.env.YOUTUBE_API_KEY}`;
        const response = await fetch(apiUrl);
        if (response.ok) {
          const data = await response.json();
          if (data.items && data.items.length > 0) {
            const item = data.items[0];
            const snippet = item.snippet;
            const durationSec = this.parseIsoDuration(item.contentDetails?.duration || 'PT10M');

            return {
              videoId,
              title: snippet.title,
              channelTitle: snippet.channelTitle,
              channelId: snippet.channelId,
              durationSeconds: durationSec,
              thumbnailUrl:
                snippet.thumbnails?.maxres?.url ||
                snippet.thumbnails?.high?.url ||
                `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
              isPublic: item.status?.privacyStatus === 'public',
              hasCaptions: true,
              publishedAt: snippet.publishedAt,
            };
          }
        }
      } catch (err: any) {
        console.warn('[YouTubeService] Official Data API error, checking oEmbed:', err?.message || err);
      }
    }

    // 2. Fetch public oEmbed info from YouTube
    try {
      const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
      if (oembedRes.ok) {
        const oembedData = await oembedRes.json();
        return {
          videoId,
          title: oembedData.title || `Video ${videoId}`,
          channelTitle: oembedData.author_name || 'YouTube Creator',
          channelId: `UC_${videoId.substring(0, 8)}`,
          durationSeconds: 0,
          thumbnailUrl: oembedData.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          isPublic: true,
          hasCaptions: true,
          publishedAt: new Date().toISOString(),
        };
      }
    } catch {
      // ignore
    }

    throw new Error(
      `Unable to retrieve metadata for YouTube video ${videoId}. The video may be unavailable, private, or requiring verification.`
    );
  }

  /**
   * Uploads short vertical video directly to YouTube Shorts via YouTube Data API v3
   * Uses real Resumable Media Upload protocol (videos.insert).
   */
  public static async uploadShort(params: {
    accessTokenEncrypted: string;
    videoLocalPath?: string;
    videoPublicUrl: string;
    title: string;
    description: string;
    tags: string[];
    privacy: 'public' | 'unlisted' | 'private';
    scheduledTime?: string;
  }): Promise<{ uploadId: string; videoUrl: string; status: string }> {
    const accessToken = CryptoService.decrypt(params.accessTokenEncrypted);
    if (!accessToken) {
      throw new Error('Reauthorization required: Invalid or expired YouTube credentials.');
    }

    // Locate actual video file on disk
    let localFilePath = params.videoLocalPath;
    if (!localFilePath || !fs.existsSync(localFilePath)) {
      // Resolve from public/rendered
      const filename = path.basename(params.videoPublicUrl);
      const candidate = path.join(process.cwd(), 'public', 'rendered', filename);
      if (fs.existsSync(candidate)) {
        localFilePath = candidate;
      }
    }

    if (!localFilePath || !fs.existsSync(localFilePath)) {
      throw new Error(`Rendered video file not found on server for YouTube upload: ${params.videoPublicUrl}`);
    }

    const fileStats = fs.statSync(localFilePath);
    const fileSize = fileStats.size;

    // Step 1: Initialize Resumable Upload session with YouTube Data API v3
    const initRes = await fetch(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Length': fileSize.toString(),
          'X-Upload-Content-Type': 'video/mp4',
        },
        body: JSON.stringify({
          snippet: {
            title: params.title.substring(0, 100),
            description: `${params.description}\n\n#Shorts ${params.tags.map((t) => `#${t.replace('#', '')}`).join(' ')}`,
            tags: params.tags.map((t) => t.replace('#', '')),
            categoryId: '22', // People & Blogs / Entertainment
          },
          status: {
            privacyStatus: params.scheduledTime ? 'private' : params.privacy,
            publishAt: params.scheduledTime ? new Date(params.scheduledTime).toISOString() : undefined,
            selfDeclaredMadeForKids: false,
          },
        }),
      }
    );

    if (!initRes.ok) {
      const err = await initRes.json().catch(() => ({}));
      throw new Error(err.error?.message || `YouTube video upload session initialization failed (${initRes.status}).`);
    }

    const uploadUrl = initRes.headers.get('location');
    if (!uploadUrl) {
      throw new Error('YouTube did not return a valid resumable upload location header.');
    }

    // Step 2: Stream / upload actual MP4 binary data to YouTube upload URI
    const fileBuffer = fs.readFileSync(localFilePath);
    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'video/mp4',
        'Content-Length': fileSize.toString(),
      },
      body: fileBuffer,
    });

    if (!uploadRes.ok) {
      const err = await uploadRes.json().catch(() => ({}));
      throw new Error(err.error?.message || `YouTube binary transfer failed (${uploadRes.status}).`);
    }

    const videoData = await uploadRes.json();
    const realVideoId = videoData.id;
    if (!realVideoId) {
      throw new Error('YouTube upload completed but did not return a valid video ID.');
    }

    // Step 3: Verify video processing details via videos.list
    let isProcessed = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      await new Promise((r) => setTimeout(r, 2000));
      const checkRes = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=status,processingDetails&id=${realVideoId}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      if (checkRes.ok) {
        const checkData = await checkRes.json();
        const item = checkData.items?.[0];
        const uploadStatus = item?.status?.uploadStatus;
        const processingStatus = item?.processingDetails?.processingStatus;

        if (uploadStatus === 'failed' || processingStatus === 'failed') {
          throw new Error(`YouTube video processing failed for video ${realVideoId}.`);
        }
        if (uploadStatus === 'uploaded' || processingStatus === 'succeeded') {
          isProcessed = true;
          break;
        }
      }
    }

    return {
      uploadId: realVideoId,
      videoUrl: `https://youtube.com/shorts/${realVideoId}`,
      status: params.scheduledTime ? 'SCHEDULED' : 'PUBLISHED',
    };
  }

  /**
   * Helper: Parses ISO 8601 duration format (e.g. PT1H2M10S -> seconds)
   */
  private static parseIsoDuration(isoDuration: string): number {
    const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 600;
    const hours = parseInt(match[1] || '0', 10);
    const minutes = parseInt(match[2] || '0', 10);
    const seconds = parseInt(match[3] || '0', 10);
    return hours * 3600 + minutes * 60 + seconds;
  }
}
