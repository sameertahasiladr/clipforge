/**
 * Facebook Service — ClipForge AI
 * Meta Graph API for Facebook Pages & Reels Publishing
 * OAuth 2.0 with pages_show_list, pages_manage_posts, and real binary Reels upload protocol.
 */

import path from 'node:path';
import fs from 'node:fs';
import { CryptoService } from './cryptoService.js';

export interface FacebookPageProfile {
  id: string;
  name: string;
  category?: string;
  pictureUrl?: string;
}

export class FacebookService {
  /**
   * Check if Facebook OAuth credentials are configured
   */
  public static isConfigured(): boolean {
    const appId = process.env.FACEBOOK_APP_ID || process.env.META_APP_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET || process.env.META_APP_SECRET;
    return Boolean(appId && appSecret && appId !== 'your_facebook_app_id' && !appId.includes('your_'));
  }

  /**
   * Generates Meta OAuth URL for Facebook Pages
   */
  public static getAuthorizationUrl(redirectUri: string, state: string): string {
    if (!this.isConfigured()) {
      throw new Error(
        'Facebook OAuth is not configured. Please set FACEBOOK_APP_ID and FACEBOOK_APP_SECRET in environment settings.'
      );
    }

    const appId = (process.env.FACEBOOK_APP_ID || process.env.META_APP_ID)!;
    const scopes = ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts'].join(',');

    return `https://www.facebook.com/v19.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&scope=${encodeURIComponent(scopes)}&response_type=code&state=${state}`;
  }

  /**
   * Exchange code for token and retrieve Facebook Pages
   */
  public static async handleCallback(
    code: string,
    redirectUri: string
  ): Promise<{
    pages: FacebookPageProfile[];
    primaryPage: FacebookPageProfile;
    accessTokenEncrypted: string;
    expiresAt: Date;
  }> {
    if (!this.isConfigured()) {
      throw new Error('Facebook OAuth is not configured in server environment.');
    }

    const appId = (process.env.FACEBOOK_APP_ID || process.env.META_APP_ID)!;
    const appSecret = (process.env.FACEBOOK_APP_SECRET || process.env.META_APP_SECRET)!;

    // 1. Exchange code
    const tokenUrl = `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&code=${code}`;

    const tokenRes = await fetch(tokenUrl);
    if (!tokenRes.ok) {
      const err = await tokenRes.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Failed to exchange Facebook OAuth token.');
    }

    const tokenData = await tokenRes.json();
    const userToken = tokenData.access_token;

    // 2. Fetch user's managed Facebook Pages
    const pagesUrl = `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,category,picture{url},access_token&access_token=${userToken}`;
    const pagesRes = await fetch(pagesUrl);
    const pagesData = await pagesRes.json();

    if (!pagesData.data || pagesData.data.length === 0) {
      throw new Error(
        'No Facebook Pages found. You must be an administrator or editor of at least one Facebook Page to publish Facebook Reels.'
      );
    }

    const primary = pagesData.data[0];
    const pageAccessToken = primary.access_token || userToken;

    const pages: FacebookPageProfile[] = pagesData.data.map((p: any) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      pictureUrl: p.picture?.data?.url,
    }));

    return {
      pages,
      primaryPage: {
        id: primary.id,
        name: primary.name,
        category: primary.category,
        pictureUrl: primary.picture?.data?.url,
      },
      accessTokenEncrypted: CryptoService.encrypt(pageAccessToken),
      expiresAt: new Date(Date.now() + 60 * 86400 * 1000), // ~60 days
    };
  }

  /**
   * Publishes Reel to a Facebook Page via real Meta Reels Publishing flow:
   * Start Upload Session -> Binary Media Upload -> Finish & Publish -> Status Check.
   */
  public static async publishPageReel(params: {
    accessTokenEncrypted: string;
    pageId: string;
    videoLocalPath?: string;
    videoUrl: string;
    description: string;
    scheduledPublishTime?: number;
  }): Promise<{ videoId: string; permalink: string; status: string }> {
    const pageToken = CryptoService.decrypt(params.accessTokenEncrypted);
    if (!pageToken) {
      throw new Error('Reauthorization required: Invalid or expired Facebook credentials.');
    }

    // Step 1: Start video reel upload phase
    const startUrl = `https://graph.facebook.com/v19.0/${params.pageId}/video_reels`;
    const startRes = await fetch(startUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        upload_phase: 'start',
        access_token: pageToken,
      }),
    });

    if (!startRes.ok) {
      const err = await startRes.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Failed to initialize Facebook Reel upload.');
    }

    const startData = await startRes.json();
    const videoId = startData.video_id;
    const uploadUrl = startData.upload_url;

    if (!videoId || !uploadUrl) {
      throw new Error('Facebook did not return valid video ID or upload URL for Reel.');
    }

    // Step 2: Upload MP4 binary data to the provided upload_url
    let localFilePath = params.videoLocalPath;
    if (!localFilePath || !fs.existsSync(localFilePath)) {
      const filename = path.basename(params.videoUrl);
      const candidate = path.join(process.cwd(), 'public', 'rendered', filename);
      if (fs.existsSync(candidate)) {
        localFilePath = candidate;
      }
    }

    if (!localFilePath || !fs.existsSync(localFilePath)) {
      throw new Error(`Video file for Facebook Reels not found on server: ${params.videoUrl}`);
    }

    const fileStats = fs.statSync(localFilePath);
    const fileBuffer = fs.readFileSync(localFilePath);

    const binaryUploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `OAuth ${pageToken}`,
        offset: '0',
        file_size: fileStats.size.toString(),
        'Content-Type': 'application/octet-stream',
      },
      body: fileBuffer,
    });

    if (!binaryUploadRes.ok) {
      const err = await binaryUploadRes.json().catch(() => ({}));
      throw new Error(err.error?.message || `Failed to transfer video binary to Facebook (${binaryUploadRes.status}).`);
    }

    // Step 3: Finish and publish
    const finishUrl = `https://graph.facebook.com/v19.0/${params.pageId}/video_reels`;
    const finishRes = await fetch(finishUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        upload_phase: 'finish',
        access_token: pageToken,
        video_id: videoId,
        video_state: params.scheduledPublishTime ? 'SCHEDULED' : 'PUBLISHED',
        description: params.description,
        scheduled_publish_time: params.scheduledPublishTime,
      }),
    });

    if (!finishRes.ok) {
      const err = await finishRes.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Failed to finalize Facebook Reel publication.');
    }

    // Step 4: Fetch permalink
    let permalink = `https://facebook.com/watch/?v=${videoId}`;
    try {
      const infoRes = await fetch(
        `https://graph.facebook.com/v19.0/${videoId}?fields=permalink_url,status&access_token=${pageToken}`
      );
      if (infoRes.ok) {
        const infoData = await infoRes.json();
        if (infoData.permalink_url) {
          permalink = infoData.permalink_url;
        }
      }
    } catch {
      // fallback
    }

    return {
      videoId,
      permalink,
      status: params.scheduledPublishTime ? 'SCHEDULED' : 'PUBLISHED',
    };
  }
}
