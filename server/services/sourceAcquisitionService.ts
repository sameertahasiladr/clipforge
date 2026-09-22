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

  /**
   * Acquires source video from a public YouTube URL with strict state verification.
   * If YouTube blocks bot traffic, returns clear actionable guidance without fake content.
   */
  public static async acquireFromYouTube(
    youtubeUrl: string,
    onStateChange?: (state: SourceAcquisitionState, detail?: string) => void
  ): Promise<SourceAcquisitionResult> {
    this.init();

    // 1. SOURCE_URL_RECEIVED
    onStateChange?.('SOURCE_URL_RECEIVED', 'Received YouTube URL');
    const cleanUrl = (youtubeUrl || '').trim();
    if (!cleanUrl) {
      onStateChange?.('SOURCE_FAILED', 'No URL provided');
      throw new Error('A valid YouTube URL is required.');
    }

    // 2. SOURCE_VALIDATED
    onStateChange?.('SOURCE_VALIDATED', 'Validating YouTube URL format');
    const validation: YouTubeValidationResult = YouTubeService.validateYouTubeUrl(cleanUrl);
    if (!validation.isValid || !validation.videoId) {
      onStateChange?.('SOURCE_FAILED', validation.error || 'Invalid YouTube URL format');
      throw new Error(validation.error || 'Invalid YouTube URL format. Please provide a standard watch or Shorts link.');
    }
    const videoId = validation.videoId;

    // 3. SOURCE_ACCESSIBLE: check basic accessibility & metadata via oEmbed or Data API
    onStateChange?.('SOURCE_ACCESSIBLE', 'Checking video accessibility');
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
      throw new Error(
        'Server video acquisition utility is not initialized. Please upload the video file directly (MP4/MOV/WebM).'
      );
    }

    const targetPath = path.join(this.sourcesDir, `yt_${videoId}_${Date.now()}.mp4`);
    const args = [
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

      onStateChange?.('SOURCE_FAILED', stderr);
      console.error('[SourceAcquisitionService] yt-dlp failed:', stderr);

      // Parse stderr to provide the user with the exact, honest, actionable reason
      if (
        stderr.toLowerCase().includes('bot') ||
        stderr.toLowerCase().includes('sign in to confirm') ||
        stderr.toLowerCase().includes('captcha')
      ) {
        throw new Error(
          "Unable to retrieve this YouTube video. YouTube is requiring additional verification (bot check / sign-in) from the server. Please upload the video file directly or use an authorized source."
        );
      } else if (
        stderr.toLowerCase().includes('unavailable') ||
        stderr.toLowerCase().includes('private video')
      ) {
        throw new Error(
          'Unable to retrieve this YouTube video: This video is unavailable or private on YouTube. Please check the URL or upload the video file directly.'
        );
      } else if (stderr.toLowerCase().includes('429') || stderr.toLowerCase().includes('too many requests')) {
        throw new Error(
          'Unable to retrieve this YouTube video: YouTube rate limit exceeded (HTTP 429). Please upload the video file directly.'
        );
      } else {
        const cleanErr = stderr.split('\n').filter((l) => l.includes('ERROR:')).join(' ') || 'Download failed';
        throw new Error(
          `Unable to retrieve this YouTube video: ${cleanErr}. Please upload the video file directly.`
        );
      }
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
      throw new Error('Downloaded video file is empty or corrupted (0 bytes). Please upload the video file directly.');
    }

    // 7. SOURCE_READY: ffprobe inspection
    let probe: MediaProbeInfo;
    try {
      probe = await VideoProcessingService.probeMedia(targetPath);
    } catch (probeErr: any) {
      try {
        fs.unlinkSync(targetPath);
      } catch {}
      onStateChange?.('SOURCE_FAILED', `ffprobe failed: ${probeErr.message}`);
      throw new Error(`Video media probe failed: ${probeErr.message}. Please upload a valid MP4/MOV/WebM video.`);
    }

    if (!probe.hasVideoStream || probe.duration <= 0) {
      try {
        fs.unlinkSync(targetPath);
      } catch {}
      onStateChange?.('SOURCE_FAILED', 'No valid video stream detected');
      throw new Error('Downloaded media contains no playable video stream. Please upload a valid MP4/MOV/WebM video.');
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
