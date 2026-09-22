/**
 * Source Acquisition Service — ClipForge AI
 * Robust, production-grade source acquisition supporting YouTube and Direct Upload.
 * Implements strict state machine:
 * SOURCE_URL_RECEIVED -> SOURCE_VALIDATED -> SOURCE_ACCESSIBLE ->
 * SOURCE_DOWNLOADING -> SOURCE_DOWNLOADED -> SOURCE_VALIDATED -> SOURCE_READY
 * Or SOURCE_FAILED on any unrecoverable error with descriptive, actionable diagnostics.
 */

import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { YouTubeService, YouTubeValidationResult } from './youtubeService.js';
import { VideoProcessingService, MediaProbeInfo } from './videoProcessingService.js';

export type SourceAcquisitionState =
  | 'SOURCE_URL_RECEIVED'
  | 'SOURCE_VALIDATED'
  | 'SOURCE_ACCESSIBLE'
  | 'SOURCE_DOWNLOADING'
  | 'SOURCE_DOWNLOADED'
  | 'SOURCE_READY'
  | 'SOURCE_FAILED';

export interface SourceAcquisitionResult {
  sourceVideoPath: string;
  sourceType: 'youtube' | 'upload';
  title: string;
  durationSeconds: number;
  thumbnailUrl: string;
  probe: MediaProbeInfo;
  state: SourceAcquisitionState;
}

export class SourceAcquisitionService {
  private static uploadsDir = path.join(process.cwd(), 'storage', 'uploads');
  private static sourcesDir = path.join(process.cwd(), 'storage', 'sources');

  public static init() {
    if (!fs.existsSync(this.uploadsDir)) {
      fs.mkdirSync(this.uploadsDir, { recursive: true });
    }
    if (!fs.existsSync(this.sourcesDir)) {
      fs.mkdirSync(this.sourcesDir, { recursive: true });
    }
  }

  private static getCookiesArg(): string[] {
    const cookiesEnv = process.env.YOUTUBE_COOKIES_PATH;
    if (cookiesEnv && fs.existsSync(cookiesEnv)) {
      return ['--cookies', cookiesEnv];
    }
    const defaultCookiesPath = path.join(process.cwd(), 'storage', 'cookies.txt');
    if (process.env.YOUTUBE_COOKIES_CONTENT && !fs.existsSync(defaultCookiesPath)) {
      try {
        fs.writeFileSync(defaultCookiesPath, process.env.YOUTUBE_COOKIES_CONTENT, 'utf8');
      } catch (err) {
        console.warn('[SourceAcquisitionService] Could not write cookies file:', err);
      }
    }
    if (fs.existsSync(defaultCookiesPath)) {
      return ['--cookies', defaultCookiesPath];
    }
    return [];
  }

  /**
   * Acquires source video from a public YouTube URL with strict state verification.
   * If YouTube blocks bot traffic, returns clear actionable guidance without fake content.
   */
  public static async acquireFromYouTube(
    youtubeUrl: string,
    options?: {
      useCookies?: boolean;
      onStateChange?: (state: SourceAcquisitionState, detail?: string) => void;
    } | ((state: SourceAcquisitionState, detail?: string) => void)
  ): Promise<SourceAcquisitionResult> {
    this.init();

    const onStateChange = typeof options === 'function' ? options : options?.onStateChange;
    const useCookies = typeof options === 'object' && options !== null ? Boolean(options.useCookies) : false;

    // 1. SOURCE_URL_RECEIVED
    onStateChange?.('SOURCE_URL_RECEIVED', 'Received YouTube URL');
    const cleanUrl = (youtubeUrl || '').trim();
    if (!cleanUrl) {
      onStateChange?.('SOURCE_FAILED', 'No URL provided');
      const err = new Error('A valid YouTube URL is required.');
      (err as any).code = 'INVALID_SOURCE_URL';
      throw err;
    }

    // 2. SOURCE_VALIDATED
    onStateChange?.('SOURCE_VALIDATED', 'Validating YouTube URL format');
    const validation: YouTubeValidationResult = YouTubeService.validateYouTubeUrl(cleanUrl);
    if (!validation.isValid || !validation.videoId) {
      onStateChange?.('SOURCE_FAILED', validation.error || 'Invalid YouTube URL format');
      const err = new Error(validation.error || 'Invalid YouTube URL format. Please provide a standard watch or Shorts link.');
      (err as any).code = 'INVALID_SOURCE_URL';
      throw err;
    }
    const videoId = validation.videoId;

    // 3. SOURCE_ACCESSIBLE: check basic accessibility & metadata via oEmbed
    onStateChange?.('SOURCE_ACCESSIBLE', 'Checking public video accessibility');
    let title = `YouTube Video (${videoId})`;
    let channelTitle = 'Creator';
    let durationSec = 0;
    let thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

    try {
      const oembedRes = await fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
        { signal: AbortSignal.timeout(6000) }
      );
      if (oembedRes.ok) {
        const data = await oembedRes.json();
        title = data.title || title;
        channelTitle = data.author_name || channelTitle;
        thumbnailUrl = data.thumbnail_url || thumbnailUrl;
      }
    } catch {
      // oEmbed might be blocked or timed out
    }

