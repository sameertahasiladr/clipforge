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

async function parseResponse<T = any>(res: Response, fallbackError: string): Promise<T> {
  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');

  if (!isJson) {
    const text = await res.text().catch(() => '');
    const isHtml = text.includes('<!DOCTYPE') || text.includes('<!doctype') || text.includes('<html');
    if (!res.ok) {
      const err = new Error(
        res.status === 404
          ? 'API route not found or server is restarting.'
          : res.status >= 500
          ? `Server error (${res.status}). Please try again.`
          : (!isHtml && text.trim().length > 0 && text.length < 250)
          ? text.trim()
          : fallbackError
      );
      (err as any).code = `HTTP_${res.status}`;
      throw err;
    }
    const err = new Error(
      isHtml
        ? 'Received HTML page from server instead of JSON response. The server may be restarting or the route was not found.'
        : fallbackError
    );
    (err as any).code = 'INVALID_RESPONSE';
    throw err;
  }

  let data: any;
  try {
    data = await res.json();
  } catch {
    const err = new Error(fallbackError);
    (err as any).code = 'JSON_PARSE_ERROR';
    throw err;
  }

  if (!res.ok) {
    const err = new Error(data.error || data.message || fallbackError);
    if (data.code) (err as any).code = data.code;
    if (data.step) (err as any).step = data.step;
    throw err;
  }
  return data as T;
}

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
    return await parseResponse(res, 'Failed to search YouTube videos');
  },

  async getJobStatus(jobId: string): Promise<ProcessingJobStatus> {
    const res = await fetch(`/api/videos/jobs/${encodeURIComponent(jobId)}/status`);
    return await parseResponse<ProcessingJobStatus>(res, 'Failed to retrieve job status');
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
    let consecutiveErrors = 0;
    while (true) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      let job: ProcessingJobStatus;
      try {
        job = await this.getJobStatus(jobId);
        consecutiveErrors = 0;
      } catch (err: any) {
        consecutiveErrors++;
        // Retry through temporary 502/503 network blips
        if (consecutiveErrors > 5) {
          throw err;
        }
        continue;
      }

      onProgress?.(job);

      if (job.state === 'DONE' || job.state === 'COMPLETED') {
        if (!job.project || !job.clips) {
          throw new Error('Pipeline completed but returned empty project or clip artifacts.');
        }
        return {
          project: job.project,
          clips: job.clips,
          usedGemini: true,
          pipelineSteps: [
            'QUEUED',
            'ACQUIRING',
            'VERIFYING_SOURCE',
            'EXTRACTING_AUDIO',
            'TRANSCRIBING',
            'SELECTING_CLIPS',
            'RENDERING',
            'VERIFYING_CLIPS',
            'DONE',
          ],
        };
      }

      if (job.state === 'FAILED' || job.state === 'SOURCE_FAILED' || job.state === 'RENDERING_FAILED') {
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
      quality?: string;
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
    const data = await parseResponse<{ jobId: string }>(res, 'Failed to analyze video');
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
    const file = formData.get('videoFile') as File | null;

    // Use chunked upload for files to ensure requests never exceed Cloud Run 32MB payload limit
    if (file && file.size > 15 * 1024 * 1024) {
      const chunkSize = 8 * 1024 * 1024; // 8MB chunks
      const totalChunks = Math.ceil(file.size / chunkSize);
      const uploadId = `up_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(file.size, start + chunkSize);
        const chunkBlob = file.slice(start, end);

        const chunkFormData = new FormData();
        chunkFormData.append('chunk', chunkBlob, file.name);
        chunkFormData.append('uploadId', uploadId);
        chunkFormData.append('chunkIndex', String(i));
        chunkFormData.append('totalChunks', String(totalChunks));
        chunkFormData.append('originalFilename', file.name);

        const chunkRes = await fetch('/api/videos/upload-chunk', {
          method: 'POST',
          body: chunkFormData,
        });

        await parseResponse(chunkRes, `Upload failed at chunk ${i + 1}/${totalChunks}`);

        const uploadedBytes = end;
        const pct = Math.round((uploadedBytes / file.size) * 100);
        onProgress?.({
          jobId: uploadId,
          state: 'SOURCE_DOWNLOADING',
          progressPercent: Math.min(99, Math.max(5, pct)),
          statusMessage: `Uploading video to server: ${pct}% (${(uploadedBytes / (1024 * 1024)).toFixed(1)}MB / ${(file.size / (1024 * 1024)).toFixed(1)}MB)...`,
          stepIndex: 0,
          totalSteps: 7,
          renderedClipsCount: 0,
          totalClipsToRender: 0,
        });
      }

      // Finalize the assembled file on server and initiate video analysis pipeline
      const finalizeRes = await fetch('/api/videos/finalize-upload-and-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploadId,
          originalFilename: file.name,
          clipsCount: formData.get('clipsCount'),
          durationSeconds: formData.get('durationSeconds'),
          aspectRatio: formData.get('aspectRatio'),
          captionStyle: formData.get('captionStyle'),
          language: formData.get('language'),
          hasUserConfirmedRights: formData.get('hasUserConfirmedRights'),
        }),
      });

      const finalizeData = await parseResponse<{ jobId: string }>(finalizeRes, 'Failed to start video analysis pipeline after upload.');
      return this.pollJobUntilComplete(finalizeData.jobId, onProgress);
    } else {
      const res = await fetch('/api/videos/upload-and-analyze', {
        method: 'POST',
        body: formData,
      });
      const data = await parseResponse<{ jobId: string }>(res, 'Failed to upload and analyze video');
      return this.pollJobUntilComplete(data.jobId, onProgress);
    }
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

  async batchDeleteClips(ids: string[]): Promise<string[]> {
    const res = await fetch('/api/clips/batch-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    const data = await res.json();
    return data.deletedIds || ids;
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

  async getYouTubeCookies(): Promise<{ success: boolean; cookies: import('../types').CookieInfo }> {
    const res = await fetch('/api/youtube/cookies');
    return await res.json();
  },

  async saveYouTubeCookies(cookies: string): Promise<{ success: boolean; message: string; cookies: import('../types').CookieInfo }> {
    const res = await fetch('/api/youtube/cookies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookies }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to save cookies');
    }
    return data;
  },

  async deleteYouTubeCookies(): Promise<{ success: boolean; message: string; cookies: import('../types').CookieInfo }> {
    const res = await fetch('/api/youtube/cookies', { method: 'DELETE' });
    return await res.json();
  },

  async testYouTubeCookies(): Promise<{ success: boolean; message: string; details?: string }> {
    const res = await fetch('/api/youtube/cookies/test', { method: 'POST' });
    return await res.json();
  },
};
