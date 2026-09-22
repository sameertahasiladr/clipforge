/**
 * Instagram Service — ClipForge AI
 * Official Meta Graph API Integration for Instagram Professional / Creator Accounts
 * Handles OAuth 2.0 flow, token refresh, and Instagram Reels publication pipeline.
 */

import { CryptoService } from './cryptoService.js';

export interface InstagramAccountProfile {
  id: string;
  username: string;
  name: string;
  profilePictureUrl?: string;
  followersCount?: number;
}

export class InstagramService {
  /**
   * Check if Instagram OAuth credentials are configured
   */
  public static isConfigured(): boolean {
    const clientId = process.env.INSTAGRAM_CLIENT_ID;
    const clientSecret = process.env.INSTAGRAM_CLIENT_SECRET;
    return Boolean(clientId && clientSecret && clientId !== 'your_instagram_client_id' && !clientId.includes('your_'));
  }

  /**
   * Generate official Meta OAuth authorization URL for Instagram Graph API
   */
  public static getAuthorizationUrl(redirectUri: string, state: string): string {
    if (!this.isConfigured()) {
      throw new Error(
        'Instagram OAuth is not configured. Please set INSTAGRAM_CLIENT_ID and INSTAGRAM_CLIENT_SECRET in environment settings.'
      );
    }

    const clientId = process.env.INSTAGRAM_CLIENT_ID!;
    const scopes = ['instagram_basic', 'instagram_content_publish', 'pages_show_list'].join(',');

    return `https://www.facebook.com/v19.0/dialog/oauth?client_id=${clientId}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&scope=${encodeURIComponent(scopes)}&response_type=code&state=${state}`;
  }

  /**
   * Exchange authorization code for access token and fetch connected Instagram Business account
   */
  public static async handleCallback(
    code: string,
    redirectUri: string
  ): Promise<{
    account: InstagramAccountProfile;
    accessTokenEncrypted: string;
    refreshTokenEncrypted?: string;
    expiresAt: Date;
  }> {
    if (!this.isConfigured()) {
      throw new Error('Instagram OAuth is not configured in server environment.');
    }

    const clientId = process.env.INSTAGRAM_CLIENT_ID!;
    const clientSecret = process.env.INSTAGRAM_CLIENT_SECRET!;

    // 1. Exchange code for user access token
    const tokenUrl = `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${clientId}&client_secret=${clientSecret}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&code=${code}`;

    const tokenRes = await fetch(tokenUrl);
    if (!tokenRes.ok) {
      const err = await tokenRes.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Failed to exchange Instagram OAuth token.');
    }

    const tokenData = await tokenRes.json();
    const shortLivedToken = tokenData.access_token;

    // 2. Exchange for long-lived access token (valid ~60 days)
    const longLivedUrl = `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${clientId}&client_secret=${clientSecret}&fb_exchange_token=${shortLivedToken}`;
    const longRes = await fetch(longLivedUrl);
    const longData = longRes.ok ? await longRes.json() : tokenData;
    const accessToken = longData.access_token || shortLivedToken;
    const expiresIn = longData.expires_in || 5184000; // 60 days

    // 3. Find connected Instagram Professional / Business Accounts via connected Pages
    const pagesUrl = `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,instagram_business_account{id,username,name,profile_picture_url}&access_token=${accessToken}`;
    const pagesRes = await fetch(pagesUrl);
    const pagesData = await pagesRes.json();

    let igAccount = null;
    if (pagesData.data && pagesData.data.length > 0) {
      for (const page of pagesData.data) {
        if (page.instagram_business_account) {
          igAccount = page.instagram_business_account;
          break;
        }
      }
    }

    if (!igAccount) {
      throw new Error(
        'No Instagram Creator or Business Account found linked to your Facebook Page. Please ensure your Instagram account is linked to a Facebook Page to enable Reels publishing.'
      );
    }

    return {
      account: {
        id: igAccount.id,
        username: igAccount.username,
        name: igAccount.name || igAccount.username,
        profilePictureUrl: igAccount.profile_picture_url,
      },
      accessTokenEncrypted: CryptoService.encrypt(accessToken),
      expiresAt: new Date(Date.now() + expiresIn * 1000),
    };
  }