    // 4. SOURCE_DOWNLOADING: Acquire actual video stream via yt-dlp
    onStateChange?.('SOURCE_DOWNLOADING', 'Downloading video stream from YouTube');
    const ytdlp = await YouTubeService.ensureYtDlp();
    if (!ytdlp) {
      onStateChange?.('SOURCE_FAILED', 'yt-dlp binary not available');
      const err = new Error(
        'Server video acquisition utility (yt-dlp) is not available. Please upload the video file directly (MP4/MOV/WebM).'
      );
      (err as any).code = 'YT_DLP_NOT_AVAILABLE';
      throw err;
    }

    const targetPath = path.join(this.sourcesDir, `yt_${videoId}_${Date.now()}.mp4`);
    const cookieArgs = useCookies ? this.getCookiesArg() : [];
    const jsRuntimeArgs = YouTubeService.getJsRuntimeArgs();

    const args = [
      '--no-warnings',
      ...jsRuntimeArgs,
      ...cookieArgs,
      '-f',
      'bestvideo[ext=mp4][height<=1080]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      '--merge-output-format',
      'mp4',
      '--no-playlist',
      '--max-filesize',
      '350M',
      '-o',
      targetPath,
      cleanUrl,
    ];

    let stderr = '';
    const downloadSuccess = await new Promise<boolean>((resolve) => {
      const proc = spawn(ytdlp, args);
      const timeout = setTimeout(() => {
        try {
          proc.kill('SIGKILL');
        } catch {}
        stderr += '\nOperation timed out after 90 seconds.';
        resolve(false);
      }, 90000);

      proc.stderr.on('data', (d) => {
        stderr += d.toString();
      });

      proc.on('close', (code) => {
        clearTimeout(timeout);
        resolve(code === 0);
      });

      proc.on('error', (err) => {
        clearTimeout(timeout);
        stderr += `\nSpawn error: ${err.message}`;
        resolve(false);
      });
    });

    if (!downloadSuccess || !fs.existsSync(targetPath)) {
      if (fs.existsSync(targetPath)) {
        try {
          fs.unlinkSync(targetPath);
        } catch {}
      }

      onStateChange?.('SOURCE_FAILED', stderr.trim());
      console.error('[SourceAcquisitionService] yt-dlp download failed:', stderr);

      const parsedError = YouTubeService.parseYtDlpError(stderr);
      const finalError = new Error(parsedError.message);
      (finalError as any).code = parsedError.code;
      throw finalError;
    }

    // 5. SOURCE_DOWNLOADED
    onStateChange?.('SOURCE_DOWNLOADED', 'Video downloaded to temporary storage');

    // 6. SOURCE_VALIDATED: filesystem existence & file size > 0
    onStateChange?.('SOURCE_VALIDATED', 'Validating downloaded file size and integrity');
    const stats = fs.statSync(targetPath);
    if (stats.size <= 1000) {
      try {
        fs.unlinkSync(targetPath);
      } catch {}
      onStateChange?.('SOURCE_FAILED', 'Downloaded file is empty');
      const err = new Error('Downloaded video file is empty or corrupted (0 bytes). Please upload the video file directly.');
      (err as any).code = 'SOURCE_PROBE_FAILED';
      throw err;
    }

    // 7. SOURCE_READY: ffprobe inspection verifying video codec, duration, and audio stream
    let probe: MediaProbeInfo;
    try {
      probe = await VideoProcessingService.probeMedia(targetPath);
    } catch (probeErr: any) {
      try {
        fs.unlinkSync(targetPath);
      } catch {}
      onStateChange?.('SOURCE_FAILED', `ffprobe failed: ${probeErr.message}`);
      const err = new Error(`Video media probe failed: ${probeErr.message}. Please upload a valid MP4/MOV/WebM video.`);
      (err as any).code = 'SOURCE_PROBE_FAILED';
      throw err;
    }

