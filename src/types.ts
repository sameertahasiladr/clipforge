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
  avatarUrl: string;
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
  status: 'draft' | 'queued' | 'scheduled' | 'published';
  captionStyle: 'minimal' | 'bold' | 'dynamic' | 'highlight';
  fontFamily: string;
  captionPosition: 'top' | 'middle' | 'bottom';
  watermarkEnabled: boolean;
  watermarkText: string;
  speakerCenterXPercent: number;
  fullText: string;
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
  avatarUrl: string;
  isConnected: boolean;
  connectedAt: string;
  accountName?: string;
  accountHandle?: string;
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

export interface PublishJob {
  id: string;
  clipId: string;
  platform: 'instagram' | 'facebook' | 'youtube';
  socialAccountId: string;
  title: string;
  caption: string;
  status: 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed';
  scheduledAt?: string;
  publishedAt?: string;
  errorMessage?: string;
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