  /**
   * Publishes Reel to Instagram via Container Creation -> Status Polling -> Publish flow.
   * Never marks a Reel published until Step 3 succeeds.
   */
  public static async publishReel(params: {
    accessTokenEncrypted: string;
    instagramAccountId: string;
    videoPublicUrl: string;
    caption: string;
    hashtags: string[];
    isDemo?: boolean;
  }): Promise<{ mediaId: string; permalink: string; status: string }> {
    if (params.isDemo) {
      const demoId = `ig_demo_${Math.random().toString(36).substring(2, 9)}`;
      return {
        mediaId: demoId,
        permalink: `https://instagram.com/p/${demoId}`,
        status: 'PUBLISHED',
      };
    }

    const accessToken = CryptoService.decrypt(params.accessTokenEncrypted);
    if (!accessToken) {
      throw new Error('Reauthorization required: Invalid or expired Instagram credentials.');
    }

    // Validate videoPublicUrl is an absolute reachable HTTP(S) URL
    if (!params.videoPublicUrl.startsWith('http://') && !params.videoPublicUrl.startsWith('https://')) {
      throw new Error(`Instagram Reels requires a publicly accessible HTTP/HTTPS video URL. Received: ${params.videoPublicUrl}`);
    }

    const fullCaption = `${params.caption}\n\n${params.hashtags.map((h) => `#${h.replace('#', '')}`).join(' ')}`.trim();

    // Step 1: Create Container
    const containerRes = await fetch(
      `https://graph.facebook.com/v19.0/${params.instagramAccountId}/media`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          media_type: 'REELS',
          video_url: params.videoPublicUrl,
          caption: fullCaption,
          share_to_feed: true,
          access_token: accessToken,
        }),
      }
    );

    if (!containerRes.ok) {
      const err = await containerRes.json().catch(() => ({}));
      throw new Error(err.error?.message || `Failed to create Instagram Reels container (${containerRes.status}).`);
    }

    const containerData = await containerRes.json();
    const creationId = containerData.id;
    if (!creationId) {
      throw new Error('Instagram did not return a valid container creation ID.');
    }

    // Step 2: Poll container status until ready (max 15 attempts, 3s delay)
    let isReady = false;
    for (let attempt = 0; attempt < 15; attempt++) {
      await new Promise((r) => setTimeout(r, 3000));
      const statusRes = await fetch(
        `https://graph.facebook.com/v19.0/${creationId}?fields=status_code,status&access_token=${accessToken}`
      );
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        if (statusData.status_code === 'FINISHED') {
          isReady = true;
          break;
        } else if (statusData.status_code === 'ERROR') {
          throw new Error(
            `Instagram video processing failed: ${statusData.status || 'Ensure video meets 9:16 aspect ratio specifications.'}`
          );
        }
      }
    }

    if (!isReady) {
      throw new Error('Instagram Reel container processing timed out. Video could not be finalized.');
    }

    // Step 3: Publish container
    const publishRes = await fetch(
      `https://graph.facebook.com/v19.0/${params.instagramAccountId}/media_publish`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creation_id: creationId,
          access_token: accessToken,
        }),
      }
    );

    if (!publishRes.ok) {
      const err = await publishRes.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Failed to publish Instagram Reel.');
    }

    const pubData = await publishRes.json();
    const mediaId = pubData.id;

    // Fetch official permalink
    let permalink = `https://instagram.com/p/${mediaId}`;
    try {
      const permalinkRes = await fetch(
        `https://graph.facebook.com/v19.0/${mediaId}?fields=permalink&access_token=${accessToken}`
      );
      if (permalinkRes.ok) {
        const permalinkData = await permalinkRes.json();
        if (permalinkData.permalink) {
          permalink = permalinkData.permalink;
        }
      }
    } catch {
      // ignore permalink fallback
    }

    return {
      mediaId,
      permalink,
      status: 'PUBLISHED',
    };
  }
}
