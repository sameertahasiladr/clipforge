import { Database } from '../db/database.ts';
import type { ClipItem } from '../db/store.ts';

export class ClipRepository {
  public static mapRow(row: any): ClipItem {
    return {
      id: row.id,
      projectId: row.project_id,
      userId: row.user_id,
      clipNumber: parseInt(row.clip_number, 10) || 1,
      title: row.title,
      hook: row.hook || '',
      description: row.description || '',
      suggestedCaption: row.suggested_caption || '',
      hashtags: Array.isArray(row.hashtags) ? row.hashtags : [],
      callToAction: row.call_to_action || '',
      aiViralScore: parseInt(row.ai_viral_score, 10) || 85,
      startTimeSeconds: parseFloat(row.start_time_seconds) || 0,
      endTimeSeconds: parseFloat(row.end_time_seconds) || 0,
      durationSeconds: parseFloat(row.duration_seconds) || 0,
      aspectRatio: (row.aspect_ratio || '9:16') as any,
      thumbnailUrl: row.thumbnail_url || '',
      videoUrl: row.video_url || '',
      localRenderPath: row.local_render_path || undefined,
      videoStorageKey: row.video_storage_key || undefined,
      thumbnailStorageKey: row.thumbnail_storage_key || undefined,
      storageProvider: (row.storage_provider as any) || 'local',
      storageStatus: (row.storage_status as any) || 'ready',
      status: row.status || 'draft',
      renderStatus: row.render_status || 'completed',
      publishedAt: row.published_at ? new Date(row.published_at).toISOString() : undefined,
      captionStyle: row.caption_style || 'none',
      fontFamily: row.font_family || 'Plus Jakarta Sans',
      captionPosition: row.caption_position || 'bottom',
      watermarkEnabled: Boolean(row.watermark_enabled),
      watermarkText: row.watermark_text || '@clipforge.ai',
      speakerCenterXPercent: parseFloat(row.speaker_center_x_percent) || 50,
      fullText: row.full_text || '',
    };
  }

  public static async create(clip: ClipItem, userId = 'usr-default'): Promise<ClipItem> {
    const sql = `
      INSERT INTO clips (
        id, project_id, user_id, clip_number, title, hook, description,
        suggested_caption, hashtags, call_to_action, ai_viral_score,
        start_time_seconds, end_time_seconds, duration_seconds, aspect_ratio,
        thumbnail_url, video_url, local_render_path, video_storage_key,
        thumbnail_storage_key, storage_provider, storage_status, status, render_status,
        published_at, caption_style, font_family, caption_position,
        watermark_enabled, watermark_text, speaker_center_x_percent, full_text,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
        $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28,
        $29, $30, $31, $32,
        NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        hook = EXCLUDED.hook,
        description = EXCLUDED.description,
        suggested_caption = EXCLUDED.suggested_caption,
        hashtags = EXCLUDED.hashtags,
        call_to_action = EXCLUDED.call_to_action,
        ai_viral_score = EXCLUDED.ai_viral_score,
        thumbnail_url = EXCLUDED.thumbnail_url,
        video_url = EXCLUDED.video_url,
        local_render_path = EXCLUDED.local_render_path,
        video_storage_key = EXCLUDED.video_storage_key,
        thumbnail_storage_key = EXCLUDED.thumbnail_storage_key,
        storage_provider = EXCLUDED.storage_provider,
        storage_status = EXCLUDED.storage_status,
        status = EXCLUDED.status,
        render_status = EXCLUDED.render_status,
        caption_style = EXCLUDED.caption_style,
        font_family = EXCLUDED.font_family,
        caption_position = EXCLUDED.caption_position,
        watermark_enabled = EXCLUDED.watermark_enabled,
        watermark_text = EXCLUDED.watermark_text,
        speaker_center_x_percent = EXCLUDED.speaker_center_x_percent,
        full_text = EXCLUDED.full_text,
        updated_at = NOW()
      RETURNING *;
    `;
    const params = [
      clip.id,
      clip.projectId,
      userId,
      clip.clipNumber || 1,
      clip.title,
      clip.hook || '',
      clip.description || '',
      clip.suggestedCaption || '',
      clip.hashtags || [],
      clip.callToAction || '',
      Math.min(100, Math.max(0, clip.aiViralScore || 85)),
      clip.startTimeSeconds,
      clip.endTimeSeconds,
      clip.durationSeconds,
      clip.aspectRatio || '9:16',
      clip.thumbnailUrl || '',
      clip.videoUrl || '',
      clip.localRenderPath || null,
      clip.videoStorageKey || null,
      clip.thumbnailStorageKey || null,
      clip.storageProvider || 'local',
      clip.storageStatus || 'ready',
      clip.status || 'draft',
      clip.renderStatus || 'completed',
      clip.publishedAt ? new Date(clip.publishedAt) : null,
      clip.captionStyle || 'none',
      clip.fontFamily || 'Plus Jakarta Sans',
      clip.captionPosition || 'bottom',
      Boolean(clip.watermarkEnabled),
      clip.watermarkText || '@clipforge.ai',
      clip.speakerCenterXPercent || 50,
      clip.fullText || '',
    ];
    const res = await Database.query(sql, params);
    return this.mapRow(res.rows[0]);
  }

