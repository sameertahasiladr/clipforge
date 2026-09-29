/**
 * ClipForge AI — Server Entry Point
 * Express REST API backend with Vite integration, Gemini AI services,
 * real FFmpeg video rendering, OAuth multi-platform publishing, PostgreSQL persistence, and background worker queue.
 */

import express, { Request, Response } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import fs from 'fs';
import multer from 'multer';

import {
  ClipItem,
  ProjectItem,
  ScheduledPostItem,
  SocialAccountItem,
  PublishingJob,
} from './server/db/store.ts';
import { Database } from './server/db/database.ts';
import { ProjectRepository } from './server/repositories/projectRepository.ts';
import { ClipRepository } from './server/repositories/clipRepository.ts';
import { JobRepository } from './server/repositories/jobRepository.ts';
import { SocialAccountRepository } from './server/repositories/socialAccountRepository.ts';
import { PublishingRepository } from './server/repositories/publishingRepository.ts';
import { ScheduleRepository } from './server/repositories/scheduleRepository.ts';
import { UserRepository } from './server/repositories/userRepository.ts';
import { StorageService } from './server/services/storageService.ts';
import { analyzeVideoWithGemini, regenerateCaptionWithGemini } from './server/services/geminiService.ts';
import { YouTubeService } from './server/services/youtubeService.ts';
import { SourceAcquisitionService } from './server/services/sourceAcquisitionService.ts';
import { YouTubeSearchService } from './server/services/youtubeSearchService.ts';
import { TranscriptionService, TranscriptSegment } from './server/services/transcriptionService.ts';
import {
  VideoProcessingService,
  activeRenderJobs,
} from './server/services/videoProcessingService.ts';
import { PublishingService } from './server/services/publishingService.ts';
import { AnalyticsService } from './server/services/analyticsService.ts';
import { InstagramService } from './server/services/instagramService.ts';
import { FacebookService } from './server/services/facebookService.ts';
import { BackgroundWorkerService } from './server/services/workerService.ts';
import { CryptoService } from './server/services/cryptoService.ts';
import { JobService } from './server/services/jobService.ts';
import { CookieService } from './server/services/cookieService.ts';
import { OAuthStateService } from './server/services/oauthStateService.ts';
import { authenticateRequest, optionalAuthenticateRequest } from './server/middleware/auth.ts';

dotenv.config();

