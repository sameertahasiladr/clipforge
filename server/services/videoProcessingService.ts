/**
 * Video Processing Service — ClipForge AI
 * Real FFmpeg Video Rendering & Verification Pipeline:
 * - Strict source video validation (existence, readability, size > 0, valid stream probe)
 * - Trim -> Scale -> 9:16 Vertical Pan/Crop -> Audio Normalization -> Captions Burn-In -> Watermark -> H.264/AAC MP4
 * - Rigorous output verification (exit code 0, stderr capture, file exists, size > 1000 bytes, ffprobe validation)
 * - Frame extraction for actual thumbnail generation via FFmpeg (verified size > 0)
 * - Strict production rule: Zero synthetic testsrc/sine fallback.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from '@ffprobe-installer/ffprobe';
import { StorageService } from './storageService.ts';

export interface CropParameters {
  sourceWidth?: number;
  sourceHeight?: number;
  targetAspectRatio: '9:16' | '1:1' | '16:9';
  speakerCenterXPercent: number; // 0 to 100
}

export interface RenderJobSpec {
  clipId: string;
  sourceVideoPath: string;
  startTime: number;
  duration: number;
  cropParams: CropParameters;
  title?: string;
  hook?: string;
  captionText?: string;
  captionConfig?: {
    style: 'minimal' | 'bold' | 'dynamic' | 'highlight' | 'none';
    enabled?: boolean;
    fontFamily?: string;
    position: 'top' | 'middle' | 'bottom';
    watermarkText?: string;
    watermarkEnabled: boolean;
  };
}

export interface RenderProgressEvent {
  clipId: string;
  progressPercent: number;
  status: 'rendering' | 'completed' | 'failed';
  videoUrl?: string;
  thumbnailUrl?: string;
  errorMessage?: string;
}

export interface MediaProbeInfo {
  duration: number;
  hasVideoStream: boolean;
  hasAudioStream: boolean;
  width?: number;
  height?: number;
  videoCodec?: string;
  audioCodec?: string;
}

// In-memory render job progress cache for live status polling
export const activeRenderJobs = new Map<string, RenderProgressEvent>();

export class VideoProcessingService {
  private static renderedDir = path.join(process.cwd(), 'public', 'rendered');

  /**
   * Resolves the verified FFmpeg executable binary (static binary, system, or fallback)
   */
  public static getFfmpegBinary(): string {
    if (ffmpegStatic && fs.existsSync(ffmpegStatic)) {
      try {
        fs.chmodSync(ffmpegStatic, 0o755);
        return ffmpegStatic;
      } catch {}
    }
    if (fs.existsSync('/usr/bin/ffmpeg')) return '/usr/bin/ffmpeg';
    if (fs.existsSync('/usr/local/bin/ffmpeg')) return '/usr/local/bin/ffmpeg';
    return 'ffmpeg';
  }

  /**
   * Resolves the verified FFprobe executable binary (static binary, system, or fallback)
   */
  public static getFfprobeBinary(): string {
    const probePath = (ffprobeStatic as any)?.path;
    if (probePath && fs.existsSync(probePath)) {
      try {
        fs.chmodSync(probePath, 0o755);
        return probePath;
      } catch {}
    }
    if (fs.existsSync('/usr/bin/ffprobe')) return '/usr/bin/ffprobe';
    if (fs.existsSync('/usr/local/bin/ffprobe')) return '/usr/local/bin/ffprobe';
    return 'ffprobe';
  }

  /**
   * Checks whether FFmpeg is available on the system or bundled
   */
  public static isFfmpegAvailable(): boolean {
    const bin = this.getFfmpegBinary();
    return Boolean(bin && (fs.existsSync(bin) || bin === 'ffmpeg'));
  }

  /**
   * Ensure the public rendered directory exists
   */
  public static ensureRenderedDir() {
    if (!fs.existsSync(this.renderedDir)) {
      fs.mkdirSync(this.renderedDir, { recursive: true });
    }
  }

  /**
   * Verify content rights confirmation before processing
   */
  public static verifyContentRights(hasUserConfirmedRights: boolean): boolean {
    if (!hasUserConfirmedRights) {
      throw new Error(
        'Content rights verification required: Only upload or process content you own or have permission to use.'
      );
    }
    return true;
  }

  /**
   * Probes media file with ffprobe to extract stream details and duration
   */
  public static async probeMedia(filePath: string): Promise<MediaProbeInfo> {
    if (!filePath || !fs.existsSync(filePath)) {
      throw new Error(`Media file does not exist at: ${filePath}`);
    }

    return new Promise((resolve, reject) => {
      const ffprobeBinary = VideoProcessingService.getFfprobeBinary();
      const proc = spawn(ffprobeBinary, [
        '-v',
        'error',
        '-show_entries',
        'stream=codec_type,codec_name,width,height',
        '-show_entries',
        'format=duration',
        '-of',
        'json',
        filePath,
      ]);

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });

      proc.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          return reject(new Error(`ffprobe failed with exit code ${code}: ${stderr.trim()}`));
        }

        try {
          const parsed = JSON.parse(stdout);
          const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
          const format = parsed.format || {};
          const videoStream = streams.find((s: any) => s.codec_type === 'video');
          const audioStream = streams.find((s: any) => s.codec_type === 'audio');
          const duration = parseFloat(format.duration) || 0;

          resolve({
            duration,
            hasVideoStream: Boolean(videoStream),
            hasAudioStream: Boolean(audioStream),
            width: videoStream?.width,
            height: videoStream?.height,
            videoCodec: videoStream?.codec_name,
            audioCodec: audioStream?.codec_name,
          });
        } catch (err: any) {
          reject(new Error(`Failed to parse ffprobe output: ${err.message}`));
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`Failed to run ffprobe: ${err.message}`));
      });
    });
  }

  /**
   * Extracts audio locally from the acquired source video file using FFmpeg.
   * Purely local operation: source.mp4 -> downloads/{job_id}/audio.wav (16kHz mono PCM WAV)
   */
  public static async extractAudioLocally(
    videoPath: string,
    outputAudioPath?: string
  ): Promise<string> {
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Source video not found on disk at: ${videoPath}`);
    }

    const targetAudio =
      outputAudioPath ||
      path.join(path.dirname(videoPath), 'audio.mp3');

    return new Promise((resolve, reject) => {
      const ffmpegBinary = VideoProcessingService.getFfmpegBinary();
      const isMp3 = targetAudio.endsWith('.mp3');
      const args = isMp3
        ? [
            '-y',
            '-i',
            videoPath,
            '-vn',
            '-c:a',
            'libmp3lame',
            '-b:a',
            '64k',
            '-ar',
            '16000',
            '-ac',
            '1',
            targetAudio,
          ]
        : [
            '-y',
            '-i',
            videoPath,
            '-vn',
            '-acodec',
            'pcm_s16le',
            '-ar',
            '16000',
            '-ac',
            '1',
            targetAudio,
          ];

      const proc = spawn(ffmpegBinary, args);
      let stderr = '';

      proc.stderr.on('data', (d) => {
        stderr += d.toString();
      });

      proc.on('close', (code) => {
        if (code === 0 && fs.existsSync(targetAudio) && fs.statSync(targetAudio).size > 200) {
          resolve(targetAudio);
        } else {
          reject(new Error(`FFmpeg local audio extraction failed (exit code ${code}): ${stderr.trim()}`));
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`Failed to spawn FFmpeg for audio extraction: ${err.message}`));
      });
    });
  }

  /**
   * Generates a thumbnail image from an existing video at a given timestamp using FFmpeg
   */
  public static async extractThumbnail(
    videoPath: string,
    outputPath: string,
    timestampSeconds = 1.0
  ): Promise<string> {
    this.ensureRenderedDir();

    return new Promise((resolve, reject) => {
      const ffmpegBinary = VideoProcessingService.getFfmpegBinary();
      const args = [
        '-y',
        '-ss',
        Math.max(0, timestampSeconds).toFixed(2),
        '-i',
        videoPath,
        '-vframes',
        '1',
        '-q:v',
        '2',
        outputPath,
      ];

      const proc = spawn(ffmpegBinary, args);
      let stderr = '';

      proc.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      proc.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
          resolve(outputPath);
        } else {
          reject(new Error(`FFmpeg thumbnail generation failed (exit code ${code}): ${stderr.trim()}`));
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`Failed to spawn FFmpeg for thumbnail extraction: ${err.message}`));
      });
    });
  }

  /**
   * Renders a real 9:16 1080x1920 MP4 clip using FFmpeg from an actual source video.
   * Enforces rigorous validation:
   * 1. Source existence & readability check
   * 2. Source ffprobe probe (has video stream, duration > 0)
   * 3. FFmpeg crop, caption burn-in, audio normalization
   * 4. Exit code 0 check & stderr capture
   * 5. Output file verification (size > 1000 bytes, duration > 0, streams valid via ffprobe)
   * 6. Real thumbnail extraction from output MP4
   */
  public static async renderClip(
    spec: RenderJobSpec,
    onProgress?: (event: RenderProgressEvent) => void
  ): Promise<{ localPath: string; videoUrl: string; thumbnailUrl: string }> {
    this.ensureRenderedDir();

    const baseId = spec.clipId.startsWith('clip-') ? spec.clipId : `clip-${spec.clipId}`;
    const outputFileName = `${baseId}.mp4`;
    const outputPath = path.join(this.renderedDir, outputFileName);
    const publicVideoUrl = `/rendered/${outputFileName}`;

    const thumbFileName = `thumb-${baseId.replace(/^clip-/, '')}.jpg`;
    const thumbPath = path.join(this.renderedDir, thumbFileName);
    const publicThumbUrl = `/rendered/${thumbFileName}`;

    const updateStatus = (
      percent: number,
      status: 'rendering' | 'completed' | 'failed',
      error?: string
    ) => {
      const event: RenderProgressEvent = {
        clipId: spec.clipId,
        progressPercent: percent,
        status,
        videoUrl: status === 'completed' ? publicVideoUrl : undefined,
        thumbnailUrl: status === 'completed' ? publicThumbUrl : undefined,
        errorMessage: error,
      };
      activeRenderJobs.set(spec.clipId, event);
      if (onProgress) onProgress(event);
    };

    updateStatus(5, 'rendering');

    // Step 1: Verify source video exists and is readable
    if (!spec.sourceVideoPath || typeof spec.sourceVideoPath !== 'string') {
      const msg = 'Source video could not be prepared for processing.';
      updateStatus(0, 'failed', msg);
      throw new Error(msg);
    }

    if (!fs.existsSync(spec.sourceVideoPath)) {
      const msg = `Source video could not be prepared for processing: file not found at ${spec.sourceVideoPath}`;
      updateStatus(0, 'failed', msg);
      throw new Error(msg);
    }

    try {
      fs.accessSync(spec.sourceVideoPath, fs.constants.R_OK);
    } catch {
      const msg = 'Source video is not readable.';
      updateStatus(0, 'failed', msg);
      throw new Error(msg);
    }

    const sourceStats = fs.statSync(spec.sourceVideoPath);
    if (sourceStats.size === 0) {
      const msg = 'Source video could not be prepared for processing: source file is empty (0 bytes).';
      updateStatus(0, 'failed', msg);
      throw new Error(msg);
    }

    // Step 2: Probe source media with ffprobe
    updateStatus(15, 'rendering');
    let sourceProbe: MediaProbeInfo;
    try {
      sourceProbe = await this.probeMedia(spec.sourceVideoPath);
    } catch (probeErr: any) {
      const msg = `Source video probing failed: ${probeErr.message}`;
      updateStatus(0, 'failed', msg);
      throw new Error(msg);
    }

    if (!sourceProbe.hasVideoStream || sourceProbe.duration <= 0) {
      const msg = 'Source video does not contain a valid playable video stream.';
      updateStatus(0, 'failed', msg);
      throw new Error(msg);
    }

    // Step 3: Compute valid start time and duration
    const clampedStart = Math.max(0, Math.min(spec.startTime, Math.max(0, sourceProbe.duration - 1)));
    const maxAvailableDuration = Math.max(1, sourceProbe.duration - clampedStart);
    const targetDuration = Math.min(Math.max(1, spec.duration || 14), maxAvailableDuration);

    // Step 4: Build FFmpeg filter complex
    // 9:16 Vertical Pan/Scan
    const centerX = Math.min(100, Math.max(0, spec.cropParams?.speakerCenterXPercent ?? 50));
    const cropFilter = `crop='min(iw, ih*9/16)':'ih':'min(max(0, iw*(${centerX}/100) - (ow/2)), iw-ow)':'0',scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920`;

    // Caption burn-in text disabled per requirement: Clean 9:16 video without subtitle overlays
    const isCaptionEnabled = false;

    const rawCaption = isCaptionEnabled
      ? spec.captionText || spec.hook || spec.title || ''
      : '';
    const cleanText = rawCaption
      .replace(/['":\\%\n\r]/g, ' ')
      .trim()
      .substring(0, 85);

    let captionStyleFilter = '';
    if (isCaptionEnabled && cleanText.length > 0) {
      let captionY = '1580'; // bottom default
      if (spec.captionConfig?.position === 'top') captionY = '260';
      if (spec.captionConfig?.position === 'middle') captionY = '960';

      captionStyleFilter = `drawtext=text='${cleanText}':fontcolor=white:fontsize=44:x=(w-tw)/2:y=${captionY}:box=1:boxcolor=black@0.65:boxborderw=14`;
      if (spec.captionConfig?.style === 'bold') {
        captionStyleFilter = `drawtext=text='${cleanText}':fontcolor=yellow:fontsize=48:x=(w-tw)/2:y=${captionY}:box=1:boxcolor=black@0.8:boxborderw=16`;
      } else if (spec.captionConfig?.style === 'highlight') {
        captionStyleFilter = `drawtext=text='${cleanText}':fontcolor=0x38bdf8:fontsize=46:x=(w-tw)/2:y=${captionY}:box=1:boxcolor=black@0.7:boxborderw=14`;
      } else if (spec.captionConfig?.style === 'minimal') {
        captionStyleFilter = `drawtext=text='${cleanText}':fontcolor=white:fontsize=38:x=(w-tw)/2:y=${captionY}:box=1:boxcolor=black@0.4:boxborderw=10`;
      }
    }

    // Watermark
    const watermarkFilter =
      spec.captionConfig?.watermarkEnabled && spec.captionConfig?.watermarkText
        ? `,drawtext=text='${spec.captionConfig.watermarkText.replace(/['":\\%\n\r]/g, '')}':fontcolor=white@0.85:fontsize=28:x=w-tw-40:y=70:box=1:boxcolor=black@0.5:boxborderw=8`
        : '';

    let videoFilters = cropFilter;
    if (captionStyleFilter) {
      videoFilters += `,${captionStyleFilter}`;
    }
    if (watermarkFilter) {
      videoFilters += watermarkFilter;
    }

    // Step 5: Construct FFmpeg arguments
    const ffmpegArgs: string[] = [
      '-progress',
      'pipe:1',
      '-nostats',
      '-y',
      '-ss',
      clampedStart.toFixed(2),
      '-i',
      spec.sourceVideoPath,
      '-t',
      targetDuration.toFixed(2),
      '-vf',
      videoFilters,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '22',
      '-pix_fmt',
      'yuv420p',
    ];

    if (sourceProbe.hasAudioStream) {
      ffmpegArgs.push('-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '192k');
    } else {
      ffmpegArgs.push('-an');
    }

    ffmpegArgs.push(outputPath);

    updateStatus(5, 'rendering');

    // Step 6: Spawn FFmpeg, parse stdout -progress pipe:1 for live progress, and capture stderr
    await new Promise<void>((resolve, reject) => {
      const ffmpegBinary = VideoProcessingService.getFfmpegBinary();
      const proc = spawn(ffmpegBinary, ffmpegArgs);
      let stderrOutput = '';
      let stdoutBuffer = '';

      proc.stdout.on('data', (chunk) => {
        stdoutBuffer += chunk.toString();
        const lines = stdoutBuffer.split('\n');
        stdoutBuffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          let parsedMs: number | null = null;
          if (trimmed.startsWith('out_time_ms=')) {
            const rawVal = parseInt(trimmed.substring('out_time_ms='.length), 10);
            if (!isNaN(rawVal) && rawVal > 0) {
              // FFmpeg out_time_ms is in microseconds in some ffmpeg versions
              parsedMs = rawVal > targetDuration * 1000 * 5 ? rawVal / 1000 : rawVal;
            }
          } else if (trimmed.startsWith('out_time=')) {
            const timeStr = trimmed.substring('out_time='.length).trim();
            const match = timeStr.match(/^(\d+):(\d+):(\d+(?:\.\d+)?)$/);
            if (match) {
              const hours = parseFloat(match[1]);
              const minutes = parseFloat(match[2]);
              const seconds = parseFloat(match[3]);
              parsedMs = (hours * 3600 + minutes * 60 + seconds) * 1000;
            }
          }

          if (parsedMs !== null && targetDuration > 0) {
            const calculatedPercent = (parsedMs / (targetDuration * 1000)) * 100;
            // Clamp between 5 and 95 while rendering is in progress (100 is reserved for post-render verification)
            const progressPercent = Math.min(95, Math.max(5, Math.round(calculatedPercent)));
            updateStatus(progressPercent, 'rendering');
          }
        }
      });

      proc.stderr.on('data', (chunk) => {
        stderrOutput += chunk.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          // Remove potential partial/stub file on failure
          if (fs.existsSync(outputPath)) {
            try {
              fs.unlinkSync(outputPath);
            } catch {
              // ignore
            }
          }
          const errorDetail = stderrOutput.slice(-800) || `Exit code ${code}`;
          reject(new Error(`FFmpeg rendering failed with exit code ${code}: ${errorDetail}`));
        }
      });

      proc.on('error', (err) => {
        if (fs.existsSync(outputPath)) {
          try {
            fs.unlinkSync(outputPath);
          } catch {
            // ignore
          }
        }
        reject(new Error(`Failed to spawn FFmpeg: ${err.message}`));
      });
    });

    // Step 7: Verify output file exists and is not a stub (size > 1000 bytes)
    updateStatus(85, 'rendering');
    if (!fs.existsSync(outputPath)) {
      const msg = 'Rendered video verification failed: output file does not exist.';
      updateStatus(0, 'failed', msg);
      throw new Error(msg);
    }

    const outputStats = fs.statSync(outputPath);
    if (outputStats.size <= 1000) {
      try {
        fs.unlinkSync(outputPath);
      } catch {
        // ignore
      }
      const msg = `Rendered video verification failed: output file size is unacceptable (${outputStats.size} bytes).`;
      updateStatus(0, 'failed', msg);
      throw new Error(msg);
    }

    // Step 8: Probe rendered file with ffprobe to verify valid streams & duration
    let outputProbe: MediaProbeInfo;
    try {
      outputProbe = await this.probeMedia(outputPath);
    } catch (outputProbeErr: any) {
      try {
        fs.unlinkSync(outputPath);
      } catch {
        // ignore
      }
      const msg = `Rendered video verification failed: ffprobe could not inspect output: ${outputProbeErr.message}`;
      updateStatus(0, 'failed', msg);
      throw new Error(msg);
    }

    if (!outputProbe.hasVideoStream || outputProbe.duration <= 0) {
      try {
        fs.unlinkSync(outputPath);
      } catch {
        // ignore
      }
      const msg = 'Rendered video verification failed: output video stream is invalid or duration is 0.';
      updateStatus(0, 'failed', msg);
      throw new Error(msg);
    }

    if (outputProbe.width !== 1080 || outputProbe.height !== 1920) {
      try {
        fs.unlinkSync(outputPath);
      } catch {
        // ignore
      }
      const msg = `Rendered video verification failed: output dimensions (${outputProbe.width}x${outputProbe.height}) do not match required 1080x1920 vertical format.`;
      updateStatus(0, 'failed', msg);
      throw new Error(msg);
    }

    if (sourceProbe.hasAudioStream && !outputProbe.hasAudioStream) {
      try {
        fs.unlinkSync(outputPath);
      } catch {
        // ignore
      }
      const msg = 'Rendered video verification failed: audio stream was lost during processing.';
      updateStatus(0, 'failed', msg);
      throw new Error(msg);
    }

    // Step 9: Generate real thumbnail from the actual rendered clip using FFmpeg
    updateStatus(92, 'rendering');
    const thumbTimestamp = Math.min(Math.max(0.5, targetDuration / 2), Math.max(0.1, targetDuration - 0.2));
    try {
      await this.extractThumbnail(outputPath, thumbPath, thumbTimestamp);
    } catch (thumbErr: any) {
      console.warn(`[VideoProcessingService] Thumbnail extraction failed at ${thumbTimestamp}s, trying 0.1s:`, thumbErr.message);
      await this.extractThumbnail(outputPath, thumbPath, 0.1);
    }

    // Verify thumbnail exists and size > 0
    if (!fs.existsSync(thumbPath) || fs.statSync(thumbPath).size === 0) {
      const msg = 'Thumbnail verification failed: generated thumbnail is 0 bytes.';
      updateStatus(0, 'failed', msg);
      throw new Error(msg);
    }

    // Step 10: Persist assets to storage abstraction
    try {
      await StorageService.upload(outputPath, outputFileName);
      await StorageService.upload(thumbPath, thumbFileName);
    } catch (storageErr) {
      console.warn('[VideoProcessingService] Storage upload notice:', storageErr);
    }

    updateStatus(100, 'completed');
    return {
      localPath: outputPath,
      videoUrl: publicVideoUrl,
      thumbnailUrl: publicThumbUrl,
    };
  }
}