  public static async batchCreate(clips: ClipItem[], userId = 'usr-default'): Promise<ClipItem[]> {
    if (clips.length === 0) return [];
    return Database.withTransaction(async () => {
      const results: ClipItem[] = [];
      for (const clip of clips) {
        const item = await this.create(clip, userId);
        results.push(item);
      }
      return results;
    });
  }

  public static async findById(id: string, userId?: string): Promise<ClipItem | null> {
    const sql = userId
      ? 'SELECT * FROM clips WHERE id = $1 AND user_id = $2 LIMIT 1;'
      : 'SELECT * FROM clips WHERE id = $1 LIMIT 1;';
    const params = userId ? [id, userId] : [id];
    const res = await Database.query(sql, params);
    if (res.rows.length === 0) return null;
    return this.mapRow(res.rows[0]);
  }

  public static async findByProjectId(projectId: string, userId?: string): Promise<ClipItem[]> {
    const sql = userId
      ? 'SELECT * FROM clips WHERE project_id = $1 AND user_id = $2 ORDER BY clip_number ASC;'
      : 'SELECT * FROM clips WHERE project_id = $1 ORDER BY clip_number ASC;';
    const params = userId ? [projectId, userId] : [projectId];
    const res = await Database.query(sql, params);
    return res.rows.map(this.mapRow);
  }

  public static async list(userId?: string): Promise<ClipItem[]> {
    const sql = userId
      ? 'SELECT * FROM clips WHERE user_id = $1 ORDER BY created_at DESC;'
      : 'SELECT * FROM clips ORDER BY created_at DESC;';
    const params = userId ? [userId] : [];
    const res = await Database.query(sql, params);
    return res.rows.map(this.mapRow);
  }

