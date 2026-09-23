/**
 * Job Service — ClipForge AI
 *
 * Real In-Memory Processing Job Manager.
 * Tracks asynchronous video processing pipeline states, step indices,
 * rendering milestones, and final verified artifacts.
 */

import { ClipItem, ProjectItem } from '../db/store.js';

export type JobPipelineStep =
  | 'QUEUED'
  | 'ACQUIRING'
  | 'VERIFYING_SOURCE'
  | 'EXTRACTING_AUDIO'
  | 'TRANSCRIBING'
  | 'SELECTING_CLIPS'
  | 'RENDERING'
  | 'VERIFYING_CLIPS'
  | 'DONE'
  | 'FAILED';

export interface ProcessingJob {
  jobId: string;
  state: JobPipelineStep;
  statusMessage: string;
  stepIndex: number;
  totalSteps: number;
  progressPercent: number;
  sourceVideoPath?: string; // Immutable path stored on the job record
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

  public static getStepPercent(state: JobPipelineStep, renderedCount = 0, totalCount = 0): number {
    switch (state) {
      case 'QUEUED':
        return 0;
      case 'ACQUIRING':
        return 15;
      case 'VERIFYING_SOURCE':
        return 30;
      case 'EXTRACTING_AUDIO':
        return 45;
      case 'TRANSCRIBING':
        return 60;
      case 'SELECTING_CLIPS':
        return 75;
      case 'RENDERING':
        if (totalCount > 0) {
          const ratio = Math.min(1, Math.max(0, renderedCount / totalCount));
          return Math.round(85 + ratio * 9); // 85% to 94%
        }
        return 85;
      case 'VERIFYING_CLIPS':
        return 96;
      case 'DONE':
        return 100;
      case 'FAILED':
        return 0;
      default:
        return 0;
    }
  }

  public static createJob(initialMessage = 'Queued video processing request'): ProcessingJob {
    const jobId = 'job-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8);
    const job: ProcessingJob = {
      jobId,
      state: 'QUEUED',
      statusMessage: initialMessage,
      stepIndex: 0,
      totalSteps: 8,
      progressPercent: 0,
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
    if (updates.state || typeof updates.renderedClipsCount === 'number') {
      job.progressPercent = this.getStepPercent(
        job.state,
        job.renderedClipsCount,
        job.totalClipsToRender
      );
    }
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
    job.progressPercent = this.getStepPercent(
      state,
      job.renderedClipsCount,
      job.totalClipsToRender
    );
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

    job.state = 'FAILED';
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

    job.state = 'DONE';
    job.statusMessage = `Successfully rendered and verified ${clips.length} HD vertical clips.`;
    job.stepIndex = 8;
    job.progressPercent = 100;
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
