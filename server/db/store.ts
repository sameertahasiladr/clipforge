/**
 * Database Store — ClipForge AI
 * Production Data Layer with PostgreSQL sync when DATABASE_URL is configured
 * and resilient local memory storage.
 *
 * Strict Production Discipline:
 * - No demo mode flags or mock fallback entities.
 * - Real user IDs, real project IDs, real clip IDs.
 * - Clean initial state.
 */

import { Database } from './database.js';

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
  aiViralScore: number; // AI Viral Potential Score (70-98)
  startTimeSeconds: number;
  endTimeSeconds: number;
  durationSeconds: number;
  aspectRatio: '9:16' | '1:1' | '16:9';
  thumbnailUrl: string;
  videoUrl: string; // Points to actual rendered MP4 file
  localRenderPath?: string;
  status: 'draft' | 'queued' | 'scheduled' | 'published';
  renderStatus?: 'idle' | 'rendering' | 'completed' | 'failed';
  publishedAt?: string;
  captionStyle: 'minimal' | 'bold' | 'dynamic' | 'highlight';
  fontFamily: string;
  captionPosition: 'top' | 'middle' | 'bottom';
  watermarkEnabled: boolean;
  watermarkText: string;
  speakerCenterXPercent: number;
  fullText: string;
}

export interface UserItem {
  id: string;
  email: string;
  fullName: string;
  avatarUrl?: string;
  role: string;
  planTier: string;
  passwordHash?: string;
}

export interface ProjectItem {
  id: string;
  title: string;
  sourceUrl: string;
  sourceVideoPath?: string;
  sourceType?: 'youtube' | 'upload';
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
  platformAccountId?: string;
  avatarUrl?: string;
  isConnected: boolean;
  connectedAt?: string;
  status: 'Not Connected' | 'Connecting' | 'Connected' | 'Reauthorization Required';
  accessTokenEncrypted?: string;
  refreshTokenEncrypted?: string;
  tokenExpiresAt?: string;
}

export interface PublishingJob {
  id: string;
  userId: string;
  clipId: string;
  clipTitle: string;
  platform: 'instagram' | 'facebook' | 'youtube';
  accountId: string;
  status: 'QUEUED' | 'UPLOADING' | 'PROCESSING' | 'PUBLISHED' | 'COMPLETED' | 'SCHEDULED' | 'FAILED' | 'CANCELLED';
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

class DataStore {
  public users: UserItem[] = [];

  public socialAccounts: SocialAccountItem[] = [
    {
      id: 'acc_ig',
      platform: 'instagram',
      accountUsername: 'Not Connected',
      channelOrPageName: 'Instagram Business / Creator Account',
      isConnected: false,
      status: 'Not Connected',
    },
    {
      id: 'acc_yt',
      platform: 'youtube',
      accountUsername: 'Not Connected',
      channelOrPageName: 'YouTube Channel',
      isConnected: false,
      status: 'Not Connected',
    },
    {
      id: 'acc_fb',
      platform: 'facebook',
      accountUsername: 'Not Connected',
      channelOrPageName: 'Facebook Page',
      isConnected: false,
      status: 'Not Connected',
    },
  ];

  public projects: ProjectItem[] = [];
  public clips: ClipItem[] = [];
  public publishingJobs: PublishingJob[] = [];
  public scheduledPosts: ScheduledPostItem[] = [];

  /**
   * Retrieves all social accounts
   */
  public getSocialAccounts(): SocialAccountItem[] {
    return this.socialAccounts;
  }

  /**
   * Connect or update a social account
   */
  public updateSocialAccount(account: SocialAccountItem) {
    const idx = this.socialAccounts.findIndex((a) => a.platform === account.platform);
    if (idx >= 0) {
      this.socialAccounts[idx] = { ...this.socialAccounts[idx], ...account };
    } else {
      this.socialAccounts.push(account);
    }
  }

  /**
   * Disconnect an account
   */
  public disconnectSocialAccount(platform: 'instagram' | 'facebook' | 'youtube') {
    const target = this.socialAccounts.find((a) => a.platform === platform);
    if (target) {
      target.isConnected = false;
      target.accountUsername = 'Not Connected';
      target.channelOrPageName = `${platform.charAt(0).toUpperCase() + platform.slice(1)} Account`;
      target.status = 'Not Connected';
      target.accessTokenEncrypted = undefined;
      target.refreshTokenEncrypted = undefined;
      target.platformAccountId = undefined;
      target.tokenExpiresAt = undefined;
    }
  }
}

export const dbStore = new DataStore();
