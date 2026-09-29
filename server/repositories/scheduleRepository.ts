import { Database } from '../db/database.ts';
import { ScheduledPostItem } from '../db/store.ts';

export class ScheduleRepository {
  public static mapRow(row: any): ScheduledPostItem {
    return {
      id: row.id,
      clipId: row.clip_id,
      clipTitle: row.clip_title || '',
      platforms: Array.isArray(row.platforms) ? row.platforms : [],
      scheduledDate: row.scheduled_date || '',
      scheduledTime: row.scheduled_time || '',
      timezone: row.timezone || 'UTC',
      status: row.status || 'scheduled',
    };
  }

  public static async create(item: ScheduledPostItem, userId: string): Promise<ScheduledPostItem> {
    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      throw new Error('userId is required to create a scheduled post.');
    }
    const sql = `
      INSERT INTO scheduled_posts (
        id, user_id, clip_id, clip_title, platforms,
        scheduled_date, scheduled_time, timezone, status, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        clip_title = EXCLUDED.clip_title,
        platforms = EXCLUDED.platforms,
        scheduled_date = EXCLUDED.scheduled_date,
        scheduled_time = EXCLUDED.scheduled_time,
        timezone = EXCLUDED.timezone,
        status = EXCLUDED.status
      RETURNING *;
    `;
    const params = [
      item.id,
      userId,
      item.clipId || null,
      item.clipTitle || '',
      item.platforms || [],
      item.scheduledDate,
      item.scheduledTime,
      item.timezone || 'UTC',
      item.status || 'scheduled',
    ];
    const res = await Database.query(sql, params);
    return this.mapRow(res.rows[0]);
  }

  public static async list(userId?: string): Promise<ScheduledPostItem[]> {
    const sql = userId
      ? 'SELECT * FROM scheduled_posts WHERE user_id = $1 ORDER BY scheduled_date ASC, scheduled_time ASC;'
      : 'SELECT * FROM scheduled_posts ORDER BY scheduled_date ASC, scheduled_time ASC;';
    const params = userId ? [userId] : [];
    const res = await Database.query(sql, params);
    return res.rows.map(this.mapRow);
  }

  public static async findById(id: string, userId?: string): Promise<ScheduledPostItem | null> {
    const sql = userId
      ? 'SELECT * FROM scheduled_posts WHERE id = $1 AND user_id = $2 LIMIT 1;'
      : 'SELECT * FROM scheduled_posts WHERE id = $1 LIMIT 1;';
    const params = userId ? [id, userId] : [id];
    const res = await Database.query(sql, params);
    if (res.rows.length === 0) return null;
    return this.mapRow(res.rows[0]);
  }

  public static async delete(id: string, userId?: string): Promise<boolean> {
    const sql = userId
      ? 'DELETE FROM scheduled_posts WHERE id = $1 AND user_id = $2;'
      : 'DELETE FROM scheduled_posts WHERE id = $1;';
    const params = userId ? [id, userId] : [id];
    const res = await Database.query(sql, params);
    return (res.rowCount ?? 0) > 0;
  }
}
