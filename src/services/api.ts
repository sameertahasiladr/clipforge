/**
 * Client API Client — ClipForge AI
 * Communicates with the Express backend REST API in Production mode.
 */

import {
  ClipItem,
  ProjectItem,
  SocialAccount,
  ScheduledPostItem,
  PublishingJob,
  AnalyticsSummary,
  EnvironmentIntegration,
  YouTubeSearchResult,
  ProcessingJobStatus,
} from '../types';

export const apiClient = {
  async getHealth() {
    try {
      const res = await fetch('/api/health');
      return await res.json();
    } catch {
      return { status: 'offline', hasGeminiApiKey: false, ffmpegAvailable: false };
    }
  },

  async getEnvStatus(): Promise<EnvironmentIntegration[]> {
    try {
      const res = await fetch('/api/system/env-status');
      const data = await res.json();
      return data.integrations || [];
    } catch {
      return [];
    }
  },

  async getProjects(): Promise<{ data: ProjectItem[] }> {
    try {
      const res = await fetch('/api/projects');
      const data = await res.json();
      return { data: data.projects || [] };
    } catch {
      return { data: [] };
    }
  },

  async searchYouTube(
    query: string,
    maxResults: number = 12
  ): Promise<{ results: YouTubeSearchResult[]; apiUsed: string; query: string }> {
    const res = await fetch(
      `/api/youtube/search?q=${encodeURIComponent(query)}&maxResults=${maxResults}`
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to search YouTube videos');
    }
    return await res.json();
  },

  async getJobStatus(jobId: string): Promise<ProcessingJobStatus> {
    const res = await fetch(`/api/videos/jobs/${encodeURIComponent(jobId)}/status`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const customErr = new Error(err.error || 'Failed to retrieve job status');
      (customErr as any).code = err.code || 'JOB_STATUS_FAILED';
      throw customErr;
    }
    return await res.json();
  },

  async pollJobUntilComplete(
    jobId: string,
    onProgress?: (job: ProcessingJobStatus) => void
  ): Promise<{
    project: ProjectItem;
    clips: ClipItem[];
    usedGemini: boolean;
    pipelineSteps: string[];
  }> {
    while (true) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      const job = await this.getJobStatus(jobId);
      onProgress?.(job);

      if (job.state === 'COMPLETED') {
        if (!job.project || !job.clips) {
          throw new Error('Pipeline completed but returned empty project or clip artifacts.');
        }
        return {
          project: job.project,
          clips: job.clips,
          usedGemini: true,
          pipelineSteps: [
            'SOURCE_URL_RECEIVED',
            'SOURCE_VALIDATED',
            'SOURCE_ACCESSIBLE',
            'SOURCE_DOWNLOADING',
            'SOURCE_DOWNLOADED',
            'SOURCE_AUDIO_EXTRACTED',
            'SOURCE_TRANSCRIBED',
            'AI_ANALYZED',
            'CLIPS_RENDERING',
            'COMPLETED',
          ],
        };
      }

      if (job.state === 'SOURCE_FAILED' || job.state === 'RENDERING_FAILED') {
        const err = new Error(job.error || 'Video processing pipeline failed.');
        (err as any).code = job.errorCode;
        (err as any).failedClipId = job.failedClipId;
        (err as any).step = job.state.toLowerCase();
        throw err;
      }
    }
  },

  async analyzeVideo(
    params: {
      youtubeUrl: string;
      clipsCount: number;
      durationSeconds: number;
      aspectRatio: string;
      captionStyle: string;
      language: string;
      hasUserConfirmedRights: boolean;
    },
    onProgress?: (job: ProcessingJobStatus) => void
  ): Promise<{
    project: ProjectItem;
    clips: ClipItem[];
    usedGemini: boolean;
    pipelineSteps: string[];
  }> {
    const res = await fetch('/api/videos/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const customErr = new Error(err.error || 'Failed to analyze video');
      (customErr as any).code = err.code;
      (customErr as any).step = err.step;
      throw customErr;
    }
    const data = await res.json();
    if (!data.jobId) {
      throw new Error('Server did not return a valid processing job ID.');
    }

    return this.pollJobUntilComplete(data.jobId, onProgress);
  },

  async uploadAndAnalyzeVideo(
    formData: FormData,
    onProgress?: (job: ProcessingJobStatus) => void
  ): Promise<{
    project: ProjectItem;
    clips: ClipItem[];
    usedGemini: boolean;
    pipelineSteps: string[];
  }> {
    const res = await fetch('/api/videos/upload-and-analyze', {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const customErr = new Error(err.error || 'Failed to upload and analyze video');
      (customErr as any).code = err.code;
      (customErr as any).step = err.step;
      throw customErr;
    }
    const data = await res.json();
    if (!data.jobId) {
      throw new Error('Server did not return a valid processing job ID.');
    }

    return this.pollJobUntilComplete(data.jobId, onProgress);
  },

  async getClips(): Promise<{ data: ClipItem[] }> {
    try {
      const res = await fetch('/api/clips');
      const data = await res.json();
      return { data: data.clips || [] };
    } catch {
      return { data: [] };
    }
  },

  async updateClip(id: string, updates: Partial<ClipItem>): Promise<ClipItem> {
    const res = await fetch(`/api/clips/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    const data = await res.json();
    return data.clip;
  },

  async deleteClip(id: string): Promise<string> {
    const res = await fetch(`/api/clips/${id}`, { method: 'DELETE' });
    const data = await res.json();
    return data.deletedId;
  },

  async renderClip(id: string, overrides?: Partial<ClipItem>) {
    const res = await fetch(`/api/clips/${id}/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(overrides || {}),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Render failed');
    }
    return await res.json();
  },

  async getRenderStatus(clipId: string): Promise<{
    clipId: string;
    progressPercent: number;
    status: string;
    step?: string;
    videoUrl?: string;
    error?: string;
  }> {
    try {
      const res = await fetch(`/api/clips/${clipId}/render-status`);
      return await res.json();
    } catch {
      return { clipId, progressPercent: 0, status: 'idle' };
    }
  },

  async regenerateCaption(params: {
    clipTitle: string;
    hook: string;
    tone: string;
    platform: string;
  }) {
    const res = await fetch('/api/ai/regenerate-caption', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return await res.json();
  },

  async getSocialAccounts(): Promise<{ data: SocialAccount[] }> {
    try {
      const res = await fetch('/api/social/accounts');
      const data = await res.json();
      const accounts: SocialAccount[] = (data.accounts || []).map((a: any) => ({
        ...a,
        accountName: a.accountUsername || a.channelOrPageName || 'Social Account',
        accountHandle: a.accountUsername || 'creator',
      }));
      return { data: accounts };
    } catch {
      return { data: [] };
    }
  },

  async connectSocialOAuth(
    platform: 'instagram' | 'facebook' | 'youtube'
  ): Promise<{ authUrl?: string; account?: any }> {
    const res = await fetch(`/api/social/${platform}/connect`, {
      method: 'POST',
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `Failed to connect ${platform}`);
    }
    return data;
  },

  async disconnectSocial(
    platform: 'instagram' | 'facebook' | 'youtube'
  ): Promise<{ success: boolean }> {
    const res = await fetch(`/api/social/${platform}/disconnect`, {
      method: 'POST',
    });
    return await res.json();
  },

  async publishClips(params: {
    clipId: string;
    clipTitle: string;
    caption: string;
    hashtags: string[];
    platforms: string[];
    publishMode: 'immediate' | 'scheduled';
    scheduledTime?: string;
  }) {
    const res = await fetch('/api/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to submit publishing request');
    }
    return await res.json();
  },

  async schedulePost(params: {
    clipId: string;
    clipTitle: string;
    platforms: string[];
    scheduledDate: string;
    scheduledTime: string;
    timezone: string;
  }): Promise<ScheduledPostItem> {
    const res = await fetch('/api/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    return data.scheduledPost;
  },

  async getPublishingJobs(): Promise<{ data: PublishingJob[] }> {
    try {
      const res = await fetch('/api/publishing/jobs');
      const data = await res.json();
      return { data: data.jobs || [] };
    } catch {
      return { data: [] };
    }
  },

  async retryPublishingJob(jobId: string): Promise<PublishingJob> {
    const res = await fetch(`/api/publishing/jobs/${jobId}/retry`, { method: 'POST' });
    const data = await res.json();
    return data.job;
  },

  async cancelPublishingJob(jobId: string): Promise<PublishingJob> {
    const res = await fetch(`/api/publishing/jobs/${jobId}/cancel`, { method: 'POST' });
    const data = await res.json();
    return data.job;
  },

  async getCalendarPosts(): Promise<ScheduledPostItem[]> {
    const res = await fetch('/api/calendar');
    const data = await res.json();
    return data.scheduledPosts || [];
  },

  async deleteCalendarPost(id: string) {
    const res = await fetch(`/api/calendar/${id}`, { method: 'DELETE' });
    return await res.json();
  },

  async getAnalytics(): Promise<{ data: AnalyticsSummary }> {
    try {
      const res = await fetch('/api/analytics');
      const data = await res.json();
      return { data: data.metrics };
    } catch {
      return {
        data: {
          totalViews: 0,
          totalLikes: 0,
          totalShares: 0,
          totalComments: 0,
          averageWatchTimeSeconds: 0,
          completionRatePercent: 0,
          platformBreakdown: { instagram: 0, youtube: 0, facebook: 0 },
          aiObservations: ['No metrics recorded yet.'],
        },
      };
    }
  },

  async getDatabaseSchema(): Promise<string> {
    const res = await fetch('/api/system/schema');
    const data = await res.json();
    return data.schemaSql || '';
  },
};