function extractProjectIdFromKey(key: string): string | null {
  const parts = key.split('/');
  if (parts.length >= 2 && parts[0] === 'projects') {
    return parts[1];
  }
  return null;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Prepend bundled/static FFmpeg and FFprobe binary locations to process.env.PATH
  try {
    const ffmpegBin = VideoProcessingService.getFfmpegBinary();
    const ffprobeBin = VideoProcessingService.getFfprobeBinary();
    const dirs: string[] = [];
    if (ffmpegBin && fs.existsSync(ffmpegBin)) dirs.push(path.dirname(ffmpegBin));
    if (ffprobeBin && fs.existsSync(ffprobeBin)) dirs.push(path.dirname(ffprobeBin));
    if (dirs.length > 0) {
      process.env.PATH = `${dirs.join(':')}:${process.env.PATH || ''}`;
    }
  } catch (err) {
    console.warn('[Server] Notice registering static ffmpeg path:', err);
  }

  app.use(express.json({ limit: '10mb' }));

  // Initialize persistent database connection (PostgreSQL when configured, resilient store otherwise)
  await Database.init();

  // Initialize storage abstractions & media directories
  StorageService.init();
  CookieService.init();
  VideoProcessingService.ensureRenderedDir();
  SourceAcquisitionService.init();

  // Ensure background PO-Token HTTP provider is alive on 127.0.0.1:4416
  await YouTubeService.ensurePotServer().catch((err) => {
    console.warn('[Server] Notice during POT server initialization:', err);
  });

  const uploadDir = path.join(process.cwd(), 'storage', 'uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const uploadStorage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, uploadDir);
    },
    filename: (_req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `upload-${uniqueSuffix}${ext}`);
    },
  });

  const upload = multer({
    storage: uploadStorage,
    limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (['.mp4', '.mov', '.webm', '.mkv'].includes(ext)) {
        cb(null, true);
      } else {
        cb(new Error('Only MP4, MOV, and WebM video files are supported.'));
      }
    },
  });

  // Dedicated chunked upload handler for large files (bypasses Cloud Run 32MB single request limits)
  const uploadChunk = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 30 * 1024 * 1024 }, // 30MB per chunk
  });

  const renderedStaticPath = path.join(process.cwd(), 'public', 'rendered');
  if (!fs.existsSync(renderedStaticPath)) {
    fs.mkdirSync(renderedStaticPath, { recursive: true });
  }
  app.use('/rendered', express.static(renderedStaticPath));

  const distRenderedPath = path.join(process.cwd(), 'dist', 'rendered');
  if (fs.existsSync(distRenderedPath)) {
    app.use('/rendered', express.static(distRenderedPath));
  }

  const storageStaticPath = path.join(process.cwd(), 'storage');
  if (!fs.existsSync(storageStaticPath)) {
    fs.mkdirSync(storageStaticPath, { recursive: true });
  }
  // Block any web browser access to the server-side storage directory (protects cookies, credentials, and source files)
  app.use('/storage', (_req: Request, res: Response) => {
    res.status(403).json({ error: 'Access forbidden: storage directory is strictly private and server-side.' });
  });

  // Initialize authoritative PostgreSQL database connection pool & migrations
  await Database.init().catch((err) => {
    console.error('[Server] Database initialization failed:', err);
  });

  // Initialize server-side autonomous background worker queue
  BackgroundWorkerService.start();

  process.on('SIGTERM', () => {
    YouTubeService.stopPotServer();
  });
  process.on('SIGINT', () => {
    YouTubeService.stopPotServer();
  });

  // ---------------------------------------------------------
  // Health & System Info
  // ---------------------------------------------------------
  app.get('/api/health', async (req: Request, res: Response) => {
    const isDbConnected = await Database.checkHealth();
    const ytDiagnostics = await YouTubeService.getYtDlpDiagnostics();
    res.json({
      status: 'ok',
      service: 'ClipForge AI Engine',
      environment: process.env.NODE_ENV || 'development',
      hasGeminiApiKey: Boolean(
        process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'
      ),
      ffmpegAvailable: VideoProcessingService.isFfmpegAvailable(),
      youtubeDownloader: ytDiagnostics,
      databaseConnected: isDbConnected,
      redisConnected: Boolean(process.env.REDIS_URL && !process.env.REDIS_URL.includes('your_')),
      storageConfigured: StorageService.isCloudStorageConfigured(),
      socialAPIs: {
        youtube: YouTubeService.isConfigured(),
        instagram: InstagramService.isConfigured(),
        facebook: FacebookService.isConfigured(),
      },
      workerActive: true,
      timestamp: new Date().toISOString(),
    });
  });

  // Dedicated diagnostic endpoint for yt-dlp, JS runtime, and EJS availability
  app.get('/api/system/yt-dlp-status', async (req: Request, res: Response) => {
    try {
      if (req.query.test === 'true') {
        await YouTubeService.testPublicYouTubeAccess();
      }
      const diagnostics = await YouTubeService.getYtDlpDiagnostics(req.query.refresh === 'true');
      res.json({ success: true, diagnostics });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Environment status inspection (never leaks actual secret values)
  app.get('/api/system/env-status', (req: Request, res: Response) => {
    const hasKey = (key?: string) => Boolean(key && !key.includes('your_') && key !== 'MY_GEMINI_API_KEY');

    const envs = [
      {
        service: 'Gemini AI API',
        keyName: 'GEMINI_API_KEY',
        status: hasKey(process.env.GEMINI_API_KEY) ? 'Configured' : 'Missing',
        required: true,
        instructions: 'Add your Gemini API Key in Settings or .env to enable semantic moment extraction.',
      },
      {
        service: 'PostgreSQL Database',
        keyName: 'DATABASE_URL',
        status: Database.isReady() || hasKey(process.env.DATABASE_URL) ? 'Configured' : 'Missing',
        required: false,
        instructions: 'PostgreSQL connection string for persistent cloud relational storage.',
      },
      {
        service: 'Redis Queue / BullMQ',
        keyName: 'REDIS_URL',
        status: hasKey(process.env.REDIS_URL) ? 'Configured' : 'Missing',
        required: false,
        instructions: 'Redis instance URL for distributed multi-node background scheduling.',
      },
      {
        service: 'YouTube Data & Upload OAuth',
        keyName: 'GOOGLE_CLIENT_ID / YOUTUBE_CLIENT_ID',
        status: YouTubeService.isConfigured() ? 'Configured' : 'Missing',
        required: false,
        instructions: 'Configure Google OAuth Client ID & Secret from Google Cloud Console with YouTube upload scope.',
      },
      {
        service: 'Instagram Graph API OAuth',
        keyName: 'INSTAGRAM_CLIENT_ID',
        status: InstagramService.isConfigured() ? 'Configured' : 'Missing',
        required: false,
        instructions: 'Configure Meta App ID and Secret with instagram_content_publish permission.',
      },
      {
        service: 'Facebook Reels OAuth',
        keyName: 'FACEBOOK_APP_ID',
        status: FacebookService.isConfigured() ? 'Configured' : 'Missing',
        required: false,
        instructions: 'Configure Meta App ID and Secret with pages_manage_posts permission.',
      },
      {
        service: 'Cloud Storage (S3/R2/GCS)',
        keyName: 'STORAGE_BUCKET',
        status: StorageService.isCloudStorageConfigured() ? 'Configured' : 'Missing',
        required: false,
        instructions: 'Object storage bucket credentials for external media persistence.',
      },
    ];

    res.json({ success: true, integrations: envs });
  });

  app.get('/api/system/schema', (req: Request, res: Response) => {
    try {
      const schemaPath = path.join(process.cwd(), 'server', 'db', 'migrations', '001_initial_schema.sql');
      const schemaSql = fs.readFileSync(schemaPath, 'utf8');
      res.json({ success: true, schemaSql });
    } catch {
      res.status(500).json({ error: 'Could not load schema sql file' });
    }
  });

  // ---------------------------------------------------------
  // Media Storage & Streaming Endpoints
  // ---------------------------------------------------------
  app.get('/api/media/url', authenticateRequest, async (req: Request, res: Response) => {
    try {
      const key = req.query.key as string;
      if (!key) {
        res.status(400).json({ error: 'Missing required query parameter "key"' });
        return;
      }
      const safeKey = StorageService.sanitizeKey(key);
      const projectId = extractProjectIdFromKey(safeKey);
      if (!projectId) {
        res.status(403).json({ error: 'Invalid or unauthorized media key.' });
        return;
      }
      const project = await ProjectRepository.findById(projectId, req.auth!.userId);
      if (!project) {
        res.status(404).json({ error: 'Project not found or unauthorized.' });
        return;
      }
      const url = await StorageService.getAccessUrl(safeKey);
      res.json({ success: true, key: safeKey, url, provider: StorageService.getProvider() });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to resolve media URL' });
    }
  });

  app.get('/api/media/metadata', authenticateRequest, async (req: Request, res: Response) => {
    try {
      const key = req.query.key as string;
      if (!key) {
        res.status(400).json({ error: 'Missing required query parameter "key"' });
        return;
      }
      const safeKey = StorageService.sanitizeKey(key);
      const projectId = extractProjectIdFromKey(safeKey);
      if (!projectId) {
        res.status(403).json({ error: 'Invalid or unauthorized media key.' });
        return;
      }
      const project = await ProjectRepository.findById(projectId, req.auth!.userId);
      if (!project) {
        res.status(404).json({ error: 'Project not found or unauthorized.' });
        return;
      }
      const metadata = await StorageService.getMetadata(safeKey);
      if (!metadata) {
        res.status(404).json({ error: 'Media not found' });
        return;
      }
      res.json({ success: true, key: safeKey, metadata });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to retrieve media metadata' });
    }
  });

  app.get('/api/media/stream', authenticateRequest, async (req: Request, res: Response) => {
    try {
      const key = req.query.key as string;
      if (!key) {
        res.status(400).json({ error: 'Missing required query parameter "key"' });
        return;
      }
      const safeKey = StorageService.sanitizeKey(key);
      const projectId = extractProjectIdFromKey(safeKey);
      if (!projectId) {
        res.status(403).json({ error: 'Invalid or unauthorized media key.' });
        return;
      }
      const project = await ProjectRepository.findById(projectId, req.auth!.userId);
      if (!project) {
        res.status(404).json({ error: 'Project not found or unauthorized.' });
        return;
      }
      const metadata = await StorageService.getMetadata(safeKey);
      if (!metadata) {
        res.status(404).json({ error: 'Media file not found' });
        return;
      }

      const fileSize = metadata.size;
      const range = req.headers.range;
      const contentType = metadata.contentType || StorageService.getMimeType(safeKey);

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = end - start + 1;
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': contentType,
        });
        const stream = StorageService.createStream(safeKey, { start, end });
        stream.pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Length': fileSize,
          'Content-Type': contentType,
          'Accept-Ranges': 'bytes',
        });
        const stream = StorageService.createStream(safeKey);
        stream.pipe(res);
      }
    } catch (err: any) {
      console.error('[API /api/media/stream] Error:', err);
      res.status(500).json({ error: err.message || 'Failed to stream media' });
    }
  });

  // ---------------------------------------------------------
  // Auth Endpoints (Authoritative Firebase user sync)
  // ---------------------------------------------------------
  app.get('/api/auth/me', authenticateRequest, (req: Request, res: Response) => {
    res.json({ success: true, user: req.auth!.user });
  });

  app.post('/api/auth/register', authenticateRequest, (req: Request, res: Response) => {
    res.json({
      success: true,
      user: req.auth!.user,
    });
  });

  app.post('/api/auth/login', authenticateRequest, (req: Request, res: Response) => {
    res.json({
      success: true,
      user: req.auth!.user,
    });
  });

  // ---------------------------------------------------------
  // Projects Endpoints
  // ---------------------------------------------------------
  app.get('/api/projects', authenticateRequest, async (req: Request, res: Response) => {
    try {
      const projects = await ProjectRepository.list(req.auth!.userId);
      res.json({ success: true, projects });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to fetch projects' });
    }
  });

  app.get('/api/projects/:id', authenticateRequest, async (req: Request, res: Response) => {
    try {
      const project = await ProjectRepository.findById(req.params.id, req.auth!.userId);
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      const clips = await ClipRepository.findByProjectId(req.params.id, req.auth!.userId);
      res.json({ success: true, project, clips });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to fetch project' });
    }
  });

  app.delete('/api/projects/:id', authenticateRequest, async (req: Request, res: Response) => {
    const projectId = req.params.id;
    try {
      const project = await ProjectRepository.findById(projectId, req.auth!.userId);
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      // Clean up project media through StorageService
      if (project.sourceVideoKey) {
        try {
          await StorageService.delete(project.sourceVideoKey);
        } catch {}
      }

      // Clean up persistent project directory: storage/projects/{projectId}/
      const projectDir = path.join(process.cwd(), 'storage', 'projects', projectId);
      if (fs.existsSync(projectDir)) {
        try {
          fs.rmSync(projectDir, { recursive: true, force: true });
        } catch (err) {
          console.warn(`[API] Failed to clean project directory for ${projectId}:`, err);
        }
      }

      // Clean up rendered clips output files and persistent storage keys associated with this project
      const associatedClips = await ClipRepository.findByProjectId(projectId, req.auth!.userId);
      for (const c of associatedClips) {
        if (c.videoStorageKey) {
          try {
            await StorageService.delete(c.videoStorageKey);
          } catch {}
        }
        if (c.thumbnailStorageKey) {
          try {
            await StorageService.delete(c.thumbnailStorageKey);
          } catch {}
        }
        if (c.localRenderPath && fs.existsSync(c.localRenderPath)) {
          try {
            fs.unlinkSync(c.localRenderPath);
          } catch {}
        }
      }

      // Remove from PostgreSQL with cascade
      await ProjectRepository.delete(projectId, req.auth!.userId);

      res.json({ success: true, message: 'Project, persistent source video, and associated clips deleted.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to delete project' });
    }
  });

  // ---------------------------------------------------------
  // Helper: Process Acquired Source Video Through Full Pipeline
  // Architecture: Acquire source video once -> local FFmpeg audio extraction
  // -> Gemini transcription & clip selection -> FFmpeg render from same video
  // ---------------------------------------------------------
  async function processAcquiredSource(
    jobId: string,
    sourceInfo: {
      sourceType: 'youtube' | 'upload';
      title: string;
      durationSeconds: number;
      thumbnailUrl: string;
      sourceVideoPath: string;
      originalSourceUrl: string;
    },
    options: {
      clipsCount: number;
      durationSeconds: number;
      aspectRatio: string;
      captionStyle: string;
      language: string;
    },
    userId: string
  ): Promise<{ project: ProjectItem; clips: ClipItem[] }> {
    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      throw new Error('Authenticated userId is required to process video and create project.');
    }
    const {
      clipsCount = 5,
      durationSeconds = 14,
      aspectRatio = '9:16',
      captionStyle = 'dynamic',
      language = 'English',
    } = options;

    let sourceVideoPath = sourceInfo.sourceVideoPath;
    let localAudioPath: string | null = null;
    let projectId: string | null = null;
    let projectRef: ProjectItem | null = null;

    try {
      if (!sourceVideoPath || !fs.existsSync(sourceVideoPath)) {
        const err = new Error('Source video file is not accessible on the server.');
        (err as any).code = 'SOURCE_NOT_FOUND';
        JobService.failJob(jobId, err.message, 'SOURCE_NOT_FOUND', undefined, userId);
        throw err;
      }

      // Store immutable source path on job record
      JobService.updateJob(jobId, { sourceVideoPath }, userId);

      // 4. EXTRACTING_AUDIO (45%): Extract audio LOCALLY from the acquired video using FFmpeg into audio.mp3
      JobService.updateState(
        jobId,
        'EXTRACTING_AUDIO',
        'Extracting audio track locally with FFmpeg into audio.mp3...',
        3,
        userId
      );
      try {
        const targetAudioPath = path.join(path.dirname(sourceVideoPath), 'audio.mp3');
        localAudioPath = await VideoProcessingService.extractAudioLocally(sourceVideoPath, targetAudioPath);
      } catch (audioErr: any) {
        console.error('[Pipeline] Local audio extraction error:', audioErr);
        const err = new Error(`Unable to extract audio track from source video: ${audioErr.message}`);
        (err as any).code = 'AUDIO_EXTRACTION_FAILED';
        JobService.failJob(jobId, err.message, 'AUDIO_EXTRACTION_FAILED', undefined, userId);
        throw err;
      }

      // 5. TRANSCRIBING (60%): Send extracted audio to Gemini for speech transcription
      JobService.updateState(
        jobId,
        'TRANSCRIBING',
        'Transcribing speech with word-level timestamps via Gemini...',
        4,
        userId
      );
      let transcriptSegments: TranscriptSegment[] = [];
      try {
        transcriptSegments = await TranscriptionService.generateTimestampedTranscript(
          {
            videoPath: sourceVideoPath,
            audioPath: localAudioPath,
            videoTitle: sourceInfo.title,
            durationSeconds: sourceInfo.durationSeconds,
          },
          { language }
        );
      } catch (err: any) {
        console.error('[Pipeline] Transcription error:', err);
        const customErr = new Error(err.message || 'Audio transcription could not be completed for the submitted video.');
        (customErr as any).code = err?.code || 'TRANSCRIPTION_FAILED';
        JobService.failJob(jobId, customErr.message, (customErr as any).code, undefined, userId);
        throw customErr;
      }

      if (!transcriptSegments || transcriptSegments.length === 0) {
        const err = new Error('No speech segments could be transcribed from the source video audio.');
        (err as any).code = 'TRANSCRIPTION_FAILED';
        JobService.failJob(jobId, err.message, 'TRANSCRIPTION_FAILED', undefined, userId);
        throw err;
      }

      // 6. SELECTING_CLIPS (75%): Semantic Gemini AI Analysis (identify real clip timestamps)
      JobService.updateState(
        jobId,
        'SELECTING_CLIPS',
        'Analyzing viral moments and retention velocity with Gemini...',
        5,
        userId
      );
      const transcriptText = transcriptSegments
        .map((s) => `[${s.startTime.toFixed(1)}s - ${s.endTime.toFixed(1)}s] ${s.speaker}: ${s.text}`)
        .join('\n');

      const count = Math.min(30, Math.max(1, Number(clipsCount) || 5));
      const targetDur = Math.min(180, Math.max(5, Number(durationSeconds) || 30));

      let geminiResult;
      try {
        geminiResult = await analyzeVideoWithGemini({
          youtubeUrl: sourceInfo.originalSourceUrl,
          videoTitle: sourceInfo.title,
          transcript: transcriptText,
          sourceDuration: sourceInfo.durationSeconds,
          requestedClipsCount: count,
          durationSeconds: targetDur,
          language,
          captionStyle,
        });
      } catch (err: any) {
        console.error('[Pipeline] Gemini analysis error:', err);
        const customErr = new Error(err.message || 'AI analysis is unavailable. Please configure GEMINI_API_KEY.');
        (customErr as any).code = err?.code || 'GEMINI_ANALYSIS_FAILED';
        JobService.failJob(jobId, customErr.message, (customErr as any).code, undefined, userId);
        throw customErr;
      }

      if (!geminiResult || !geminiResult.clips || geminiResult.clips.length === 0) {
        const err = new Error('Gemini analysis could not identify viral clips from this video.');
        (err as any).code = 'GEMINI_ANALYSIS_FAILED';
        JobService.failJob(jobId, err.message, 'GEMINI_ANALYSIS_FAILED', undefined, userId);
        throw err;
      }

      // Validate and clamp Gemini clip timestamps within source video duration
      const sourceDuration = sourceInfo.durationSeconds;
      const validClips: any[] = [];
      for (const c of geminiResult.clips) {
        let start = typeof c.startTimeSeconds === 'number' ? Math.max(0, c.startTimeSeconds) : 0;
        if (start >= sourceDuration - 2) {
          continue; // Cannot start clip within 2 seconds of source end
        }
        let dur = typeof c.durationSeconds === 'number' && c.durationSeconds > 0 ? c.durationSeconds : targetDur;
        if (start + dur > sourceDuration) {
          dur = Math.max(0, sourceDuration - start);
        }
        if (dur < 3) {
          continue; // Drop clips shorter than 3 seconds
        }
        validClips.push({
          ...c,
          startTimeSeconds: parseFloat(start.toFixed(2)),
          durationSeconds: parseFloat(dur.toFixed(2)),
          endTimeSeconds: parseFloat((start + dur).toFixed(2)),
        });
      }

      // If more than requested count, cap strictly to requested count
      if (validClips.length > count) {
        validClips.length = count;
      }

      // Re-index clip numbers 1 through validClips.length
      validClips.forEach((c, idx) => {
        c.clipNumber = idx + 1;
      });

      if (validClips.length === 0) {
        const err = new Error('No valid clip timestamps could be fitted within the source duration.');
        (err as any).code = 'INVALID_CLIP_TIMESTAMPS';
        JobService.failJob(jobId, err.message, 'INVALID_CLIP_TIMESTAMPS', undefined, userId);
        throw err;
      }

      // Create Project in Store with intermediate status: 'processing' (DO NOT use 'completed' early)
      projectId = 'proj-' + Math.random().toString(36).substring(2, 8);

      // Move source video into persistent per-project directory: storage/projects/{projectId}/source.mp4
      const projectDir = path.join(process.cwd(), 'storage', 'projects', projectId);
      if (!fs.existsSync(projectDir)) {
        fs.mkdirSync(projectDir, { recursive: true });
      }
      const persistentSourcePath = path.join(projectDir, 'source.mp4');
      if (fs.existsSync(sourceVideoPath) && sourceVideoPath !== persistentSourcePath) {
        fs.renameSync(sourceVideoPath, persistentSourcePath);
        sourceVideoPath = persistentSourcePath;
      }

      // Persist source video through StorageService
      const sourceVideoKey = StorageService.getSourceVideoKey(projectId, 'source.mp4');
      let sourceProvider: 'local' | 'gcs' = StorageService.getProvider();
      let sourceStorageStatus: 'ready' | 'pending' | 'failed' = 'ready';
      try {
        const uploadRes = await StorageService.upload(persistentSourcePath, sourceVideoKey, 'video/mp4');
        sourceProvider = uploadRes.provider;
        sourceStorageStatus = 'ready';
      } catch (uploadErr: any) {
        if (StorageService.getProvider() === 'gcs') {
          console.error(`[Pipeline] Source video GCS upload failed:`, uploadErr);
          const err = new Error(`Source video storage upload failed: ${uploadErr.message || uploadErr}`);
          (err as any).code = 'STORAGE_UPLOAD_FAILED';
          JobService.failJob(jobId, err.message, 'STORAGE_UPLOAD_FAILED', undefined, userId);
          throw err;
        }
        console.warn(`[Pipeline] Source video StorageService upload notice:`, uploadErr);
      }

      projectRef = {
        id: projectId,
        userId,
        title: sourceInfo.title,
        sourceUrl: sourceInfo.originalSourceUrl,
        sourceVideoPath: persistentSourcePath,
        sourceVideoKey,
        storageProvider: sourceProvider,
        storageStatus: sourceStorageStatus,
        sourceType: sourceInfo.sourceType,
        status: 'processing', // Must NOT be 'completed' before rendering finishes
        durationSeconds: sourceInfo.durationSeconds,
        clipsCount: validClips.length,
        publishedCount: 0,
        draftCount: validClips.length,
        thumbnailUrl: sourceInfo.thumbnailUrl,
        createdAt: new Date().toISOString(),
      };
      await ProjectRepository.create(projectRef, userId);

      // 7. RENDERING (85%-94%): Use the SAME acquired source video for FFmpeg cuts
      JobService.updateJob(jobId, {
        state: 'RENDERING',
        statusMessage: `Rendering 0 of ${validClips.length} vertical 9:16 clips with FFmpeg...`,
        stepIndex: 6,
        totalClipsToRender: validClips.length,
        renderedClipsCount: 0,
      }, userId);

      let completedRenderCount = 0;

      // Render all clips from SAME sourceVideoPath — NEVER SWALLOW ERRORS
      const renderPromises = validClips.map(async (c, i) => {
        const clipNum = i + 1;
        const clipId = `clip-${projectId}-${clipNum}`;
        const startSec = c.startTimeSeconds;
        const dur = c.durationSeconds;
        const speakerCenterXPercent = c.speakerCenterXPercent || 50;

        try {
          const renderResult = await VideoProcessingService.renderClip({
            clipId,
            sourceVideoPath, // IMMUTABLY READS FROM SAME SOURCE VIDEO
            startTime: startSec,
            duration: dur,
            cropParams: {
              targetAspectRatio: aspectRatio as any,
              speakerCenterXPercent,
            },
            title: c.title,
            hook: c.hook,
            captionText: '',
            captionConfig: {
              style: 'none',
              enabled: false,
              fontFamily: 'Plus Jakarta Sans',
              position: 'bottom',
              watermarkEnabled: false,
              watermarkText: '',
            },
          });

          completedRenderCount++;
          JobService.updateJob(jobId, {
            renderedClipsCount: completedRenderCount,
            statusMessage: `Rendered ${completedRenderCount} of ${validClips.length} clips with FFmpeg...`,
          }, userId);

          const completedClip: ClipItem = {
            id: clipId,
            projectId: projectId!,
            clipNumber: clipNum,
            title: c.title,
            hook: c.hook,
            description: `Extracted from "${sourceInfo.title}" (${Math.floor(startSec / 60)}:${(startSec % 60)
              .toString()
              .padStart(2, '0')}).`,
            suggestedCaption: c.suggestedCaption,
            hashtags: c.hashtags && c.hashtags.length > 0 ? c.hashtags : ['#shorts', '#reels', '#viral', '#growth'],
            callToAction: c.callToAction || 'Follow @clipforge for daily masterclass clips.',
            aiViralScore: c.aiViralScore || 90,
            startTimeSeconds: startSec,
            endTimeSeconds: parseFloat((startSec + dur).toFixed(2)),
            durationSeconds: dur,
            aspectRatio: aspectRatio as any,
            userId,
            thumbnailUrl: renderResult.thumbnailUrl,
            videoUrl: renderResult.videoUrl,
            localRenderPath: renderResult.localPath,
            videoStorageKey: renderResult.videoStorageKey,
            thumbnailStorageKey: renderResult.thumbnailStorageKey,
            storageProvider: (renderResult.storageProvider as any) || 'local',
            storageStatus: 'ready',
            status: 'draft',
            renderStatus: 'completed', // Verified real render with ffprobe
            captionStyle: captionStyle as any,
            fontFamily: 'Plus Jakarta Sans',
            captionPosition: 'bottom',
            watermarkEnabled: true,
            watermarkText: '@clipforge.ai',
            speakerCenterXPercent,
            fullText: `${c.hook} ${c.description || ''}`,
          };

          return completedClip;
        } catch (renderErr: any) {
          (renderErr as any).failedClipId = clipId;
          throw renderErr;
        }
      });

      // Await ALL render jobs strictly — DO NOT swallow errors
      const renderedClips = await Promise.all(renderPromises);

      // 8. VERIFY CLIPS (96%): Run ffprobe verification on every rendered clip file
      JobService.updateState(
        jobId,
        'VERIFYING_CLIPS',
        'Verifying rendered clip outputs with FFprobe...',
        7,
        userId
      );

      for (const cl of renderedClips) {
        if (!cl.localRenderPath || !fs.existsSync(cl.localRenderPath)) {
          throw new Error(`Rendered clip file not found at: ${cl.localRenderPath || 'unknown'}`);
        }
        const clipProbe = await VideoProcessingService.probeMedia(cl.localRenderPath);
        if (!clipProbe.hasVideoStream || clipProbe.duration < 1.0) {
          throw new Error(`Rendered clip ${cl.id} failed FFprobe verification.`);
        }
      }

      // Store verified clips in authoritative PostgreSQL database
      await ClipRepository.batchCreate(renderedClips, userId);

      // Mark project completed in PostgreSQL ONLY after ALL clips succeed and verify
      projectRef.status = 'completed';
      projectRef.clipsCount = renderedClips.length;
      projectRef.draftCount = renderedClips.length;
      await ProjectRepository.update(projectId, {
        status: 'completed',
        clipsCount: renderedClips.length,
        draftCount: renderedClips.length,
      }, userId);

      // 9. DONE (100%): Complete the job with real project and clips
      JobService.completeJob(jobId, projectRef, renderedClips, userId);

      return {
        project: projectRef,
        clips: renderedClips,
      };
    } catch (pipelineErr: any) {
      // Cleanup any partially generated output files
      if (projectId) {
        for (let i = 1; i <= options.clipsCount; i++) {
          const partialClipPath = path.join(process.cwd(), 'public', 'rendered', `clip-${projectId}-${i}.mp4`);
          const partialThumbPath = path.join(process.cwd(), 'public', 'rendered', `thumb-${projectId}-${i}.jpg`);
          SourceAcquisitionService.cleanTemporaryFile(partialClipPath);
          SourceAcquisitionService.cleanTemporaryFile(partialThumbPath);
        }
      }

      // Mark project failed if it was initialized
      if (projectRef) {
        projectRef.status = 'failed';
      }

      const errorCode = pipelineErr?.code || (pipelineErr?.failedClipId ? 'RENDERING_FAILED' : 'PIPELINE_ERROR');
      JobService.failJob(
        jobId,
        pipelineErr?.message || 'Video processing pipeline encountered a failure.',
        errorCode,
        pipelineErr?.failedClipId,
        userId
      );

      throw pipelineErr;
    } finally {
      // 10. CLEAN UP: Delete derivative audio.wav and temporary job directory; preserve persistent project source video
      if (localAudioPath) {
        SourceAcquisitionService.cleanTemporaryFile(localAudioPath);
      }
      // Only delete temporary source video if it was NOT successfully moved to persistent project storage
      if (sourceVideoPath && (!projectRef?.sourceVideoPath || sourceVideoPath !== projectRef.sourceVideoPath)) {
        SourceAcquisitionService.cleanTemporaryFile(sourceVideoPath);
      }
      SourceAcquisitionService.cleanJobDirectory(jobId);
    }
  }

  // ---------------------------------------------------------
  // YouTube Video Search: Keywords & Channel URLs via YouTube Data API
  // ---------------------------------------------------------
  app.get('/api/youtube/search', async (req: Request, res: Response) => {
    try {
      const query = (req.query.q as string) || '';
      const maxResults = Math.min(25, Math.max(1, parseInt(req.query.maxResults as string, 10) || 12));

      if (!query.trim()) {
        res.json({ results: [], apiUsed: 'none', query: '' });
        return;
      }

      const searchResult = await YouTubeSearchService.searchVideos(query, maxResults);
      res.json(searchResult);
    } catch (err: any) {
      console.warn('[API /api/youtube/search] Search error:', err?.message || err);
      res.status(500).json({
        error: 'Failed to search YouTube videos. Please try again with keywords or channel URL.',
        details: err?.message,
      });
    }
  });

  // ---------------------------------------------------------
  // YouTube Cookies Configuration Endpoints (Protected)
  // ---------------------------------------------------------
  app.get('/api/youtube/cookies', authenticateRequest, (_req: Request, res: Response) => {
    try {
      const info = CookieService.getCookieInfo();
      res.json({ success: true, cookies: info });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/youtube/cookies', authenticateRequest, (req: Request, res: Response) => {
    try {
      const content = req.body?.cookies || (typeof req.body === 'string' ? req.body : '');
      if (!content || typeof content !== 'string') {
        res.status(400).json({ success: false, error: 'Please provide valid cookie content in Netscape format.' });
        return;
      }
      const updatedInfo = CookieService.saveCookies(content);
      res.json({
        success: true,
        message: 'YouTube cookies saved successfully.',
        cookies: updatedInfo,
      });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message || 'Failed to save cookies.' });
    }
  });

  app.delete('/api/youtube/cookies', authenticateRequest, (_req: Request, res: Response) => {
    try {
      CookieService.deleteCookies();
      res.json({
        success: true,
        message: 'YouTube cookies removed successfully.',
        cookies: CookieService.getCookieInfo(),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Failed to remove cookies.' });
    }
  });

  app.post('/api/youtube/cookies/test', authenticateRequest, async (_req: Request, res: Response) => {
    try {
      const result = await CookieService.testActiveCookies();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || 'Verification test failed.' });
    }
  });

  // ---------------------------------------------------------
  // Processing Job Status Polling Endpoint
  // ---------------------------------------------------------
  app.get('/api/videos/jobs/:jobId/status', authenticateRequest, async (req: Request, res: Response) => {
    const job = await JobService.getJobAsync(req.params.jobId, req.auth!.userId);
    if (!job) {
      res.status(404).json({ error: 'Processing job not found', code: 'JOB_NOT_FOUND' });
      return;
    }
    res.json(job);
  });

  // ---------------------------------------------------------
  // Complete Video Pipeline: YouTube URL Analysis
  // Single-video acquisition -> Local audio extraction -> Gemini -> FFmpeg renders
  // ---------------------------------------------------------
  app.post('/api/videos/analyze', authenticateRequest, async (req: Request, res: Response) => {
    try {
      const {
        youtubeUrl,
        clipsCount = 5,
        durationSeconds = 14,
        aspectRatio = '9:16',
        captionStyle = 'none',
        language = 'English',
        quality = '1080p',
        hasUserConfirmedRights = true,
      } = req.body;

      const targetClipsCount = Math.min(30, Math.max(1, parseInt(String(clipsCount), 10) || 5));

      // 1. Enforce copyright and rights confirmation
      VideoProcessingService.verifyContentRights(hasUserConfirmedRights);

      // 2. Validate YouTube source URL strictly
      const validation = YouTubeService.validateYouTubeUrl(youtubeUrl);
      if (!validation.isValid) {
        res.status(400).json({
          error: validation.error || 'Please enter a valid YouTube video URL.',
          step: 'source_validation',
          code: 'URL_INVALID',
        });
        return;
      }

      // Create asynchronous processing job in QUEUED state
      const job = JobService.createJob('Queued YouTube video processing request...', req.auth!.userId);

      // Return job identifier immediately for client status polling
      res.status(202).json({
        success: true,
        jobId: job.jobId,
        state: job.state,
        statusMessage: job.statusMessage,
        progressPercent: job.progressPercent,
      });

      // Execute entire pipeline in background
      (async () => {
        try {
          // 1. ACQUIRING (15%)
          JobService.updateState(job.jobId, 'ACQUIRING', `Acquiring source video from YouTube in ${quality || '1080p'} HD...`, 1, req.auth!.userId);

          let videoAcquisition;
          try {
            videoAcquisition = await SourceAcquisitionService.acquireYouTubeVideo(
              youtubeUrl,
              job.jobId,
              (state, detail) => {
                if (state === 'SOURCE_DOWNLOADING') {
                  JobService.updateState(job.jobId, 'ACQUIRING', `Acquiring source video from YouTube in ${quality || '1080p'} HD...`, 1, req.auth!.userId);
                }
              },
              quality || '1080p'
            );
          } catch (err: any) {
            console.warn('[API /api/videos/analyze] Video acquisition notice:', err?.message || err);
            JobService.failJob(
              job.jobId,
              err?.message || 'YouTube acquisition failed. Please use Direct Upload instead.',
              err?.code || 'YOUTUBE_UNKNOWN_ERROR',
              undefined,
              req.auth!.userId
            );
            return;
          }

          // 2. VERIFYING_SOURCE (30%)
          JobService.updateState(job.jobId, 'VERIFYING_SOURCE', 'Verifying acquired source video with FFprobe...', 2, req.auth!.userId);
          JobService.updateJob(job.jobId, { sourceVideoPath: videoAcquisition.sourceVideoPath }, req.auth!.userId);

          await processAcquiredSource(
            job.jobId,
            {
              sourceType: 'youtube',
              title: videoAcquisition.title,
              durationSeconds: videoAcquisition.durationSeconds,
              thumbnailUrl: videoAcquisition.thumbnailUrl,
              sourceVideoPath: videoAcquisition.sourceVideoPath,
              originalSourceUrl: youtubeUrl,
            },
            {
              clipsCount: targetClipsCount,
              durationSeconds: Number(durationSeconds),
              aspectRatio,
              captionStyle: 'none',
              language,
            },
            req.auth!.userId
          );
        } catch (bgErr: any) {
          console.error('[API /api/videos/analyze] Pipeline execution error:', bgErr);
        }
      })();
    } catch (err: unknown) {
      console.error('[API /api/videos/analyze] Error:', err);
      res.status(400).json({
        error:
          err instanceof Error
            ? err.message
            : 'Failed to initiate video processing. Please verify the URL is public or upload the file directly.',
      });
    }
  });

  // ---------------------------------------------------------
  // Complete Video Pipeline: Direct Video File Upload & Analyze
  // ---------------------------------------------------------
  app.post('/api/videos/upload-and-analyze', authenticateRequest, upload.single('videoFile'), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({
          error: 'No video file was uploaded. Please provide an MP4, MOV, or WebM file.',
        });
        return;
      }

      const {
        clipsCount = 5,
        durationSeconds = 14,
        aspectRatio = '9:16',
        captionStyle = 'none',
        language = 'English',
        hasUserConfirmedRights = 'true',
      } = req.body;

      const targetClipsCount = Math.min(30, Math.max(1, parseInt(String(clipsCount), 10) || 5));

      const rightsConfirmed = hasUserConfirmedRights === true || hasUserConfirmedRights === 'true';
      VideoProcessingService.verifyContentRights(rightsConfirmed);

      const filePath = req.file.path;
      const originalname = req.file.originalname;

      const job = JobService.createJob(`Queued uploaded file: ${originalname}`, req.auth!.userId);

      // Return job identifier immediately for client status polling
      res.status(202).json({
        success: true,
        jobId: job.jobId,
        state: job.state,
        statusMessage: job.statusMessage,
        progressPercent: job.progressPercent,
      });

      // Execute background upload validation and pipeline processing
      (async () => {
        try {
          // VERIFYING_SOURCE (30%)
          JobService.updateState(job.jobId, 'VERIFYING_SOURCE', 'Verifying uploaded video with FFprobe...', 2, req.auth!.userId);

          let acquisition;
          try {
            acquisition = await SourceAcquisitionService.acquireFromUpload(
              filePath,
              originalname,
              job.jobId
            );
          } catch (err: any) {
            JobService.failJob(
              job.jobId,
              err?.message || 'Uploaded file could not be verified with FFprobe.',
              (err as any)?.code || 'SOURCE_PROBE_FAILED',
              undefined,
              req.auth!.userId
            );
            return;
          }

          JobService.updateJob(job.jobId, { sourceVideoPath: acquisition.sourceVideoPath }, req.auth!.userId);

          await processAcquiredSource(
            job.jobId,
            {
              sourceType: 'upload',
              title: acquisition.title,
              durationSeconds: acquisition.durationSeconds,
              thumbnailUrl: acquisition.thumbnailUrl,
              sourceVideoPath: acquisition.sourceVideoPath,
              originalSourceUrl: `Direct Upload: ${originalname}`,
            },
            {
              clipsCount: targetClipsCount,
              durationSeconds: Number(durationSeconds),
              aspectRatio,
              captionStyle: 'none',
              language,
            },
            req.auth!.userId
          );
        } catch (bgErr: any) {
          console.error('[API /api/videos/upload-and-analyze] Pipeline execution error:', bgErr);
        }
      })();
    } catch (err: unknown) {
      console.error('[API /api/videos/upload-and-analyze] Error:', err);
      res.status(400).json({
        error:
          err instanceof Error
            ? err.message
            : 'Failed to process uploaded video. Please verify the file format and try again.',
      });
    }
  });

  // ---------------------------------------------------------
  // Chunked Upload: Handles Large Files (>32MB) Reliably
  // ---------------------------------------------------------
  app.post('/api/videos/upload-chunk', authenticateRequest, uploadChunk.single('chunk'), async (req: Request, res: Response) => {
    try {
      const { uploadId, chunkIndex, totalChunks, originalFilename } = req.body;
      if (!req.file || !uploadId || chunkIndex === undefined || totalChunks === undefined) {
        res.status(400).json({ error: 'Missing chunk payload or metadata (uploadId, chunkIndex, totalChunks).' });
        return;
      }

      const chunkNum = parseInt(chunkIndex, 10);
      const total = parseInt(totalChunks, 10);
      const chunkDir = path.join(uploadDir, `chunks-${uploadId}`);
      if (!fs.existsSync(chunkDir)) {
        fs.mkdirSync(chunkDir, { recursive: true });
      }

      const chunkPartPath = path.join(chunkDir, `part-${chunkNum.toString().padStart(6, '0')}`);
      fs.writeFileSync(chunkPartPath, req.file.buffer);

      // Check if this was the final chunk to assemble
      if (chunkNum === total - 1) {
        const ext = path.extname(originalFilename || '').toLowerCase() || '.mp4';
        const finalFileName = `upload-${uploadId}${ext}`;
        const finalFilePath = path.join(uploadDir, finalFileName);

        const writeStream = fs.createWriteStream(finalFilePath);
        for (let i = 0; i < total; i++) {
          const partPath = path.join(chunkDir, `part-${i.toString().padStart(6, '0')}`);
          if (!fs.existsSync(partPath)) {
            writeStream.destroy();
            res.status(400).json({ error: `Chunk part ${i} missing during assembly.` });
            return;
          }
          const partBuffer = fs.readFileSync(partPath);
          writeStream.write(partBuffer);
        }
        writeStream.end();

        // Clean up temporary chunks folder
        try {
          fs.rmSync(chunkDir, { recursive: true, force: true });
        } catch {}

        res.json({
          success: true,
          uploadId,
          completed: true,
          finalFileName,
        });
        return;
      }

      res.json({
        success: true,
        uploadId,
        chunkIndex: chunkNum,
        completed: false,
      });
    } catch (err: any) {
      console.error('[API /api/videos/upload-chunk] Error:', err);
      res.status(500).json({ error: err.message || 'Chunk processing failed' });
    }
  });

  app.post('/api/videos/finalize-upload-and-analyze', authenticateRequest, async (req: Request, res: Response) => {
    try {
      const {
        uploadId,
        originalFilename,
        clipsCount = 5,
        durationSeconds = 14,
        aspectRatio = '9:16',
        captionStyle = 'none',
        language = 'English',
        hasUserConfirmedRights = 'true',
      } = req.body;

      const targetClipsCount = Math.min(30, Math.max(1, parseInt(String(clipsCount), 10) || 5));

      if (!uploadId) {
        res.status(400).json({ error: 'Missing uploadId parameter.' });
        return;
      }

      const ext = path.extname(originalFilename || '').toLowerCase() || '.mp4';
      const finalFileName = `upload-${uploadId}${ext}`;
      const filePath = path.join(uploadDir, finalFileName);

      if (!fs.existsSync(filePath)) {
        res.status(404).json({ error: 'Assembled uploaded file was not found on server.' });
        return;
      }

      const rightsConfirmed = hasUserConfirmedRights === true || hasUserConfirmedRights === 'true';
      VideoProcessingService.verifyContentRights(rightsConfirmed);

      const job = JobService.createJob(
        `Queued uploaded file: ${originalFilename || 'Uploaded Video'}`,
        req.auth!.userId
      );

      res.status(202).json({
        success: true,
        jobId: job.jobId,
        state: job.state,
        statusMessage: job.statusMessage,
        progressPercent: job.progressPercent,
      });

      // Execute background upload validation and pipeline processing
      (async () => {
        try {
          JobService.updateState(job.jobId, 'VERIFYING_SOURCE', 'Verifying uploaded video with FFprobe...', 2, req.auth!.userId);

          let acquisition;
          try {
            acquisition = await SourceAcquisitionService.acquireFromUpload(
              filePath,
              originalFilename || 'Uploaded Video',
              job.jobId
            );
          } catch (err: any) {
            JobService.failJob(
              job.jobId,
              err?.message || 'Uploaded file could not be verified with FFprobe.',
              (err as any)?.code || 'SOURCE_PROBE_FAILED',
              undefined,
              req.auth!.userId
            );
            return;
          }

          JobService.updateJob(job.jobId, { sourceVideoPath: acquisition.sourceVideoPath }, req.auth!.userId);

          await processAcquiredSource(
            job.jobId,
            {
              sourceType: 'upload',
              title: acquisition.title,
              durationSeconds: acquisition.durationSeconds,
              thumbnailUrl: acquisition.thumbnailUrl,
              sourceVideoPath: acquisition.sourceVideoPath,
              originalSourceUrl: `Direct Upload: ${originalFilename || 'Uploaded Video'}`,
            },
            {
              clipsCount: targetClipsCount,
              durationSeconds: Number(durationSeconds),
              aspectRatio,
              captionStyle: 'none',
              language,
            },
            req.auth!.userId
          );
        } catch (bgErr: any) {
          console.error('[API finalize-upload-and-analyze] Pipeline execution error:', bgErr);
        }
      })();
    } catch (err: any) {
      console.error('[API finalize-upload-and-analyze] Error:', err);
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Failed to finalize uploaded video.',
      });
    }
  });

  // Alias /api/videos/process (Protected)
  app.post('/api/videos/process', authenticateRequest, (req: Request, res: Response) => {
    if (req.body && typeof req.body === 'object') {
      delete req.body.userId;
      delete req.body.user_id;
    }
    req.url = '/api/videos/analyze';
    (app as any).handle(req, res);
  });

  // ---------------------------------------------------------
  // Clips Management & Real Rendering Endpoints
  // ---------------------------------------------------------
  app.get('/api/clips', authenticateRequest, async (req: Request, res: Response) => {
    try {
      const clips = await ClipRepository.list(req.auth!.userId);
      res.json({ success: true, clips });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to fetch clips' });
    }
  });

  app.get('/api/clips/:id', authenticateRequest, async (req: Request, res: Response) => {
    try {
      const clip = await ClipRepository.findById(req.params.id, req.auth!.userId);
      if (!clip) {
        res.status(404).json({ error: 'Clip not found' });
        return;
      }
      res.json({ success: true, clip });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to fetch clip' });
    }
  });

  app.put('/api/clips/:id', authenticateRequest, async (req: Request, res: Response) => {
    try {
      const existing = await ClipRepository.findById(req.params.id, req.auth!.userId);
      if (!existing) {
        res.status(404).json({ error: 'Clip not found' });
        return;
      }
      const updated = await ClipRepository.update(req.params.id, req.body, req.auth!.userId);
      res.json({ success: true, clip: updated });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to update clip' });
    }
  });

  app.delete('/api/clips/:id', authenticateRequest, async (req: Request, res: Response) => {
    try {
      const clip = await ClipRepository.findById(req.params.id, req.auth!.userId);
      if (!clip) {
        res.status(404).json({ error: 'Clip not found' });
        return;
      }
      if (clip.videoStorageKey) {
        try {
          await StorageService.delete(clip.videoStorageKey);
        } catch {}
      }
      if (clip.thumbnailStorageKey) {
        try {
          await StorageService.delete(clip.thumbnailStorageKey);
        } catch {}
      }
      if (clip.localRenderPath && fs.existsSync(clip.localRenderPath)) {
        try {
          fs.unlinkSync(clip.localRenderPath);
        } catch {}
      }
      await ClipRepository.delete(req.params.id, req.auth!.userId);
      res.json({ success: true, deletedId: req.params.id });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to delete clip' });
    }
  });

  app.post('/api/clips/batch-delete', authenticateRequest, async (req: Request, res: Response) => {
    const ids: string[] = Array.isArray(req.body.ids) ? req.body.ids : [];
    try {
      for (const id of ids) {
        try {
          const clip = await ClipRepository.findById(id, req.auth!.userId);
          if (clip) {
            if (clip.videoStorageKey) await StorageService.delete(clip.videoStorageKey);
            if (clip.thumbnailStorageKey) await StorageService.delete(clip.thumbnailStorageKey);
            if (clip.localRenderPath && fs.existsSync(clip.localRenderPath)) {
              fs.unlinkSync(clip.localRenderPath);
            }
          }
        } catch {}
      }
      const deletedCount = await ClipRepository.batchDelete(ids, req.auth!.userId);
      res.json({ success: true, deletedCount, deletedIds: ids });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to batch delete clips' });
    }
  });

  // Real FFmpeg Video Rendering with Live Status Tracking
  app.post('/api/clips/:id/render', authenticateRequest, async (req: Request, res: Response) => {
    try {
      const clip = await ClipRepository.findById(req.params.id, req.auth!.userId);
      if (!clip) {
        res.status(404).json({ error: 'Clip not found' });
        return;
      }

      // Resolve source video path from project.sourceVideoPath — NEVER fall back to clip.localRenderPath
      const project = await ProjectRepository.findById(clip.projectId, req.auth!.userId);
      const sourceVideoPath = req.body.sourceVideoPath || project?.sourceVideoPath;

      if (!sourceVideoPath || !fs.existsSync(sourceVideoPath)) {
        res.status(409).json({
          error: 'The original source video is no longer available on disk for re-render. Please re-run the full video analysis to re-acquire the source video.',
          code: 'SOURCE_NO_LONGER_AVAILABLE',
        });
        return;
      }

      const renderResult = await VideoProcessingService.renderClip({
        clipId: clip.id,
        sourceVideoPath,
        startTime: req.body.startTimeSeconds ?? clip.startTimeSeconds,
        duration: req.body.durationSeconds ?? clip.durationSeconds,
        cropParams: {
          targetAspectRatio: req.body.aspectRatio ?? clip.aspectRatio,
          speakerCenterXPercent: req.body.speakerCenterXPercent ?? clip.speakerCenterXPercent,
        },
        title: req.body.title ?? clip.title,
        hook: req.body.hook ?? clip.hook,
        captionText: req.body.captionText ?? clip.hook,
        captionConfig: {
          style: req.body.captionStyle ?? clip.captionStyle,
          fontFamily: req.body.fontFamily ?? clip.fontFamily,
          position: req.body.captionPosition ?? clip.captionPosition,
          watermarkText: req.body.watermarkText ?? clip.watermarkText,
          watermarkEnabled: req.body.watermarkEnabled ?? clip.watermarkEnabled,
        },
      });

      const updated = await ClipRepository.update(clip.id, {
        videoUrl: renderResult.videoUrl,
        thumbnailUrl: renderResult.thumbnailUrl,
        localRenderPath: renderResult.localPath,
        videoStorageKey: renderResult.videoStorageKey,
        thumbnailStorageKey: renderResult.thumbnailStorageKey,
        storageProvider: (renderResult.storageProvider as any) || 'local',
        storageStatus: 'ready',
        renderStatus: 'completed',
      }, req.auth!.userId);

      res.json({
        success: true,
        message: 'Clip rendered successfully with FFmpeg in 9:16 vertical MP4 format.',
        renderStatus: 'completed',
        videoUrl: renderResult.videoUrl,
        clip: updated,
      });
    } catch (err: any) {
      console.error('[API /api/clips/:id/render] Error:', err);
      res.status(500).json({ error: err.message || 'FFmpeg video rendering failed.' });
    }
  });

  // Polling endpoint for active render progress
  app.get('/api/clips/:id/render-status', authenticateRequest, async (req: Request, res: Response) => {
    const clip = await ClipRepository.findById(req.params.id, req.auth!.userId);
    if (!clip) {
      res.status(404).json({ error: 'Clip not found' });
      return;
    }

    const job = activeRenderJobs.get(req.params.id);
    if (!job) {
      const clipFileName = req.params.id.startsWith('clip-') ? `${req.params.id}.mp4` : `clip-${req.params.id}.mp4`;
      const filePath = path.join(process.cwd(), 'public', 'rendered', clipFileName);
      if (fs.existsSync(filePath)) {
        res.json({
          clipId: req.params.id,
          progressPercent: 100,
          status: 'completed',
          videoUrl: `/rendered/${clipFileName}`,
        });
        return;
      }
      res.json({ clipId: req.params.id, progressPercent: 0, status: 'idle' });
      return;
    }
    res.json(job);
  });

  // ---------------------------------------------------------
  // AI Caption & Hook Regeneration
  // ---------------------------------------------------------
  app.post('/api/ai/regenerate-caption', authenticateRequest, async (req: Request, res: Response) => {
    const { clipTitle, hook, tone = 'hype', platform = 'instagram' } = req.body;
    try {
      const aiResult = await regenerateCaptionWithGemini({
        clipTitle,
        hook,
        tone,
        platform,
      });

      if (aiResult) {
        res.json({ success: true, data: aiResult });
        return;
      }
    } catch (err) {
      console.warn('[API /api/ai/regenerate-caption] Gemini error:', err);
    }

    res.status(500).json({
      error: 'Failed to regenerate caption with Gemini AI. Ensure GEMINI_API_KEY is configured.',
    });
  });

  // ---------------------------------------------------------
  // Real Social Accounts & OAuth Routes
  // ---------------------------------------------------------
  app.get('/api/social/accounts', authenticateRequest, async (req: Request, res: Response) => {
    try {
      const accounts = await SocialAccountRepository.list(req.auth!.userId);
      res.json({ success: true, accounts });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to fetch social accounts' });
    }
  });

  // Connect routes
  app.post('/api/social/instagram/connect', authenticateRequest, (req: Request, res: Response) => {
    if (!InstagramService.isConfigured()) {
      res.status(400).json({
        error:
          'Instagram OAuth is not configured. Please set INSTAGRAM_CLIENT_ID and INSTAGRAM_CLIENT_SECRET in environment settings.',
        isConfigured: false,
      });
      return;
    }

    const stateToken = OAuthStateService.createState(req.auth!.userId, 'instagram');
    const redirectUri = `${process.env.APP_URL || 'http://localhost:3000'}/api/social/instagram/callback`;
    const authUrl = InstagramService.getAuthorizationUrl(redirectUri, stateToken);
    res.json({ success: true, authUrl, isConfigured: true });
  });

  app.get('/api/social/instagram/callback', async (req: Request, res: Response) => {
    try {
      const code = req.query.code as string;
      const state = req.query.state as string;
      if (!code) throw new Error('Authorization code missing.');

      const stateValidation = OAuthStateService.validateAndConsumeState(state, 'instagram');
      if (!stateValidation.valid || !stateValidation.userId) {
        res.status(400).send(`<html><body><h3>Instagram Connection Failed</h3><p>OAuth CSRF security validation failed: ${stateValidation.error || 'Invalid or expired state'}</p></body></html>`);
        return;
      }

      const redirectUri = `${process.env.APP_URL || 'http://localhost:3000'}/api/social/instagram/callback`;
      const targetUserId = stateValidation.userId;

      const result = await InstagramService.handleCallback(code, redirectUri);
      await SocialAccountRepository.upsert({
        id: `acc_${targetUserId}_ig`,
        platform: 'instagram',
        accountUsername: `@${result.account.username}`,
        channelOrPageName: result.account.name,
        avatarUrl: result.account.profilePictureUrl,
        isConnected: true,
        status: 'Connected',
        accessTokenEncrypted: result.accessTokenEncrypted,
        tokenExpiresAt: result.expiresAt.toISOString(),
      }, targetUserId);

      res.send(`<html><body><script>window.opener ? window.opener.postMessage({ type: 'OAUTH_SUCCESS', platform: 'instagram' }, '*') : window.location.href='/'; window.close();</script><p>Instagram Connected Successfully! You can close this window.</p></body></html>`);
    } catch (err: any) {
      res.status(400).send(`<html><body><h3>Instagram Connection Failed</h3><p>${err.message}</p></body></html>`);
    }
  });

  app.post('/api/social/facebook/connect', authenticateRequest, (req: Request, res: Response) => {
    if (!FacebookService.isConfigured()) {
      res.status(400).json({
        error:
          'Facebook OAuth is not configured. Please set FACEBOOK_APP_ID and FACEBOOK_APP_SECRET in environment settings.',
        isConfigured: false,
      });
      return;
    }

    const stateToken = OAuthStateService.createState(req.auth!.userId, 'facebook');
    const redirectUri = `${process.env.APP_URL || 'http://localhost:3000'}/api/social/facebook/callback`;
    const authUrl = FacebookService.getAuthorizationUrl(redirectUri, stateToken);
    res.json({ success: true, authUrl, isConfigured: true });
  });

  app.get('/api/social/facebook/callback', async (req: Request, res: Response) => {
    try {
      const code = req.query.code as string;
      const state = req.query.state as string;
      if (!code) throw new Error('Authorization code missing.');

      const stateValidation = OAuthStateService.validateAndConsumeState(state, 'facebook');
      if (!stateValidation.valid || !stateValidation.userId) {
        res.status(400).send(`<html><body><h3>Facebook Connection Failed</h3><p>OAuth CSRF security validation failed: ${stateValidation.error || 'Invalid or expired state'}</p></body></html>`);
        return;
      }

      const redirectUri = `${process.env.APP_URL || 'http://localhost:3000'}/api/social/facebook/callback`;
      const targetUserId = stateValidation.userId;

      const result = await FacebookService.handleCallback(code, redirectUri);
      await SocialAccountRepository.upsert({
        id: `acc_${targetUserId}_fb`,
        platform: 'facebook',
        accountUsername: result.primaryPage.name,
        channelOrPageName: result.primaryPage.category || 'Facebook Page',
        avatarUrl: result.primaryPage.pictureUrl,
        isConnected: true,
        status: 'Connected',
        accessTokenEncrypted: result.accessTokenEncrypted,
        tokenExpiresAt: result.expiresAt.toISOString(),
      }, targetUserId);

      res.send(`<html><body><script>window.opener ? window.opener.postMessage({ type: 'OAUTH_SUCCESS', platform: 'facebook' }, '*') : window.location.href='/'; window.close();</script><p>Facebook Page Connected Successfully! You can close this window.</p></body></html>`);
    } catch (err: any) {
      res.status(400).send(`<html><body><h3>Facebook Connection Failed</h3><p>${err.message}</p></body></html>`);
    }
  });

  app.post('/api/social/youtube/connect', authenticateRequest, (req: Request, res: Response) => {
    if (!YouTubeService.isConfigured()) {
      res.status(400).json({
        error:
          'YouTube OAuth is not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in environment settings.',
        isConfigured: false,
      });
      return;
    }

    const stateToken = OAuthStateService.createState(req.auth!.userId, 'youtube');
    const redirectUri = `${process.env.APP_URL || 'http://localhost:3000'}/api/social/youtube/callback`;
    const authUrl = YouTubeService.getAuthorizationUrl(redirectUri, stateToken);
    res.json({ success: true, authUrl, isConfigured: true });
  });

  app.get('/api/social/youtube/callback', async (req: Request, res: Response) => {
    try {
      const code = req.query.code as string;
      const state = req.query.state as string;
      if (!code) throw new Error('Authorization code missing.');

      const stateValidation = OAuthStateService.validateAndConsumeState(state, 'youtube');
      if (!stateValidation.valid || !stateValidation.userId) {
        res.status(400).send(`<html><body><h3>YouTube Connection Failed</h3><p>OAuth CSRF security validation failed: ${stateValidation.error || 'Invalid or expired state'}</p></body></html>`);
        return;
      }

      const redirectUri = `${process.env.APP_URL || 'http://localhost:3000'}/api/social/youtube/callback`;
      const targetUserId = stateValidation.userId;

      const result = await YouTubeService.handleCallback(code, redirectUri);
      await SocialAccountRepository.upsert({
        id: `acc_${targetUserId}_yt`,
        platform: 'youtube',
        accountUsername: result.channel.title,
        channelOrPageName: result.channel.id,
        avatarUrl: result.channel.avatarUrl,
        isConnected: true,
        status: 'Connected',
        accessTokenEncrypted: result.accessTokenEncrypted,
        refreshTokenEncrypted: result.refreshTokenEncrypted,
        tokenExpiresAt: result.expiresAt.toISOString(),
      }, targetUserId);

      res.send(`<html><body><script>window.opener ? window.opener.postMessage({ type: 'OAUTH_SUCCESS', platform: 'youtube' }, '*') : window.location.href='/'; window.close();</script><p>YouTube Channel Connected Successfully! You can close this window.</p></body></html>`);
    } catch (err: any) {
      res.status(400).send(`<html><body><h3>YouTube Connection Failed</h3><p>${err.message}</p></body></html>`);
    }
  });

  app.post('/api/social/:platform/disconnect', authenticateRequest, async (req: Request, res: Response) => {
    const platform = req.params.platform as 'instagram' | 'facebook' | 'youtube';
    try {
      await SocialAccountRepository.disconnect(platform, req.auth!.userId);
      res.json({ success: true, platform, isConnected: false });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to disconnect account' });
    }
  });

  // ---------------------------------------------------------
  // Multi-Platform Publishing & Real Job Queue
  // ---------------------------------------------------------
  app.post('/api/publish', authenticateRequest, async (req: Request, res: Response) => {
    const {
      clipId,
      clipTitle,
      caption,
      hashtags = [],
      platforms = ['instagram'],
      publishMode = 'immediate',
      scheduledTime,
    } = req.body;

    try {
      const clip = clipId ? await ClipRepository.findById(clipId, req.auth!.userId) : null;
      if (clipId && !clip) {
        res.status(404).json({ error: 'Clip not found or unauthorized' });
        return;
      }
      const createdJobs: PublishingJob[] = [];

      for (const platform of platforms as Array<'instagram' | 'facebook' | 'youtube'>) {
        const jobId = 'job_' + Math.random().toString(36).substring(2, 9);
        const newJob: PublishingJob = {
          id: jobId,
          userId: req.auth!.userId,
          clipId: clipId || (clip ? clip.id : ''),
          clipTitle: clipTitle || clip?.title || 'ClipForge Short',
          platform,
          accountId: `acc_${platform}`,
          status: 'QUEUED',
          scheduledAt: publishMode === 'scheduled' ? scheduledTime : undefined,
          retryCount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        const saved = await PublishingRepository.create(newJob);
        createdJobs.push(saved);
      }

      if (clip) {
        await ClipRepository.update(clip.id, {
          status: publishMode === 'scheduled' ? 'scheduled' : 'published',
        }, req.auth!.userId);
      }

      res.json({
        success: true,
        jobs: createdJobs,
        message: 'Production Mode — Publishing jobs submitted to automated queue.',
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to create publishing job' });
    }
  });

  app.post('/api/schedule', authenticateRequest, async (req: Request, res: Response) => {
    const { clipId, clipTitle, platforms, scheduledDate, scheduledTime, timezone } = req.body;

    try {
      if (clipId) {
        const clip = await ClipRepository.findById(clipId, req.auth!.userId);
        if (!clip) {
          res.status(404).json({ error: 'Clip not found or unauthorized' });
          return;
        }
      }

      const newScheduled: ScheduledPostItem = {
        id: 'sched-' + Math.random().toString(36).substring(2, 8),
        clipId,
        clipTitle: clipTitle || 'Scheduled Clip',
        platforms: platforms || ['instagram'],
        scheduledDate: scheduledDate || new Date(Date.now() + 86400000).toISOString().split('T')[0],
        scheduledTime: scheduledTime || '14:00',
        timezone: timezone || 'UTC',
        status: 'scheduled',
      };

      const savedScheduled = await ScheduleRepository.create(newScheduled, req.auth!.userId);

      for (const platform of newScheduled.platforms) {
        const scheduledDateTime = `${newScheduled.scheduledDate}T${newScheduled.scheduledTime}:00Z`;
        await PublishingRepository.create({
          id: 'job_' + Math.random().toString(36).substring(2, 9),
          userId: req.auth!.userId,
          clipId,
          clipTitle: newScheduled.clipTitle,
          platform,
          accountId: `acc_${platform}`,
          status: 'QUEUED',
          scheduledAt: scheduledDateTime,
          retryCount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }

      if (clipId) {
        await ClipRepository.update(clipId, { status: 'scheduled' }, req.auth!.userId);
      }

      res.json({ success: true, scheduledPost: savedScheduled });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to create scheduled post' });
    }
  });

  app.get('/api/publishing/jobs', authenticateRequest, async (req: Request, res: Response) => {
    try {
      const jobs = await PublishingRepository.list(req.auth!.userId);
      res.json({ success: true, jobs });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to fetch publishing jobs' });
    }
  });

  app.get('/api/publishing/jobs/:id', authenticateRequest, async (req: Request, res: Response) => {
    try {
      const job = await PublishingRepository.findById(req.params.id, req.auth!.userId);
      if (!job) {
        res.status(404).json({ error: 'Publishing job not found' });
        return;
      }
      res.json({ success: true, job });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to fetch publishing job' });
    }
  });

  app.post('/api/publishing/jobs/:id/retry', authenticateRequest, async (req: Request, res: Response) => {
    try {
      const job = await PublishingRepository.findById(req.params.id, req.auth!.userId);
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }
      const updated = await PublishingRepository.update(job.id, {
        status: 'QUEUED',
        scheduledAt: undefined,
        errorMessage: undefined,
        retryCount: (job.retryCount || 0) + 1,
      }, req.auth!.userId);
      res.json({ success: true, job: updated });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to retry job' });
    }
  });

  app.post('/api/publishing/jobs/:id/cancel', authenticateRequest, async (req: Request, res: Response) => {
    try {
      const job = await PublishingRepository.findById(req.params.id, req.auth!.userId);
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }
      const updated = await PublishingRepository.update(job.id, {
        status: 'CANCELLED',
      }, req.auth!.userId);
      res.json({ success: true, job: updated });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to cancel job' });
    }
  });

  app.get('/api/calendar', authenticateRequest, async (req: Request, res: Response) => {
    try {
      const scheduledPosts = await ScheduleRepository.list(req.auth!.userId);
      res.json({ success: true, scheduledPosts });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to fetch scheduled posts' });
    }
  });

  app.delete('/api/calendar/:id', authenticateRequest, async (req: Request, res: Response) => {
    try {
      const existing = await ScheduleRepository.findById(req.params.id, req.auth!.userId);
      if (!existing) {
        res.status(404).json({ error: 'Scheduled post not found' });
        return;
      }
      await ScheduleRepository.delete(req.params.id, req.auth!.userId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to delete scheduled post' });
    }
  });

  // ---------------------------------------------------------
  // Analytics
  // ---------------------------------------------------------
  app.get('/api/analytics', authenticateRequest, async (req: Request, res: Response) => {
    try {
      const metrics = await AnalyticsService.getMetrics(req.auth!.userId);
      res.json({ success: true, metrics });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to fetch analytics' });
    }
  });

  // ---------------------------------------------------------
  // 404 Catch-all for API Routes
  // ---------------------------------------------------------
  app.all('/api/*', (req: Request, res: Response) => {
    res.status(404).json({ error: `API route not found: ${req.method} ${req.path}` });
  });

  // ---------------------------------------------------------
  // Vite Integration (Development vs Production)
  // ---------------------------------------------------------
  const distPath = path.join(process.cwd(), 'dist');
  const distIndexExists = fs.existsSync(path.join(distPath, 'index.html'));

  if (!distIndexExists || process.env.NODE_ENV === 'development') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[ClipForge AI Engine] Server active on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[ClipForge AI Engine] Fatal startup error:', err);
});
