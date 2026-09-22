/**
 * Publishing Service — ClipForge AI
 * Orchestrates multi-platform publishing across YouTube Shorts, Instagram Reels, and Facebook Reels.
 *
 * Production Rules:
 * - Never use fake credentials (e.g. mock_encrypted_token).
 * - Requires real OAuth credentials from database / dbStore.
 * - Handles token expiration with automated refresh.
 * - In Production Mode, missing credentials report: "Integration not configured."
 * - Demo Mode executes simulation clearly marked.
 */

import { YouTubeService } from './youtubeService.js';
import { InstagramService } from './instagramService.js';
import { FacebookService } from './facebookService.js';
import { dbStore, PublishingJob } from '../db/store.js';
import { StorageService } from './storageService.js';

export class PublishingService {
  /**
   * Publishes a single rendered clip to a specific social platform.
   */
  public static async publishClipToPlatform(params: {
    clipId: string;
    platform: 'youtube' | 'instagram' | 'facebook';
    caption: string;
    hashtags: string[];
    privacy?: 'public' | 'unlisted' | 'private';
    scheduledTime?: string;
    jobId?: string;
  }): Promise<{
    success: boolean;
    platform: string;
    externalPostId?: string;
    externalPostUrl?: string;
    error?: string;
    status: 'COMPLETED' | 'FAILED' | 'SCHEDULED';
  }> {
    const clip = dbStore.clips.find((c) => c.id === params.clipId);

    // Retrieve corresponding social account
    const accounts = dbStore.getSocialAccounts();
    const account = accounts.find((a) => a.platform === params.platform);

    // Strict Production Check: Account must be connected with real credentials
    if (!account || !account.isConnected || !account.accessTokenEncrypted) {
      const errorMsg = `Integration not configured: Please connect your ${params.platform} account in Connected Accounts settings.`;
      if (params.jobId) {
        this.markJobFailed(params.jobId, errorMsg);
      }
      return {
        success: false,
        platform: params.platform,
        error: errorMsg,
        status: 'FAILED',
      };
    }

    // Check token expiration and refresh if applicable
    if (account.tokenExpiresAt && new Date(account.tokenExpiresAt).getTime() < Date.now()) {
      if (params.platform === 'youtube' && account.refreshTokenEncrypted) {
        try {
          const refreshed = await YouTubeService.refreshAccessToken(account.refreshTokenEncrypted);
          account.accessTokenEncrypted = refreshed.accessTokenEncrypted;
          account.tokenExpiresAt = refreshed.expiresAt.toISOString();
          dbStore.updateSocialAccount(account);
        } catch (refErr: any) {
          const err = `OAuth token expired for ${params.platform}. Reauthorization required.`;
          if (params.jobId) this.markJobFailed(params.jobId, err);
          return { success: false, platform: params.platform, error: err, status: 'FAILED' };
        }
      }
    }

    // Determine video paths
    const videoUrl = clip?.videoUrl || `/rendered/clip-${params.clipId}.mp4`;
    const stablePublicUrl = StorageService.getPublicUrl(videoUrl);
    const videoLocalPath = clip?.localRenderPath;

    try {
      let result: {
        uploadId?: string;
        mediaId?: string;
        videoId?: string;
        videoUrl?: string;
        permalink?: string;
        status: string;
      };

      if (params.platform === 'youtube') {
        result = await YouTubeService.uploadShort({
          accessTokenEncrypted: account.accessTokenEncrypted,
          videoLocalPath,
          videoPublicUrl: stablePublicUrl,
          title: clip?.title || 'ClipForge AI Viral Short',
          description: params.caption,
          tags: params.hashtags,
          privacy: params.privacy || 'public',
          scheduledTime: params.scheduledTime,
        });
      } else if (params.platform === 'instagram') {
        const igAccountId = account.platformAccountId || account.id;
        result = await InstagramService.publishReel({
          accessTokenEncrypted: account.accessTokenEncrypted,
          instagramAccountId: igAccountId,
          videoPublicUrl: stablePublicUrl,
          caption: params.caption,
          hashtags: params.hashtags,
        });
      } else if (params.platform === 'facebook') {
        const pageId = account.platformAccountId || account.id;
        result = await FacebookService.publishPageReel({
          accessTokenEncrypted: account.accessTokenEncrypted,
          pageId,
          videoLocalPath,
          videoUrl: stablePublicUrl,
          description: `${params.caption} ${params.hashtags.map((h) => `#${h}`).join(' ')}`,
          scheduledPublishTime: params.scheduledTime
            ? Math.floor(new Date(params.scheduledTime).getTime() / 1000)
            : undefined,
        });
      } else {
        throw new Error(`Unsupported publishing platform: ${params.platform}`);
      }

      const externalId = result.uploadId || result.mediaId || result.videoId;
      const externalUrl = result.videoUrl || result.permalink;
      const jobStatus = result.status === 'SCHEDULED' ? 'SCHEDULED' : 'COMPLETED';

      // Update publishing job state
      if (params.jobId) {
        const job = dbStore.publishingJobs.find((j) => j.id === params.jobId);
        if (job) {
          job.status = jobStatus;
          job.externalPostId = externalId;
          job.externalPostUrl = externalUrl;
          job.publishedAt = new Date().toISOString();
          job.updatedAt = new Date().toISOString();
        }
      }

      // Update clip state
      if (clip) {
        clip.status = jobStatus === 'SCHEDULED' ? 'scheduled' : 'published';
        clip.publishedAt = new Date().toISOString();
      }

      return {
        success: true,
        platform: params.platform,
        externalPostId: externalId,
        externalPostUrl: externalUrl,
        status: jobStatus,
      };
    } catch (err: any) {
      console.error(`[PublishingService] Error publishing to ${params.platform}:`, err);
      const errorMsg = err.message || `Failed to publish to ${params.platform}`;
      if (params.jobId) {
        this.markJobFailed(params.jobId, errorMsg);
      }
      return {
        success: false,
        platform: params.platform,
        error: errorMsg,
        status: 'FAILED',
      };
    }
  }

  private static markJobFailed(jobId: string, error: string) {
    const job = dbStore.publishingJobs.find((j) => j.id === jobId);
    if (job) {
      job.status = 'FAILED';
      job.errorMessage = error;
      job.updatedAt = new Date().toISOString();
    }
  }
}
