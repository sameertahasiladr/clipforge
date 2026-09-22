/**
 * Client API Client — ClipForge AI
 * Interacts with /api endpoints
 */

import {
  ClipItem,
  ProjectItem,
  SocialAccountItem,
  SocialAccount,
  ScheduledPostItem,
  PublishJob,
  AnalyticsData,
  AnalyticsSummary,
} from '../types';

export const apiClient = {
  async getHealth() {
    try {
      const res = await fetch('/api/health');
      return await res.json();
    } catch {
      return { status: 'offline', hasGeminiApiKey: false };
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

  async analyzeVideo(params: {
    youtubeUrl: string;
    clipsCount: number;
    durationSeconds: number;
    aspectRatio: string;
    captionStyle: string;
    language: string;
    hasUserConfirmedRights: boolean;
  }): Promise<{ project: ProjectItem; clips: ClipItem[]; usedGemini: boolean }> {
    const res = await fetch('/api/videos/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to analyze video');
    }
    return await res.json();
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

  async renderClip(id: string) {
    const res = await fetch(`/api/clips/${id}/render`, { method: 'POST' });
    return await res.json();
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
      const accounts: SocialAccount[] = (data.accounts || []).map((a: SocialAccountItem) => ({
        ...a,
        accountName: a.accountUsername || a.channelOrPageName || 'Connected Account',
        accountHandle: a.accountUsername || 'creator',
      }));
      return { data: accounts };
    } catch {
      return { data: [] };
    }
  },

  async connectSocial(platform: string): Promise<SocialAccountItem> {
    const res = await fetch(`/api/social/${platform}/connect`, { method: 'POST' });
    const data = await res.json();
    return data.account;
  },

  async connectSocialAccount(params: {
    platform: 'instagram' | 'facebook' | 'youtube';
    accountName: string;
    accountHandle: string;
    avatarUrl?: string;
  }): Promise<{ data: SocialAccount }> {
    const res = await fetch(`/api/social/${params.platform}/connect`, { method: 'POST' });
    const data = await res.json();
    return { data: data.account };
  },

  async disconnectSocial(platform: string): Promise<SocialAccountItem> {
    const res = await fetch(`/api/social/${platform}/disconnect`, { method: 'POST' });
    const data = await res.json();
    return data.account;
  },

  async disconnectSocialAccount(id: string): Promise<{ success: boolean }> {
    return { success: true };
  },

  async publishClips(params: {
    clipId: string;
    clipTitle: string;
    hook: string;
    caption: string;
    hashtags: string[];
    platforms: string[];
    publishMode: 'immediate' | 'scheduled';
    scheduledTime?: string;
    isDemo?: boolean;
  }) {
    const res = await fetch('/api/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return await res.json();
  },

  async createPublishJob(params: {
    clipId: string;
    platform: 'instagram' | 'facebook' | 'youtube';
    socialAccountId: string;
    title: string;
    caption: string;
    status: 'draft' | 'scheduled' | 'published';
    scheduledAt?: string;
  }): Promise<{ data: PublishJob }> {
    const job: PublishJob = {
      id: 'job-' + Math.random().toString(36).substring(2, 9),
      ...params,
      publishedAt: params.status === 'published' ? new Date().toISOString() : undefined,
    };
    return { data: job };
  },

  async getPublishJobs(): Promise<{ data: PublishJob[] }> {
    // Return sample seeded publish jobs
    const sampleJobs: PublishJob[] = [
      {
        id: 'job-01',
        clipId: 'clip-01',
        platform: 'instagram',
        socialAccountId: 'acc-ig',
        title: 'Nobody Tells You This About Success',
        caption: 'One small mindset shift completely alters daily execution. #reels',
        status: 'published',
        publishedAt: new Date(Date.now() - 3600000).toISOString(),
      },
      {
        id: 'job-02',
        clipId: 'clip-02',
        platform: 'youtube',
        socialAccountId: 'acc-yt',
        title: 'The AI Supercycle Explained in 14 Seconds',
        caption: 'Why foundational models are compounding. #Shorts',
        status: 'scheduled',
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
      },
      {
        id: 'job-03',
        clipId: 'clip-03',
        platform: 'facebook',
        socialAccountId: 'acc-fb',
        title: 'Founder Playbook: Speed Over Perfection',
        caption: 'Top founders make 10 decisions a day instead of 2 perfect ones.',
        status: 'published',
        publishedAt: new Date(Date.now() - 7200000).toISOString(),
      },
    ];
    return { data: sampleJobs };
  },

  async updatePublishJob(jobId: string, updates: Partial<PublishJob>): Promise<{ data: Partial<PublishJob> }> {
    return { data: { id: jobId, ...updates } };
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
    const summary: AnalyticsSummary = {
      totalViews: 1420000,
      totalLikes: 182400,
      totalShares: 48300,
      totalComments: 12800,
      averageWatchTimeSeconds: 11.8,
      completionRatePercent: 78.4,
      platformBreakdown: {
        instagram: 740000,
        youtube: 460000,
        facebook: 220000,
      },
      aiObservations: [
        'Clips with bold high-contrast subtitles achieved 31% higher completion rates.',
        '13.5-second clips showed 18% higher loop replays than 15-second clips.',
        'Question-based opening hooks increased comments by 2.4x across Instagram Reels.',
        'Optimal upload window for your audience is 12:00 PM – 2:30 PM PST.',
      ],
    };
    return { data: summary };
  },

  async getDatabaseSchema(): Promise<string> {
    const res = await fetch('/api/system/schema');
    const data = await res.json();
    return data.schemaSql || '';
  },
};
