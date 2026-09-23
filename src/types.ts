/**
 * ClipForge AI — Application Type Definitions
 */

export type NavigationTab =
  | 'landing'
  | 'dashboard'
  | 'create'
  | 'projects'
  | 'clips'
  | 'scheduler'
  | 'calendar'
  | 'accounts'
  | 'analytics'
  | 'settings'
  | 'pricing';

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  role: 'creator' | 'pro' | 'agency' | 'admin';
  planTier: 'free' | 'creator' | 'pro' | 'agency';
  avatarUrl?: string;
}

export interface ClipItem {
  id: string;
  projectId: string;
  clipNumber: number;
  title: string;
  hook: string;
  description: string;
  suggestedCaption: string;
  hashtags: string[];
  callToAction: string;
  aiViralScore: number;
  startTimeSeconds: number;
  endTimeSeconds: number;
  durationSeconds: number;
  aspectRatio: '9:16' | '1:1' | '16:9';
  thumbnailUrl: string;
  videoUrl: string;
  localRenderPath?: string;
  status: 'draft' | 'queued' | 'scheduled' | 'published';
  captionStyle: 'minimal' | 'bold' | 'dynamic' | 'highlight';
  fontFamily: string;
  captionPosition: 'top' | 'middle' | 'bottom';
  watermarkEnabled: boolean;
  watermarkText: string;
  speakerCenterXPercent: number;
  fullText: string;
  renderStatus?: 'idle' | 'rendering' | 'completed' | 'failed';
}

export interface ProjectItem {
  id: string;
  title: string;
  sourceUrl: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  durationSeconds: number;
  clipsCount: number;
  publishedCount: number;
  draftCount: number;
  thumbnailUrl: string;
  createdAt: string;
}

export interface SocialAccountItem {
  id: string;
  platform: 'instagram' | 'facebook' | 'youtube';
  accountUsername: string;
  channelOrPageName: string;
  avatarUrl?: string;
  isConnected: boolean;
  connectedAt?: string;
  accountName?: string;
  accountHandle?: string;
  status: 'Not Connected' | 'Connecting' | 'Connected' | 'Reauthorization Required';
}

export interface YouTubeSearchResult {
  id: string;
  title: string;
  description: string;
  channelTitle: string;
  channelId?: string;
  channelUrl?: string;
  thumbnailUrl: string;
  durationSeconds: number;
  durationFormatted: string;
  publishedAt?: string;
  viewCount?: number;
  url: string;
  source: 'youtube_data_api' | 'youtube_direct_index';
}

export interface ScheduledPostItem {
  id: string;
  clipId: string;
  clipTitle: string;
  platforms: Array<'instagram' | 'facebook' | 'youtube'>;
  scheduledDate: string; // YYYY-MM-DD
  scheduledTime: string; // HH:mm
  timezone: string;
  status: 'scheduled' | 'published' | 'cancelled';
}

export type SocialAccount = SocialAccountItem;

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

export interface ProcessingJobStatus {
  jobId: string;
  state: JobPipelineStep;
  statusMessage: string;
  stepIndex: number;
  totalSteps: number;
  renderedClipsCount: number;
  totalClipsToRender: number;
  error?: string;
  errorCode?: string;
  failedClipId?: string;
  project?: ProjectItem;
  clips?: ClipItem[];
}

export interface PublishingJob {
  id: string;
  userId: string;
  clipId: string;
  clipTitle: string;
  platform: 'instagram' | 'facebook' | 'youtube';
  accountId: string;
  status: 'QUEUED' | 'UPLOADING' | 'PROCESSING' | 'PUBLISHED' | 'FAILED' | 'CANCELLED';
  scheduledAt?: string;
  startedAt?: string;
  completedAt?: string;
  publishedAt?: string;
  externalPostId?: string;
  externalPostUrl?: string;
  errorMessage?: string;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface EnvironmentIntegration {
  service: string;
  keyName: string;
  status: 'Configured' | 'Missing' | 'Invalid';
  required: boolean;
  instructions: string;
}

export interface AnalyticsSummary {
  totalViews: number;
  totalLikes: number;
  totalShares: number;
  totalComments: number;
  averageWatchTimeSeconds: number;
  completionRatePercent: number;
  platformBreakdown: {
    instagram: number;
    youtube: number;
    facebook: number;
  };
  aiObservations: string[];
}

export interface AnalyticsData {
  totalClips: number;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  avgWatchTimeSeconds: number;
  averageEngagementRate: number;
  bestPerformingClip: {
    title: string;
    views: number;
    engagement: number;
    platform: string;
  };
  platformBreakdown: Array<{
    platform: 'instagram' | 'youtube' | 'facebook';
    clips: number;
    views: number;
    engagement: number;
    sharePercent: number;
  }>;
  viewsOverTime: Array<{
    date: string;
    views: number;
    engagement: number;
  }>;
  aiInsights: string[];
}
