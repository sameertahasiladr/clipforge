/**
 * Video Processing Service — ClipForge AI
 * Real FFmpeg Video Rendering Pipeline:
 * Trim -> Scale -> 9:16 Vertical Pan/Crop -> Audio Normalization -> Captions Burn-In -> Watermark -> H.264/AAC MP4.
 *
 * Strict Production Discipline:
 * - Production Mode requires an actual sourceVideoPath on disk.
 * - If sourceVideoPath is missing in Production Mode, fails immediately with:
 *   "Source video could not be prepared for processing."
 * - Synthetic testsrc/sine is strictly forbidden in Production Mode (allowed ONLY in Demo Mode).
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { StorageService } from './storageService.js';

export interface CropParameters {
  sourceWidth?: number;
  sourceHeight?: number;
  targetAspectRatio: '9:16' | '1:1' | '16:9';
  speakerCenterXPercent: number; // 0 to 100
}

export interface RenderJobSpec {
  clipId: string;
  sourceVideoPath?: string;
  startTime: number;
  duration: number;
  cropParams: CropParameters;
  title?: string;
  hook?: string;
  captionText?: string;
  captionConfig: {
    style: 'minimal' | 'bold' | 'dynamic' | 'highlight';
    fontFamily: string;
    position: 'top' | 'middle' | 'bottom';
    watermarkText?: string;
    watermarkEnabled: boolean;
  };
  isDemo?: boolean;
}

export interface RenderProgressEvent {
  clipId: string;
  progressPercent: number;
  status: 'rendering' | 'completed' | 'failed';
  videoUrl?: string;
  errorMessage?: string;
}

// In-memory render job progress cache for live status polling
export const activeRenderJobs = new Map<string, RenderProgressEvent>();

export class VideoProcessingService {
  private static renderedDir = path.join(process.cwd(), 'public', 'rendered');

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
   * Renders a real 9:16 1080x1920 MP4 clip using FFmpeg.
   * In Production Mode, requires an existing, valid sourceVideoPath.
   */
  public static async renderClip(
    spec: RenderJobSpec,
    onProgress?: (event: RenderProgressEvent) => void
  ): Promise<{ localPath: string; videoUrl: string }> {
    this.ensureRenderedDir();

    const isDemo = spec.isDemo === true;
    const outputFileName = `clip-${spec.clipId}.mp4`;
    const outputPath = path.join(this.renderedDir, outputFileName);
    const publicUrl = `/rendered/${outputFileName}`;

    const updateStatus = (
      percent: number,
      status: 'rendering' | 'completed' | 'failed',
      error?: string
    ) => {
      const event: RenderProgressEvent = {
        clipId: spec.clipId,
        progressPercent: percent,
        status,
        videoUrl: status === 'completed' ? publicUrl : undefined,
        errorMessage: error,
      };
      activeRenderJobs.set(spec.clipId, event);
      if (onProgress) onProgress(event);
    };

    updateStatus(10, 'rendering');

    const hasSource = spec.sourceVideoPath && fs.existsSync(spec.sourceVideoPath);

    // Strict Production Check: NEVER use testsrc as a fallback in production mode!
    if (!isDemo && !hasSource) {
      const errorMsg = 'Source video could not be prepared for processing.';
      updateStatus(0, 'failed', errorMsg);
      throw new Error(errorMsg);
    }

    // Build filter complex
    // 1. Pan/Scan Crop
    const centerX = Math.min(100, Math.max(0, spec.cropParams.speakerCenterXPercent ?? 50));
    const cropFilter = `crop='min(iw, ih*9/16)':'ih':'min(max(0, iw*(${centerX}/100) - (ow/2)), iw-ow)':'0',scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920`;

    // 2. Caption burn-in text
    const rawCaption = spec.captionText || spec.hook || spec.title || 'ClipForge AI';
    const cleanText = rawCaption
      .replace(/['":\\%\n\r]/g, ' ')
      .trim()
      .substring(0, 85);

    let captionY = '1580'; // bottom by default
    if (spec.captionConfig.position === 'top') captionY = '260';
    if (spec.captionConfig.position === 'middle') captionY = '960';

    let captionStyleFilter = `drawtext=text='${cleanText}':fontcolor=white:fontsize=44:x=(w-tw)/2:y=${captionY}:box=1:boxcolor=black@0.65:boxborderw=14`;
    if (spec.captionConfig.style === 'bold') {
      captionStyleFilter = `drawtext=text='${cleanText}':fontcolor=yellow:fontsize=48:x=(w-tw)/2:y=${captionY}:box=1:boxcolor=black@0.8:boxborderw=16`;
    } else if (spec.captionConfig.style === 'highlight') {
      captionStyleFilter = `drawtext=text='${cleanText}':fontcolor=0x38bdf8:fontsize=46:x=(w-tw)/2:y=${captionY}:box=1:boxcolor=black@0.7:boxborderw=14`;
    } else if (spec.captionConfig.style === 'minimal') {
      captionStyleFilter = `drawtext=text='${cleanText}':fontcolor=white:fontsize=38:x=(w-tw)/2:y=${captionY}:box=1:boxcolor=black@0.4:boxborderw=10`;
    }

    // 3. Watermark
    const watermarkFilter =
      spec.captionConfig.watermarkEnabled && spec.captionConfig.watermarkText
        ? `,drawtext=text='${spec.captionConfig.watermarkText.replace(/['":\\%\n\r]/g, '')}':fontcolor=white@0.85:fontsize=28:x=w-tw-40:y=70:box=1:boxcolor=black@0.5:boxborderw=8`
        : '';

    // Audio filter with broadcast loudnorm normalization
    const audioFilter = 'loudnorm=I=-16:TP=-1.5:LRA=11';

    return new Promise((resolve, reject) => {
      let args: string[] = [];

      if (hasSource) {
        // PRODUCTION & REAL SOURCE RENDERING
        const startSec = Math.max(0, spec.startTime);
        args = [
          '-y',
          '-ss',
          startSec.toFixed(2),
          '-i',
          spec.sourceVideoPath!,
          '-t',
          spec.duration.toFixed(2),
          '-vf',
          `${cropFilter},${captionStyleFilter}${watermarkFilter}`,
          '-af',
          audioFilter,
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '22',
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'aac',
          '-b:a',
          '192k',
          outputPath,
        ];
      } else {
        // DEMO ONLY: Synthetic generator allowed exclusively when isDemo === true
        args = [
          '-y',
          '-f',
          'lavfi',
          '-i',
          `testsrc=duration=${spec.duration.toFixed(1)}:size=1080x1920:rate=30`,
          '-f',
          'lavfi',
          '-i',
          `sine=frequency=320:duration=${spec.duration.toFixed(1)}`,
          '-vf',
          captionStyleFilter + watermarkFilter,
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '24',
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'aac',
          '-b:a',
          '128k',
          outputPath,
        ];
      }

      updateStatus(30, 'rendering');

      const ffmpegBinary = fs.existsSync('/usr/bin/ffmpeg') ? '/usr/bin/ffmpeg' : 'ffmpeg';
      const ffmpeg = spawn(ffmpegBinary, args);

      const progressTimer = setInterval(() => {
        const current = activeRenderJobs.get(spec.clipId);
        if (current && current.progressPercent < 85) {
          updateStatus(current.progressPercent + 15, 'rendering');
        }
      }, 600);

      ffmpeg.stderr.on('data', () => {
        // stream monitoring
      });

      ffmpeg.on('close', async (code) => {
        clearInterval(progressTimer);
        if (code === 0 && fs.existsSync(outputPath)) {
          // Persist to storage abstraction
          try {
            await StorageService.upload(outputPath, outputFileName);
          } catch (e) {
            console.warn('[VideoProcessingService] Storage sync notice:', e);
          }

          updateStatus(100, 'completed');
          resolve({ localPath: outputPath, videoUrl: publicUrl });
        } else {
          const err = `FFmpeg rendering failed with exit code ${code}`;
          updateStatus(0, 'failed', err);
          reject(new Error(err));
        }
      });

      ffmpeg.on('error', (err) => {
        clearInterval(progressTimer);
        updateStatus(0, 'failed', err.message);
        reject(err);
      });
    });
  }
}
