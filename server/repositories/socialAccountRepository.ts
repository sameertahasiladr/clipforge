import { Database } from '../db/database.ts';
import { SocialAccountItem } from '../db/store.ts';

export class SocialAccountRepository {
  public static mapRow(row: any): SocialAccountItem {
    return {
      id: row.id,
      platform: row.platform as any,
      accountUsername: row.account_username || 'Not Connected',
      channelOrPageName: row.channel_or_page_name || '',
      platformAccountId: row.platform_account_id || undefined,
      avatarUrl: row.avatar_url || undefined,
      isConnected: Boolean(row.is_connected),
      connectedAt: row.connected_at ? new Date(row.connected_at).toISOString() : undefined,
      status: (row.status || 'Not Connected') as any,
      accessTokenEncrypted: row.access_token_encrypted || undefined,
      refreshTokenEncrypted: row.refresh_token_encrypted || undefined,
      tokenExpiresAt: row.token_expires_at ? new Date(row.token_expires_at).toISOString() : undefined,
    };
  }

  public static async list(userId = 'usr-default'): Promise<SocialAccountItem[]> {
    const res = await Database.query(
      'SELECT * FROM social_accounts WHERE user_id = $1 ORDER BY id ASC;',
      [userId]
    );
    if (res.rows.length === 0) {
      // Return default rows if not yet present
      return [
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
    }
    return res.rows.map(this.mapRow);
  }

  public static async findByPlatform(platform: string, userId = 'usr-default'): Promise<SocialAccountItem | null> {
    const res = await Database.query(
      'SELECT * FROM social_accounts WHERE platform = $1 AND user_id = $2 LIMIT 1;',
      [platform, userId]
    );
    if (res.rows.length === 0) return null;
    return this.mapRow(res.rows[0]);
  }

  public static async upsert(account: SocialAccountItem, userId = 'usr-default'): Promise<SocialAccountItem> {
    const existing = await this.findByPlatform(account.platform, userId);
    const accountId = existing ? existing.id : (account.id && account.id.includes(userId) ? account.id : `acc_${userId}_${account.platform}`);

    const sql = `
      INSERT INTO social_accounts (
        id, user_id, platform, account_username, channel_or_page_name,
        platform_account_id, avatar_url, is_connected, connected_at,
        status, access_token_encrypted, refresh_token_encrypted,
        token_expires_at, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        account_username = EXCLUDED.account_username,
        channel_or_page_name = EXCLUDED.channel_or_page_name,
        platform_account_id = EXCLUDED.platform_account_id,
        avatar_url = EXCLUDED.avatar_url,
        is_connected = EXCLUDED.is_connected,
        connected_at = EXCLUDED.connected_at,
        status = EXCLUDED.status,
        access_token_encrypted = EXCLUDED.access_token_encrypted,
        refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
        token_expires_at = EXCLUDED.token_expires_at,
        updated_at = NOW()
      RETURNING *;
    `;
    const params = [
      accountId,
      userId,
      account.platform,
      account.accountUsername,
      account.channelOrPageName,
      account.platformAccountId || null,
      account.avatarUrl || null,
      account.isConnected,
      account.connectedAt ? new Date(account.connectedAt) : null,
      account.status,
      account.accessTokenEncrypted || null,
      account.refreshTokenEncrypted || null,
      account.tokenExpiresAt ? new Date(account.tokenExpiresAt) : null,
    ];
    const res = await Database.query(sql, params);
    return this.mapRow(res.rows[0]);
  }

  public static async disconnect(platform: string, userId = 'usr-default'): Promise<boolean> {
    const channelName = `${platform.charAt(0).toUpperCase() + platform.slice(1)} Account`;
    const sql = `
      UPDATE social_accounts SET
        is_connected = FALSE,
        account_username = 'Not Connected',
        channel_or_page_name = $1,
        status = 'Not Connected',
        access_token_encrypted = NULL,
        refresh_token_encrypted = NULL,
        platform_account_id = NULL,
        token_expires_at = NULL,
        updated_at = NOW()
      WHERE platform = $2 AND user_id = $3;
    `;
    const res = await Database.query(sql, [channelName, platform, userId]);
    return (res.rowCount ?? 0) > 0;
  }
}