  public static async update(
    id: string,
    updates: Partial<ClipItem>,
    userId?: string
  ): Promise<ClipItem | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (updates.title !== undefined) {
      fields.push(`title = $${idx++}`);
      values.push(updates.title);
    }
    if (updates.hook !== undefined) {
      fields.push(`hook = $${idx++}`);
      values.push(updates.hook);
    }
    if (updates.description !== undefined) {
      fields.push(`description = $${idx++}`);
      values.push(updates.description);
    }
    if (updates.suggestedCaption !== undefined) {
      fields.push(`suggested_caption = $${idx++}`);
      values.push(updates.suggestedCaption);
    }
    if (updates.hashtags !== undefined) {
      fields.push(`hashtags = $${idx++}`);
      values.push(updates.hashtags);
    }
    if (updates.callToAction !== undefined) {
      fields.push(`call_to_action = $${idx++}`);
      values.push(updates.callToAction);
    }
    if (updates.status !== undefined) {
      fields.push(`status = $${idx++}`);
      values.push(updates.status);
    }
    if (updates.renderStatus !== undefined) {
      fields.push(`render_status = $${idx++}`);
      values.push(updates.renderStatus);
    }
    if (updates.publishedAt !== undefined) {
      fields.push(`published_at = $${idx++}`);
      values.push(updates.publishedAt ? new Date(updates.publishedAt) : null);
    }
    if (updates.captionStyle !== undefined) {
      fields.push(`caption_style = $${idx++}`);
      values.push(updates.captionStyle);
    }
    if (updates.fontFamily !== undefined) {
      fields.push(`font_family = $${idx++}`);
      values.push(updates.fontFamily);
    }
    if (updates.captionPosition !== undefined) {
      fields.push(`caption_position = $${idx++}`);
      values.push(updates.captionPosition);
    }
    if (updates.watermarkEnabled !== undefined) {
      fields.push(`watermark_enabled = $${idx++}`);
      values.push(Boolean(updates.watermarkEnabled));
    }
    if (updates.watermarkText !== undefined) {
      fields.push(`watermark_text = $${idx++}`);
      values.push(updates.watermarkText);
    }
    if (updates.videoUrl !== undefined) {
      fields.push(`video_url = $${idx++}`);
      values.push(updates.videoUrl);
    }
    if (updates.thumbnailUrl !== undefined) {
      fields.push(`thumbnail_url = $${idx++}`);
      values.push(updates.thumbnailUrl);
    }
    if (updates.localRenderPath !== undefined) {
      fields.push(`local_render_path = $${idx++}`);
      values.push(updates.localRenderPath);
    }
    if (updates.videoStorageKey !== undefined) {
      fields.push(`video_storage_key = $${idx++}`);
      values.push(updates.videoStorageKey);
    }
    if (updates.thumbnailStorageKey !== undefined) {
      fields.push(`thumbnail_storage_key = $${idx++}`);
      values.push(updates.thumbnailStorageKey);
    }
    if (updates.storageProvider !== undefined) {
      fields.push(`storage_provider = $${idx++}`);
      values.push(updates.storageProvider);
    }
    if (updates.storageStatus !== undefined) {
      fields.push(`storage_status = $${idx++}`);
      values.push(updates.storageStatus);
    }

    if (fields.length === 0) {
      return this.findById(id, userId);
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);
    let sql = `UPDATE clips SET ${fields.join(', ')} WHERE id = $${idx++}`;
    if (userId) {
      values.push(userId);
      sql += ` AND user_id = $${idx++}`;
    }
    sql += ' RETURNING *;';

    const res = await Database.query(sql, values);
    if (res.rows.length === 0) return null;
    return this.mapRow(res.rows[0]);
  }

  public static async delete(id: string, userId?: string): Promise<boolean> {
    const sql = userId
      ? 'DELETE FROM clips WHERE id = $1 AND user_id = $2;'
      : 'DELETE FROM clips WHERE id = $1;';
    const params = userId ? [id, userId] : [id];
    const res = await Database.query(sql, params);
    return (res.rowCount ?? 0) > 0;
  }

  public static async batchDelete(ids: string[], userId?: string): Promise<number> {
    if (ids.length === 0) return 0;
    const sql = userId
      ? 'DELETE FROM clips WHERE id = ANY($1::varchar[]) AND user_id = $2;'
      : 'DELETE FROM clips WHERE id = ANY($1::varchar[]);';
    const params = userId ? [ids, userId] : [ids];
    const res = await Database.query(sql, params);
    return res.rowCount ?? 0;
  }

  public static async deleteByProjectId(projectId: string, userId?: string): Promise<number> {
    const sql = userId
      ? 'DELETE FROM clips WHERE project_id = $1 AND user_id = $2;'
      : 'DELETE FROM clips WHERE project_id = $1;';
    const params = userId ? [projectId, userId] : [projectId];
    const res = await Database.query(sql, params);
    return res.rowCount ?? 0;
  }
}
