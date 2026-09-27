/**
 * Publishing Service — ClipForge AI
 * Handles real production publishing to Instagram Reels, Facebook Reels, and YouTube Shorts.
 * Authoritative PostgreSQL-backed Social and Publishing Management.
 */

import { SocialAccountRepository } from '../repositories/socialAccountRepository.ts';
import { PublishingRepository } from '../repositories/publishingRepository.ts';
import { ClipRepository } from '../repositories/clipRepository.ts';
import { InstagramService } from './instagramService.ts';
import { FacebookService } from './facebookService.ts';
import { YouTubeService } from './youtubeService.ts';
import { StorageService } from './storageService.ts';

export class PublishingService {
  /**
   * Publishes or schedules a clip to a specific social platform
   */
  public static async publishClipToPlatform(params: {
    clipId: string;
    platform: 'instagram' | 'facebook' | 'youtube';
    caption: string;
    hashtags?: string[];
    privacy?: 'public' | 'private' | 'unlisted';
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
    const clip = await ClipRepository.findById(params.clipId);

    // Retrieve corresponding social account
    const accounts = await SocialAccountRepository.list();
    const account = accounts.find((a) => a.platform === params.platform);

    // Strict Production Check: Account must be connected with real credentials
    if (!account || !account.isConnected || !account.accessTokenEncrypted) {
      const errorMsg = `Integration not configured: Please connect your ${params.platform} account in Connected Accounts settings.`;
      if (params.jobId) {
        await this.markJobFailed(params.jobId, errorMsg);
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
          await SocialAccountRepository.upsert(account);
        } catch {
          const err = `OAuth token expired for ${params.platform}. Reauthorization required.`;
          if (params.jobId) await this.markJobFailed(params.jobId, err);
          return { success: false, platform: params.platform, error: err, status: 'FAILED' };
        }
      }
    }

    // Determine video paths
    const clipFileName = params.clipId.startsWith('clip-') ? `${params.clipId}.mp4` : `clip-${params.clipId}.mp4`;
    const videoUrl = clip?.videoUrl || `/rendered/${clipFileName}`;
    const stablePublicUrl = StorageService.getPublicUrl(videoUrl);
    const videoLocalPath = clip?.localRenderPath;

    try {
      let result: any;

      if (params.platform === 'instagram') {
        result = await InstagramService.publishReel({
          accessTokenEncrypted: account.accessTokenEncrypted || '',
          instagramAccountId: account.platformAccountId || account.id,
          videoPublicUrl: stablePublicUrl,
          caption: params.caption,
          hashtags: params.hashtags || [],
        });
      } else if (params.platform === 'facebook') {
        result = await FacebookService.publishPageReel({
          accessTokenEncrypted: account.accessTokenEncrypted || '',
          pageId: account.platformAccountId || account.id,
          videoUrl: stablePublicUrl,
          videoLocalPath: videoLocalPath,
          description: `${params.caption}\n\n${(params.hashtags || []).join(' ')}`,
        });
      } else if (params.platform === 'youtube') {
        result = await YouTubeService.uploadShort({
          accessTokenEncrypted: account.accessTokenEncrypted || '',
          videoLocalPath: videoLocalPath,
          videoPublicUrl: stablePublicUrl,
          title: clip?.title || params.caption.slice(0, 70),
          description: params.caption,
          tags: params.hashtags || [],
          privacy: params.privacy || 'public',
          scheduledTime: params.scheduledTime,
        });
      } else {
        throw new Error(`Unsupported publishing platform: ${params.platform}`);
      }

      const externalId = result.uploadId || result.mediaId || result.videoId;
      const externalUrl = result.videoUrl || result.permalink;
      const jobStatus = result.status === 'SCHEDULED' ? 'SCHEDULED' : 'COMPLETED';

      // Update publishing job state
      if (params.jobId) {
        await PublishingRepository.update(params.jobId, {
          status: jobStatus,
          externalPostId: externalId,
          externalPostUrl: externalUrl,
          publishedAt: new Date().toISOString(),
        });
      }

      // Update clip state
      if (clip) {
        await ClipRepository.update(clip.id, {
          status: jobStatus === 'SCHEDULED' ? 'scheduled' : 'published',
          publishedAt: new Date().toISOString(),
        });
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
        await this.markJobFailed(params.jobId, errorMsg);
      }
      return {
        success: false,
        platform: params.platform,
        error: errorMsg,
        status: 'FAILED',
      };
    }
  }

  private static async markJobFailed(jobId: string, error: string) {
    await PublishingRepository.update(jobId, {
      status: 'FAILED',
      errorMessage: error,
    }).catch(() => {});
  }
}
