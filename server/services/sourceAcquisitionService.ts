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
  private static sourcesDir = path.join(process.cwd(), 'storage', 'sources');
  private static downloadsDir = path.join(process.cwd(), 'downloads');

  public static init() {
    if (!fs.existsSync(this.uploadsDir)) {
      fs.mkdirSync(this.uploadsDir, { recursive: true });
    }
    if (!fs.existsSync(this.sourcesDir)) {
      fs.mkdirSync(this.sourcesDir, { recursive: true });
    }
    if (!fs.existsSync(this.downloadsDir)) {
      fs.mkdirSync(this.downloadsDir, { recursive: true });
    }

    // Run orphaned temp file recovery sweep on startup
    this.sweepOrphanedFiles();
  }

  /**
   * Scans storage/sources/, storage/uploads/, and downloads/ for temporary files/directories
   * older than 2 hours to recover from mid-pipeline server restarts or crashes.
   */
  public static sweepOrphanedFiles(maxAgeMs = 2 * 60 * 60 * 1000) {
    const cutoff = Date.now() - maxAgeMs;
    const dirsToScan = [this.sourcesDir, this.uploadsDir, this.downloadsDir];

    for (const dir of dirsToScan) {
      if (!fs.existsSync(dir)) continue;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name === '.gitkeep') continue;
          const fullPath = path.join(dir, entry.name);
          try {
            const stats = fs.statSync(fullPath);
            if (stats.mtimeMs < cutoff) {
              if (entry.isDirectory()) {
                fs.rmSync(fullPath, { recursive: true, force: true });
              } else {
                fs.unlinkSync(fullPath);
              }
              console.log(`[SourceAcquisition] Swept orphaned file/dir older than 2h: ${entry.name}`);
            }
          } catch (err) {
            console.warn(`[SourceAcquisition] Failed to clean orphaned path ${fullPath}:`, err);
          }
        }
      } catch (err) {
        console.warn(`[SourceAcquisition] Failed scanning directory ${dir} during startup sweep:`, err);
      }
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
   * Safely removes the entire per-job download directory
   */
  public static cleanJobDirectory(jobId: string) {
    if (!jobId) return;
    try {
      const jobDir = path.join(this.downloadsDir, jobId);
      if (fs.existsSync(jobDir)) {
        fs.rmSync(jobDir, { recursive: true, force: true });
      }
    } catch (err) {
      console.warn(`[SourceAcquisition] Notice removing job directory ${jobId}:`, err);
    }
  }

  /**
   * Acquires the ACTUAL source video from YouTube ONCE.
   * Downloads video once into downloads/{jobId}/source.mp4 using merged mp4 format,
   * verifies with ffprobe (exit code 0, video stream, duration > 1.0s),
   * and prepares it for local reuse.
   */
  public static async acquireYouTubeVideo(
    youtubeUrl: string,
    jobId: string,
    onStateChange?: (state: SourceAcquisitionState, detail?: string) => void
  ): Promise<SourceAcquisitionResult> {
    this.init();

    // 1. Validate YouTube URL
    const cleanUrl = (youtubeUrl || '').trim();
    if (!cleanUrl) {
      onStateChange?.('SOURCE_FAILED', 'No URL provided');
      const err = new Error('A valid YouTube URL is required.');
      (err as any).code = 'URL_INVALID';
      throw err;
    }

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

    // Fetch public video metadata via oEmbed
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

    // Prepare per-job downloads directory: downloads/{job_id}/
    const jobDir = path.join(this.downloadsDir, jobId);
    if (!fs.existsSync(jobDir)) {
      fs.mkdirSync(jobDir, { recursive: true });
    }
    const targetVideoPath = path.join(jobDir, 'source.mp4');

    // 2. ACQUIRE ONCE: Download source video using yt-dlp
    // Merged format: -f "bv*[ext=mp4]+ba[ext=m4a]/best[ext=mp4]/best" --merge-output-format mp4
    // No cookies, no login credentials, no CAPTCHA-solving, no bot-protection bypass.
    onStateChange?.('SOURCE_DOWNLOADING', 'Acquiring source video from YouTube once...');
    const ytdlp = await YouTubeService.ensureYtDlp();
    if (!ytdlp) {
      onStateChange?.('SOURCE_FAILED', 'yt-dlp binary not available');
      const err = new Error(
        'Server video acquisition utility is not available. Please use Direct Upload to upload your video file directly.'
      );
      (err as any).code = 'YT_DLP_NOT_AVAILABLE';
      throw err;
    }

    const jsRuntimeArgs = YouTubeService.getJsRuntimeArgs();
    const args = [
      '--no-warnings',
      '--socket-timeout',
      '20',
      '--extractor-args',
      'youtube:player_client=tv,web_embedded,mweb,web',
      ...jsRuntimeArgs,
      '-f',
      'bv*[ext=mp4]+ba[ext=m4a]/best[ext=mp4]/best',
      '--merge-output-format',
      'mp4',
      '--no-playlist',
      '--max-filesize',
      '500M',
      '-o',
      targetVideoPath,
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

    if (!downloadSuccess || !fs.existsSync(targetVideoPath)) {
      this.cleanTemporaryFile(targetVideoPath);
      this.cleanJobDirectory(jobId);
      onStateChange?.('SOURCE_FAILED', stderr.trim());

      const parsedError = YouTubeService.parseYtDlpError(stderr);
      console.warn(`[SourceAcquisitionService] Video acquisition notice (${parsedError.code}): ${parsedError.message}`);

      const finalError = new Error(parsedError.message);
      (finalError as any).code = parsedError.code;
      throw finalError;
    }

    // 3. VERIFY SOURCE: Immediately run ffprobe on the downloaded file
    // Confirm exit code 0, at least one video stream present, and duration > 1.0 second.
    const stats = fs.statSync(targetVideoPath);
    if (stats.size <= 1000) {
      this.cleanTemporaryFile(targetVideoPath);
      this.cleanJobDirectory(jobId);
      onStateChange?.('SOURCE_FAILED', 'Acquired video file is empty');
      const err = new Error('Acquired video file is empty (0 bytes). Please use Direct Upload.');
      (err as any).code = 'SOURCE_PROBE_FAILED';
      throw err;
    }

    let probe: MediaProbeInfo;
    try {
      probe = await VideoProcessingService.probeMedia(targetVideoPath);
    } catch (probeErr: any) {
      this.cleanTemporaryFile(targetVideoPath);
      this.cleanJobDirectory(jobId);
      onStateChange?.('SOURCE_FAILED', `Video probe failed: ${probeErr.message}`);
      const err = new Error(`Source video probe verification failed: ${probeErr.message}. Please use Direct Upload.`);
      (err as any).code = 'SOURCE_PROBE_FAILED';
      throw err;
    }

    if (!probe.hasVideoStream || probe.duration < 1.0) {
      this.cleanTemporaryFile(targetVideoPath);
      this.cleanJobDirectory(jobId);
      onStateChange?.('SOURCE_FAILED', 'No valid video stream detected or duration under 1s');
      const err = new Error(
        'Source video verification failed: no valid video stream detected or video duration is under 1 second. Please use Direct Upload.'
      );
      (err as any).code = 'SOURCE_PROBE_FAILED';
      throw err;
    }

    onStateChange?.('SOURCE_DOWNLOADED', 'Source video acquired once and verified with FFprobe');

    return {
      sourceVideoPath: targetVideoPath,
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
   * Validates file on disk with ffprobe and stores in downloads/{jobId}/source.mp4.
   */
  public static async acquireFromUpload(
    filePath: string,
    originalFilename: string,
    jobId: string,
    onStateChange?: (state: SourceAcquisitionState, detail?: string) => void
  ): Promise<SourceAcquisitionResult> {
    this.init();

    const ext = path.extname(originalFilename || filePath).toLowerCase();
    const allowedExtensions = ['.mp4', '.mov', '.webm', '.mkv'];
    if (!allowedExtensions.includes(ext)) {
      onStateChange?.('SOURCE_FAILED', `Unsupported format ${ext}`);
      const err = new Error(`Unsupported video format (${ext}). Please upload an MP4, MOV, or WebM file.`);
      (err as any).code = 'URL_INVALID';
      throw err;
    }

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

    // Destination in downloads/{jobId}/source.mp4
    const jobDir = path.join(this.downloadsDir, jobId);
    if (!fs.existsSync(jobDir)) {
      fs.mkdirSync(jobDir, { recursive: true });
    }
    const targetVideoPath = path.join(jobDir, 'source.mp4');

    // Move or copy uploaded file to job directory
    try {
      fs.copyFileSync(filePath, targetVideoPath);
      this.cleanTemporaryFile(filePath);
    } catch {
      // If copy fails, fallback to using filePath directly
    }
    const finalSourcePath = fs.existsSync(targetVideoPath) ? targetVideoPath : filePath;

    // Verify uploaded media with ffprobe
    let probe: MediaProbeInfo;
    try {
      probe = await VideoProcessingService.probeMedia(finalSourcePath);
    } catch (probeErr: any) {
      this.cleanTemporaryFile(finalSourcePath);
      onStateChange?.('SOURCE_FAILED', `ffprobe failed: ${probeErr.message}`);
      throw new Error(`Uploaded file is not a readable video: ${probeErr.message}`);
    }

    if (!probe.hasVideoStream || probe.duration < 1.0) {
      this.cleanTemporaryFile(finalSourcePath);
      onStateChange?.('SOURCE_FAILED', 'No playable video stream or duration under 1s');
      throw new Error('Uploaded file does not contain a playable video stream with duration > 1s.');
    }

    // Generate thumbnail frame from uploaded video
    const thumbName = `thumb_upload_${Date.now()}.jpg`;
    const thumbPath = path.join(process.cwd(), 'public', 'rendered', thumbName);
    VideoProcessingService.ensureRenderedDir();
    try {
      await VideoProcessingService.extractThumbnail(finalSourcePath, thumbPath, Math.min(1.0, probe.duration / 2));
    } catch {
      // non-fatal
    }

    const cleanTitle = path.basename(originalFilename, path.extname(originalFilename))
      .replace(/[-_]/g, ' ')
      .trim();

    onStateChange?.('SOURCE_DOWNLOADED', 'Uploaded video verified with FFprobe');

    return {
      sourceVideoPath: finalSourcePath,
      sourceType: 'upload',
      title: cleanTitle || 'Uploaded Video',
      durationSeconds: probe.duration,
      thumbnailUrl: `/rendered/${thumbName}`,
      probe,
      state: 'SOURCE_DOWNLOADED',
    };
  }
}
