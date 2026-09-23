/**
 * Source Acquisition Service — ClipForge AI
 * Production-grade source acquisition supporting YouTube and Direct Upload.
 * Implements strict state machine:
 * SOURCE_URL_RECEIVED -> SOURCE_VALIDATED -> SOURCE_ACCESSIBLE ->
 * SOURCE_ACQUIRING -> SOURCE_READY
 * (or SOURCE_FAILED with actionable diagnostics).
 *
 * Architecture Principles:
 * - Public-First YouTube: No cookies, no manual cookie export, no fake bypass.
 * - Audio-First Optimization: Only acquires audio stream for transcription & Gemini analysis.
 * - On-Demand Video Acquisition: Only acquires video frames when rendering selected clips.
 * - Strict Verification: ffprobe verifies audio & video codecs, stream existence, and positive duration.
 * - Automatic Temporary Cleanup: Safely deletes temporary audio and source files on success or failure.
 */

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { YouTubeService, YouTubeValidationResult } from './youtubeService.js';
import { VideoProcessingService, MediaProbeInfo } from './videoProcessingService.js';

export type SourceAcquisitionState =
  | 'SOURCE_URL_RECEIVED'
  | 'SOURCE_VALIDATED'
  | 'SOURCE_ACCESSIBLE'
  | 'SOURCE_ACQUIRING'
  | 'SOURCE_READY'
  | 'SOURCE_FAILED';

