/**
 * Job Service — ClipForge AI
 *
 * Real In-Memory Processing Job Manager.
 * Tracks asynchronous video processing pipeline states, step indices,
 * rendering milestones, and final verified artifacts.
 */

import { ClipItem, ProjectItem } from '../db/store.js';

export type JobPipelineStep =
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
  | 'SOURCE_FAILED'
  | 'RENDERING_FAILED';

export interface ProcessingJob {
  jobId: string;
  state: JobPipelineStep;
  statusMessage: string;
  stepIndex: number; // 0 to 9
  totalSteps: number; // 9
  renderedClipsCount: number;
  totalClipsToRender: number;
  error?: string;
  errorCode?: string;
  failedClipId?: string;
  createdAt: number;
  updatedAt: number;
  project?: ProjectItem;
  clips?: ClipItem[];
}

export class JobService {
  private static jobs = new Map<string, ProcessingJob>();

  public static createJob(initialMessage = 'Received video processing request'): ProcessingJob {
    const jobId = 'job-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8);
    const job: ProcessingJob = {
      jobId,
      state: 'SOURCE_URL_RECEIVED',
      statusMessage: initialMessage,
      stepIndex: 0,
      totalSteps: 9,
      renderedClipsCount: 0,
      totalClipsToRender: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.jobs.set(jobId, job);
    return job;
  }

  public static getJob(jobId: string): ProcessingJob | undefined {
    return this.jobs.get(jobId);
  }

  public static updateJob(
    jobId: string,
    updates: Partial<ProcessingJob>
  ): ProcessingJob | undefined {
    const job = this.jobs.get(jobId);
    if (!job) return undefined;
    Object.assign(job, updates, { updatedAt: Date.now() });
    return job;
  }

  public static updateState(
    jobId: string,
    state: JobPipelineStep,
    statusMessage: string,
    stepIndex?: number
  ): ProcessingJob | undefined {
    const job = this.jobs.get(jobId);
    if (!job) return undefined;

    job.state = state;
    job.statusMessage = statusMessage;
    if (typeof stepIndex === 'number') {
      job.stepIndex = stepIndex;
    }
    job.updatedAt = Date.now();
    return job;
  }

  public static failJob(
    jobId: string,
    error: string,
    errorCode: string,
    failedClipId?: string
  ): ProcessingJob | undefined {
    const job = this.jobs.get(jobId);
    if (!job) return undefined;

    const isRendering = job.state === 'CLIPS_RENDERING' || errorCode === 'RENDERING_FAILED';
    job.state = isRendering ? 'RENDERING_FAILED' : 'SOURCE_FAILED';
    job.error = error;
    job.errorCode = errorCode;
    if (failedClipId) job.failedClipId = failedClipId;
    job.statusMessage = error;
    job.updatedAt = Date.now();
    return job;
  }

  public static completeJob(
    jobId: string,
    project: ProjectItem,
    clips: ClipItem[]
  ): ProcessingJob | undefined {
    const job = this.jobs.get(jobId);
    if (!job) return undefined;

    job.state = 'COMPLETED';
    job.statusMessage = `Successfully rendered and verified ${clips.length} HD vertical clips.`;
    job.stepIndex = 9;
    job.renderedClipsCount = clips.length;
    job.totalClipsToRender = clips.length;
    job.project = project;
    job.clips = clips;
    job.updatedAt = Date.now();
    return job;
  }

  public static cleanupOldJobs(maxAgeMs = 1000 * 60 * 60) {
    const now = Date.now();
    for (const [id, job] of this.jobs.entries()) {
      if (now - job.updatedAt > maxAgeMs) {
        this.jobs.delete(id);
      }
    }
  }
}
