/**
 * Source Acquisition Service — ClipForge AI
 *
 * Single-Acquisition Architecture:
 * YouTube URL -> Acquire actual video ONCE (source.mp4) -> Verify with FFprobe
 * -> Audio extracted locally using FFmpeg -> Gemini transcription -> Gemini clip selection
 * -> FFmpeg renders clips from the SAME source.mp4 -> Cleanup temporary media.
 *
 * State Progression:
 * SOURCE_URL_RECEIVED -> SOURCE_VALIDATED -> SOURCE_ACCESSIBLE ->
 * SOURCE_DOWNLOADING -> SOURCE_DOWNLOADED -> SOURCE_AUDIO_EXTRACTED ->
 * SOURCE_TRANSCRIBED -> AI_ANALYZED -> CLIPS_RENDERING -> COMPLETED
 * (or SOURCE_FAILED on real error).
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
  | 'SOURCE_AUDIO_EXTRACTED'
  | 'SOURCE_TRANSCRIBED'
  | 'AI_ANALYZED'
  | 'CLIPS_RENDERING'
  | 'COMPLETED'
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
  private static tempDir = path.join(process.cwd(), 'storage', 'sources');

  public static init() {
    if (!fs.existsSync(this.uploadsDir)) {
      fs.mkdirSync(this.uploadsDir, { recursive: true });
    }
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Safely removes temporary media files
   */
  public static cleanTemporaryFile(filePath?: string | null) {
    if (!filePath) return;
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (err) {
      console.warn(`[SourceAcquisition] Temporary cleanup notice for ${filePath}:`, err);
    }
  }

  /**
   * Acquires the ACTUAL source video from YouTube ONCE.
   * Downloads video once, verifies with ffprobe, and prepares it for local reuse.
   */
  public static async acquireYouTubeVideo(
    youtubeUrl: string,
    onStateChange?: (state: SourceAcquisitionState, detail?: string) => void
  ): Promise<SourceAcquisitionResult> {
    this.init();

    // 1. SOURCE_URL_RECEIVED
    onStateChange?.('SOURCE_URL_RECEIVED', 'Received YouTube URL');
    const cleanUrl = (youtubeUrl || '').trim();
    if (!cleanUrl) {
      onStateChange?.('SOURCE_FAILED', 'No URL provided');
      const err = new Error('A valid YouTube URL is required.');
      (err as any).code = 'URL_INVALID';
      throw err;
    }

    // 2. SOURCE_VALIDATED
    onStateChange?.('SOURCE_VALIDATED', 'Validating YouTube URL format');
    const validation: YouTubeValidationResult = YouTubeService.validateYouTubeUrl(cleanUrl);
    if (!validation.isValid || !validation.videoId) {
      onStateChange?.('SOURCE_FAILED', validation.error || 'Invalid YouTube URL format');
      const err = new Error(
        validation.error || 'Unsupported YouTube URL format. Please provide a standard YouTube video, Shorts, or youtu.be link.'
      );
      (err as any).code = 'URL_INVALID';
      throw err;
    }
    const videoId = validation.videoId;

    // 3. SOURCE_ACCESSIBLE: Fetch public video metadata via oEmbed
    onStateChange?.('SOURCE_ACCESSIBLE', 'Checking public video accessibility');
    let title = `YouTube Video (${videoId})`;
    let channelTitle = 'Creator';
    let thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

    try {
      const oembedRes = await fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (oembedRes.ok) {
        const data = await oembedRes.json();
        title = data.title || title;
        channelTitle = data.author_name || channelTitle;
        thumbnailUrl = data.thumbnail_url || thumbnailUrl;
      }
    } catch {
      // Non-fatal if oEmbed times out
    }

    // 4. SOURCE_DOWNLOADING: Acquire actual source video ONCE using yt-dlp
    onStateChange?.('SOURCE_DOWNLOADING', 'Acquiring source video from YouTube...');
    const ytdlp = await YouTubeService.ensureYtDlp();
    if (!ytdlp) {
      onStateChange?.('SOURCE_FAILED', 'yt-dlp binary not available');
      const err = new Error(
        'Server video acquisition utility is not available. Please upload the video file directly (MP4/MOV/WebM).'
      );
      (err as any).code = 'YT_DLP_NOT_AVAILABLE';
      throw err;
    }

    const tempVideoPath = path.join(this.tempDir, `yt_source_${videoId}_${Date.now()}.mp4`);
    const jsRuntimeArgs = YouTubeService.getJsRuntimeArgs();

    const args = [
      '--no-warnings',
      '--socket-timeout',
      '20',
      '--extractor-args',
      'youtube:player_client=tv,web_embedded,mweb,web',
      ...jsRuntimeArgs,
      '-f',
      'bestvideo[ext=mp4][height<=1080]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      '--merge-output-format',
      'mp4',
      '--no-playlist',
      '--max-filesize',
      '500M',
      '-o',
      tempVideoPath,
      cleanUrl,
    ];

    let stderr = '';
    const downloadSuccess = await new Promise<boolean>((resolve) => {
      const proc = spawn(ytdlp, args);
      const timeout = setTimeout(() => {
        try {
          proc.kill('SIGKILL');
        } catch {}
        stderr += '\nVideo acquisition timed out after 90 seconds.';
        resolve(false);
      }, 90000);

      // Consume stdout so pipe buffer does not freeze
      proc.stdout.on('data', () => {});

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

    if (!downloadSuccess || !fs.existsSync(tempVideoPath)) {
      this.cleanTemporaryFile(tempVideoPath);
      onStateChange?.('SOURCE_FAILED', stderr.trim());

      const parsedError = YouTubeService.parseYtDlpError(stderr);
      console.warn(`[SourceAcquisitionService] Video acquisition notice (${parsedError.code}): ${parsedError.message}`);

      const finalError = new Error(parsedError.message);
      (finalError as any).code = parsedError.code;
      throw finalError;
    }

    // 5. SOURCE_DOWNLOADED: Verify actual video integrity with ffprobe
    const stats = fs.statSync(tempVideoPath);
    if (stats.size <= 1000) {
      this.cleanTemporaryFile(tempVideoPath);
      onStateChange?.('SOURCE_FAILED', 'Acquired video file is empty');
      const err = new Error('Acquired video file is empty (0 bytes). Please upload the video file directly.');
      (err as any).code = 'SOURCE_PROBE_FAILED';
      throw err;
    }

    let probe: MediaProbeInfo;
    try {
      probe = await VideoProcessingService.probeMedia(tempVideoPath);
    } catch (probeErr: any) {
      this.cleanTemporaryFile(tempVideoPath);
      onStateChange?.('SOURCE_FAILED', `Video probe failed: ${probeErr.message}`);
      const err = new Error(`Video probe failed: ${probeErr.message}. Please upload the video file directly.`);
      (err as any).code = 'SOURCE_PROBE_FAILED';
      throw err;
    }

    if (!probe.hasVideoStream || probe.duration <= 0) {
      this.cleanTemporaryFile(tempVideoPath);
      onStateChange?.('SOURCE_FAILED', 'No valid video stream detected');
      const err = new Error('No valid video stream detected in acquired source. Please upload the video file directly.');
      (err as any).code = 'SOURCE_PROBE_FAILED';
      throw err;
    }

    onStateChange?.('SOURCE_DOWNLOADED', 'Source video acquired once and verified with FFprobe');

    return {
      sourceVideoPath: tempVideoPath,
      sourceType: 'youtube',
      title,
      durationSeconds: probe.duration,
      thumbnailUrl,
      probe,
      state: 'SOURCE_DOWNLOADED',
    };
  }

  /**
   * Acquires source video from a direct user upload (MP4 / MOV / WebM).
   * Validates file on disk with ffprobe.
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
      const err = new Error(`Unsupported video format (${ext}). Please upload an MP4, MOV, or WebM file.`);
      (err as any).code = 'URL_INVALID';
      throw err;
    }

    // 3. SOURCE_DOWNLOADING / Verification of uploaded media
    onStateChange?.('SOURCE_DOWNLOADING', 'Verifying uploaded media integrity');
    if (!fs.existsSync(filePath)) {
      onStateChange?.('SOURCE_FAILED', 'Uploaded file not found on disk');
      throw new Error('Uploaded file could not be located on the server.');
    }

    const stats = fs.statSync(filePath);
    if (stats.size === 0) {
      this.cleanTemporaryFile(filePath);
      onStateChange?.('SOURCE_FAILED', 'Uploaded file is 0 bytes');
      throw new Error('Uploaded file is empty (0 bytes). Please upload a valid video file.');
    }

    // 4. SOURCE_DOWNLOADED: ffprobe inspection
    onStateChange?.('SOURCE_ACCESSIBLE', 'Probing video streams and duration');
    let probe: MediaProbeInfo;
    try {
      probe = await VideoProcessingService.probeMedia(filePath);
    } catch (probeErr: any) {
      this.cleanTemporaryFile(filePath);
      onStateChange?.('SOURCE_FAILED', `ffprobe failed: ${probeErr.message}`);
      throw new Error(`Uploaded file is not a readable video: ${probeErr.message}`);
    }

    if (!probe.hasVideoStream || probe.duration <= 0) {
      this.cleanTemporaryFile(filePath);
      onStateChange?.('SOURCE_FAILED', 'No playable video stream');
      throw new Error('Uploaded file does not contain a playable video stream with positive duration.');
    }

    // Generate clean thumbnail frame from uploaded video
    const thumbName = `thumb_upload_${Date.now()}.jpg`;
    const thumbPath = path.join(process.cwd(), 'public', 'rendered', thumbName);
    VideoProcessingService.ensureRenderedDir();
    try {
      await VideoProcessingService.extractThumbnail(filePath, thumbPath, Math.min(1.0, probe.duration / 2));
    } catch {
      // non-fatal
    }

    const cleanTitle = path.basename(originalFilename, path.extname(originalFilename))
      .replace(/[-_]/g, ' ')
      .trim();

    onStateChange?.('SOURCE_DOWNLOADED', 'Uploaded video verified with FFprobe');

    return {
      sourceVideoPath: filePath,
      sourceType: 'upload',
      title: cleanTitle || 'Uploaded Video',
      durationSeconds: probe.duration,
      thumbnailUrl: `/rendered/${thumbName}`,
      probe,
      state: 'SOURCE_DOWNLOADED',
    };
  }
}