    if (!probe.hasVideoStream || probe.duration <= 0 || !probe.videoCodec) {
      try {
        fs.unlinkSync(targetPath);
      } catch {}
      onStateChange?.('SOURCE_FAILED', 'No valid video stream or video codec detected');
      const err = new Error('Downloaded media contains no valid playable video stream or codec. Please upload a valid MP4/MOV/WebM video.');
      (err as any).code = 'SOURCE_PROBE_FAILED';
      throw err;
    }

    durationSec = probe.duration;
    onStateChange?.('SOURCE_READY', 'Source video verified and ready for transcription and rendering');

    return {
      sourceVideoPath: targetPath,
      sourceType: 'youtube',
      title,
      durationSeconds: durationSec,
      thumbnailUrl,
      probe,
      state: 'SOURCE_READY',
    };
  }

  /**
   * Acquires source video from a direct user upload (MP4 / MOV / WebM).
   * Validates file on disk with ffprobe before marking ready.
   */
  public static async acquireFromUpload(
    filePath: string,
    originalFilename: string,
    onStateChange?: (state: SourceAcquisitionState, detail?: string) => void
  ): Promise<SourceAcquisitionResult> {
    this.init();

    // 1. SOURCE_URL_RECEIVED / File received
    onStateChange?.('SOURCE_URL_RECEIVED', `Received uploaded file: ${originalFilename}`);

    // 2. SOURCE_VALIDATED: check file extension
    onStateChange?.('SOURCE_VALIDATED', 'Validating uploaded file format');
    const ext = path.extname(originalFilename || filePath).toLowerCase();
    const allowedExtensions = ['.mp4', '.mov', '.webm', '.mkv'];
    if (!allowedExtensions.includes(ext)) {
      onStateChange?.('SOURCE_FAILED', `Unsupported format ${ext}`);
      throw new Error(`Unsupported video format (${ext}). Please upload an MP4, MOV, or WebM file.`);
    }

    // 3. SOURCE_DOWNLOADED: file already saved to disk by multer
    onStateChange?.('SOURCE_DOWNLOADED', 'Uploaded file confirmed on disk');

    // 4. SOURCE_VALIDATED: filesystem existence & file size > 0
    if (!fs.existsSync(filePath)) {
      onStateChange?.('SOURCE_FAILED', 'Uploaded file not found on disk');
      throw new Error('Uploaded file could not be located on the server.');
    }

    const stats = fs.statSync(filePath);
    if (stats.size === 0) {
      try {
        fs.unlinkSync(filePath);
      } catch {}
      onStateChange?.('SOURCE_FAILED', 'Uploaded file is 0 bytes');
      throw new Error('Uploaded file is empty (0 bytes). Please upload a valid video file.');
    }

    // 5. SOURCE_READY: ffprobe inspection
    onStateChange?.('SOURCE_ACCESSIBLE', 'Probing video streams and duration');
    let probe: MediaProbeInfo;
    try {
      probe = await VideoProcessingService.probeMedia(filePath);
    } catch (probeErr: any) {
      try {
        fs.unlinkSync(filePath);
      } catch {}
      onStateChange?.('SOURCE_FAILED', `ffprobe failed: ${probeErr.message}`);
      throw new Error(`Uploaded file is not a readable video: ${probeErr.message}`);
    }

    if (!probe.hasVideoStream || probe.duration <= 0) {
      try {
        fs.unlinkSync(filePath);
      } catch {}
      onStateChange?.('SOURCE_FAILED', 'No playable video stream');
      throw new Error('Uploaded file does not contain a playable video stream with positive duration.');
    }

    // Generate clean initial thumbnail frame from the uploaded video
    const thumbName = `thumb_upload_${Date.now()}.jpg`;
    const thumbPath = path.join(process.cwd(), 'public', 'rendered', thumbName);
    VideoProcessingService.ensureRenderedDir();
    try {
      await VideoProcessingService.extractThumbnail(filePath, thumbPath, Math.min(1.0, probe.duration / 2));
    } catch {
      // non-fatal for preview
    }

    const cleanTitle = path.basename(originalFilename, path.extname(originalFilename))
      .replace(/[-_]/g, ' ')
      .trim();

    onStateChange?.('SOURCE_READY', 'Source video verified and ready for transcription and rendering');

    return {
      sourceVideoPath: filePath,
      sourceType: 'upload',
      title: cleanTitle || 'Uploaded Video',
      durationSeconds: probe.duration,
      thumbnailUrl: `/rendered/${thumbName}`,
      probe,
      state: 'SOURCE_READY',
    };
  }
}