export interface SourceAudioAcquisitionResult {
  audioPath: string;
  sourceType: 'youtube' | 'upload';
  title: string;
  durationSeconds: number;
  thumbnailUrl: string;
  probe: MediaProbeInfo;
  sourceUrlOrPath: string;
}

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
   * Acquires audio only from a public YouTube video for transcription & speech analysis.
   * Does NOT download the full video prematurely.
   */
  public static async acquireYouTubeAudioForAnalysis(
    youtubeUrl: string,
    onStateChange?: (state: SourceAcquisitionState, detail?: string) => void
  ): Promise<SourceAudioAcquisitionResult> {
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

    // 3. SOURCE_ACCESSIBLE: check basic accessibility & metadata via oEmbed
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
      // oEmbed might be blocked or timed out
    }

    // 4. SOURCE_ACQUIRING: Acquire lightweight audio stream via yt-dlp
    onStateChange?.('SOURCE_ACQUIRING', 'Acquiring audio stream for speech transcription');
    const ytdlp = await YouTubeService.ensureYtDlp();
    if (!ytdlp) {
      onStateChange?.('SOURCE_FAILED', 'yt-dlp binary not available');
      const err = new Error(
        'Server media acquisition utility is not available. Please upload the video file directly (MP4/MOV/WebM).'
      );
      (err as any).code = 'YT_DLP_NOT_AVAILABLE';
      throw err;
    }

    const tempAudioPath = path.join(this.tempDir, `audio_${videoId}_${Date.now()}.m4a`);
    const jsRuntimeArgs = YouTubeService.getJsRuntimeArgs();

    const args = [
      '--no-warnings',
      '--socket-timeout',
      '15',
      '--extractor-args',
      'youtube:player_client=tv,web_embedded,mweb,web',
      ...jsRuntimeArgs,
      '-f',
      'ba[ext=m4a]/ba/b',
      '-x',
      '--audio-format',
      'm4a',
      '--no-playlist',
      '--max-filesize',
      '120M',
      '-o',
      tempAudioPath,
      cleanUrl,
    ];

    let stderr = '';
    const downloadSuccess = await new Promise<boolean>((resolve) => {
      const proc = spawn(ytdlp, args);
      const timeout = setTimeout(() => {
        try {
          proc.kill('SIGKILL');
        } catch {}
        stderr += '\nOperation timed out after 45 seconds.';
        resolve(false);
      }, 45000);

      // CRITICAL: Consume stdout so pipe buffer doesn't block child process
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

    if (!downloadSuccess || !fs.existsSync(tempAudioPath)) {
      this.cleanTemporaryFile(tempAudioPath);
      onStateChange?.('SOURCE_FAILED', stderr.trim());

      const parsedError = YouTubeService.parseYtDlpError(stderr);
      console.warn(`[SourceAcquisitionService] Source acquisition notice (${parsedError.code}): ${parsedError.message}`);

      const finalError = new Error(parsedError.message);
      (finalError as any).code = parsedError.code;
      throw finalError;
    }

    // 5. Verify audio file integrity with ffprobe
    const stats = fs.statSync(tempAudioPath);
    if (stats.size <= 1000) {
      this.cleanTemporaryFile(tempAudioPath);
      onStateChange?.('SOURCE_FAILED', 'Acquired audio stream is empty');
      const err = new Error('Acquired audio file is empty (0 bytes). Please upload the video file directly.');
      (err as any).code = 'SOURCE_PROBE_FAILED';
      throw err;
    }

    let probe: MediaProbeInfo;
    try {
      probe = await VideoProcessingService.probeMedia(tempAudioPath);
    } catch (probeErr: any) {
      this.cleanTemporaryFile(tempAudioPath);
      onStateChange?.('SOURCE_FAILED', `Audio probe failed: ${probeErr.message}`);
      const err = new Error(`Audio probe failed: ${probeErr.message}. Please upload the video file directly.`);
      (err as any).code = 'SOURCE_PROBE_FAILED';
      throw err;
    }

    if (!probe.hasAudioStream || probe.duration <= 0) {
      this.cleanTemporaryFile(tempAudioPath);
      onStateChange?.('SOURCE_FAILED', 'No valid audio stream detected');
      const err = new Error('No valid audio stream detected in source. Please upload the video file directly.');
      (err as any).code = 'SOURCE_PROBE_FAILED';
      throw err;
    }

    onStateChange?.('SOURCE_READY', 'Audio stream acquired and verified for transcription');

    return {
      audioPath: tempAudioPath,
      sourceType: 'youtube',
      title,
      durationSeconds: probe.duration,
      thumbnailUrl,
      probe,
      sourceUrlOrPath: cleanUrl,
    };
  }

  /**
   * Acquires the required video media for selected clips from YouTube.
   * Returns path to temporary video source file for FFmpeg rendering.
   */
  public static async acquireYouTubeVideoForRendering(
    youtubeUrl: string,
    onProgress?: (msg: string) => void
  ): Promise<string> {
    this.init();
    const cleanUrl = youtubeUrl.trim();
    const validation = YouTubeService.validateYouTubeUrl(cleanUrl);
    const videoId = validation.videoId || 'clip_src';

    const ytdlp = await YouTubeService.ensureYtDlp();
    if (!ytdlp) {
      throw new Error('Video acquisition utility is not available on server.');
    }

    const tempVideoPath = path.join(this.tempDir, `yt_render_${videoId}_${Date.now()}.mp4`);
    const jsRuntimeArgs = YouTubeService.getJsRuntimeArgs();

    onProgress?.('Acquiring high-resolution video frames for final clip rendering...');

    const args = [
      '--no-warnings',
      '--socket-timeout',
      '15',
      '--extractor-args',
      'youtube:player_client=tv,web_embedded,mweb,web',
      ...jsRuntimeArgs,
      '-f',
      'bestvideo[ext=mp4][height<=1080]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      '--merge-output-format',
      'mp4',
      '--no-playlist',
      '--max-filesize',
      '350M',
      '-o',
      tempVideoPath,
      cleanUrl,
    ];

    let stderr = '';
    const success = await new Promise<boolean>((resolve) => {
      const proc = spawn(ytdlp, args);
      const timeout = setTimeout(() => {
        try {
          proc.kill('SIGKILL');
        } catch {}
        stderr += '\nVideo acquisition timed out after 60 seconds.';
        resolve(false);
      }, 60000);

      // CRITICAL: Consume stdout so pipe buffer doesn't block child process
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

    if (!success || !fs.existsSync(tempVideoPath)) {
      this.cleanTemporaryFile(tempVideoPath);
      const parsed = YouTubeService.parseYtDlpError(stderr);
      const err = new Error(parsed.message);
      (err as any).code = parsed.code;
      throw err;
    }

    // Verify video stream
    const probe = await VideoProcessingService.probeMedia(tempVideoPath);
    if (!probe.hasVideoStream || probe.duration <= 0 || !probe.videoCodec) {
      this.cleanTemporaryFile(tempVideoPath);
      throw new Error('Downloaded source contains no valid video stream.');
    }

    return tempVideoPath;
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
      const err = new Error(`Unsupported video format (${ext}). Please upload an MP4, MOV, or WebM file.`);
      (err as any).code = 'URL_INVALID';
      throw err;
    }

    // 3. SOURCE_ACQUIRING: verify file existence and size
    onStateChange?.('SOURCE_ACQUIRING', 'Verifying uploaded media integrity');
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

    // 4. SOURCE_READY: ffprobe inspection
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

    // Generate clean thumbnail frame from the uploaded video
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
