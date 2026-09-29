import { Database } from '../db/database.ts';
import { PublishingJob } from '../db/store.ts';

export class PublishingRepository {
  public static mapRow(row: any): PublishingJob {
    return {
      id: row.id,
      userId: row.user_id,
      clipId: row.clip_id,
      clipTitle: row.clip_title || '',
      platform: row.platform as any,
      accountId: row.account_id || '',
      status: row.status as any,
      scheduledAt: row.scheduled_at ? new Date(row.scheduled_at).toISOString() : undefined,
      startedAt: row.started_at ? new Date(row.started_at).toISOString() : undefined,
      completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : undefined,
      publishedAt: row.published_at ? new Date(row.published_at).toISOString() : undefined,
      externalPostId: row.external_post_id || undefined,
      externalPostUrl: row.external_post_url || undefined,
      errorMessage: row.error_message || undefined,
      retryCount: parseInt(row.retry_count, 10) || 0,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
    };
  }

  public static async create(job: PublishingJob): Promise<PublishingJob> {
    const sql = `
      INSERT INTO publishing_jobs (
        id, user_id, clip_id, clip_title, platform, account_id,
        status, scheduled_at, started_at, completed_at, published_at,
        external_post_id, external_post_url, error_message, retry_count,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
        NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        scheduled_at = EXCLUDED.scheduled_at,
        started_at = EXCLUDED.started_at,
        completed_at = EXCLUDED.completed_at,
        published_at = EXCLUDED.published_at,
        external_post_id = EXCLUDED.external_post_id,
        external_post_url = EXCLUDED.external_post_url,
        error_message = EXCLUDED.error_message,
        retry_count = EXCLUDED.retry_count,
        updated_at = NOW()
      RETURNING *;
    `;
    const params = [
      job.id,
      job.userId || 'usr-default',
      job.clipId || null,
      job.clipTitle || '',
      job.platform,
      job.accountId || null,
      job.status || 'QUEUED',
      job.scheduledAt ? new Date(job.scheduledAt) : null,
      job.startedAt ? new Date(job.startedAt) : null,
      job.completedAt ? new Date(job.completedAt) : null,
      job.publishedAt ? new Date(job.publishedAt) : null,
      job.externalPostId || null,
      job.externalPostUrl || null,
      job.errorMessage || null,
      job.retryCount || 0,
    ];
    const res = await Database.query(sql, params);
    return this.mapRow(res.rows[0]);
  }

  public static async findById(id: string, userId?: string): Promise<PublishingJob | null> {
    const sql = userId
      ? 'SELECT * FROM publishing_jobs WHERE id = $1 AND user_id = $2 LIMIT 1;'
      : 'SELECT * FROM publishing_jobs WHERE id = $1 LIMIT 1;';
    const params = userId ? [id, userId] : [id];
    const res = await Database.query(sql, params);
    if (res.rows.length === 0) return null;
    return this.mapRow(res.rows[0]);
  }

  public static async list(userId?: string): Promise<PublishingJob[]> {
    const sql = userId
      ? 'SELECT * FROM publishing_jobs WHERE user_id = $1 ORDER BY created_at DESC;'
      : 'SELECT * FROM publishing_jobs ORDER BY created_at DESC;';
    const params = userId ? [userId] : [];
    const res = await Database.query(sql, params);
    return res.rows.map(this.mapRow);
  }

  public static async listReadyToPublish(): Promise<PublishingJob[]> {
    const sql = `
      SELECT * FROM publishing_jobs
      WHERE status = 'QUEUED'
        AND (scheduled_at IS NULL OR scheduled_at <= NOW())
      ORDER BY created_at ASC;
    `;
    const res = await Database.query(sql);
    return res.rows.map(this.mapRow);
  }

  public static async update(
    id: string,
    updates: Partial<PublishingJob>,
    userId?: string
  ): Promise<PublishingJob | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (updates.status !== undefined) {
      fields.push(`status = $${idx++}`);
      values.push(updates.status);
    }
    if (updates.scheduledAt !== undefined) {
      fields.push(`scheduled_at = $${idx++}`);
      values.push(updates.scheduledAt ? new Date(updates.scheduledAt) : null);
    }
    if (updates.startedAt !== undefined) {
      fields.push(`started_at = $${idx++}`);
      values.push(updates.startedAt ? new Date(updates.startedAt) : null);
    }
    if (updates.completedAt !== undefined) {
      fields.push(`completed_at = $${idx++}`);
      values.push(updates.completedAt ? new Date(updates.completedAt) : null);
    }
    if (updates.publishedAt !== undefined) {
      fields.push(`published_at = $${idx++}`);
      values.push(updates.publishedAt ? new Date(updates.publishedAt) : null);
    }
    if (updates.externalPostId !== undefined) {
      fields.push(`external_post_id = $${idx++}`);
      values.push(updates.externalPostId);
    }
    if (updates.externalPostUrl !== undefined) {
      fields.push(`external_post_url = $${idx++}`);
      values.push(updates.externalPostUrl);
    }
    if (updates.errorMessage !== undefined) {
      fields.push(`error_message = $${idx++}`);
      values.push(updates.errorMessage);
    }
    if (updates.retryCount !== undefined) {
      fields.push(`retry_count = $${idx++}`);
      values.push(updates.retryCount);
    }

    if (fields.length === 0) {
      return this.findById(id, userId);
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);
    let sql = `UPDATE publishing_jobs SET ${fields.join(', ')} WHERE id = $${idx++}`;
    if (userId) {
      values.push(userId);
      sql += ` AND user_id = $${idx++}`;
    }
    sql += ' RETURNING *;';

    const res = await Database.query(sql, values);
    if (res.rows.length === 0) return null;
    return this.mapRow(res.rows[0]);
  }
}
