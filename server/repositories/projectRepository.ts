import { Database } from '../db/database.ts';
import type { ProjectItem } from '../db/store.ts';

export class ProjectRepository {
  public static mapRow(row: any): ProjectItem {
    return {
      id: row.id,
      title: row.title,
      sourceUrl: row.source_url,
      sourceVideoPath: row.source_video_path || undefined,
      sourceVideoKey: row.source_video_key || undefined,
      storageProvider: (row.storage_provider as any) || 'local',
      storageStatus: (row.storage_status as any) || 'ready',
      sourceType: row.source_type || 'youtube',
      status: row.status,
      durationSeconds: parseFloat(row.duration_seconds) || 0,
      clipsCount: parseInt(row.clips_count, 10) || 0,
      publishedCount: parseInt(row.published_count, 10) || 0,
      draftCount: parseInt(row.draft_count, 10) || 0,
      thumbnailUrl: row.thumbnail_url || '',
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    };
  }

  public static async create(project: ProjectItem, userId = 'usr-default'): Promise<ProjectItem> {
    const sql = `
      INSERT INTO projects (
        id, user_id, title, source_url, source_video_path, source_video_key,
        storage_provider, storage_status, source_platform, source_type, status,
        duration_seconds, clips_count, published_count, draft_count, thumbnail_url,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        source_url = EXCLUDED.source_url,
        source_video_path = EXCLUDED.source_video_path,
        source_video_key = EXCLUDED.source_video_key,
        storage_provider = EXCLUDED.storage_provider,
        storage_status = EXCLUDED.storage_status,
        source_type = EXCLUDED.source_type,
        status = EXCLUDED.status,
        duration_seconds = EXCLUDED.duration_seconds,
        clips_count = EXCLUDED.clips_count,
        published_count = EXCLUDED.published_count,
        draft_count = EXCLUDED.draft_count,
        thumbnail_url = EXCLUDED.thumbnail_url,
        updated_at = NOW()
      RETURNING *;
    `;
    const params = [
      project.id,
      userId,
      project.title,
      project.sourceUrl,
      project.sourceVideoPath || null,
      project.sourceVideoKey || null,
      project.storageProvider || 'local',
      project.storageStatus || 'ready',
      'youtube',
      project.sourceType || 'youtube',
      project.status || 'queued',
      project.durationSeconds || 0,
      project.clipsCount || 0,
      project.publishedCount || 0,
      project.draftCount || 0,
      project.thumbnailUrl || null,
    ];
    const res = await Database.query(sql, params);
    return this.mapRow(res.rows[0]);
  }

  public static async findById(id: string): Promise<ProjectItem | null> {
    const res = await Database.query('SELECT * FROM projects WHERE id = $1 LIMIT 1;', [id]);
    if (res.rows.length === 0) return null;
    return this.mapRow(res.rows[0]);
  }

  public static async list(): Promise<ProjectItem[]> {
    const res = await Database.query('SELECT * FROM projects ORDER BY created_at DESC;');
    return res.rows.map(this.mapRow);
  }

  public static async update(id: string, updates: Partial<ProjectItem>): Promise<ProjectItem | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (updates.title !== undefined) {
      fields.push(`title = $${idx++}`);
      values.push(updates.title);
    }
    if (updates.sourceUrl !== undefined) {
      fields.push(`source_url = $${idx++}`);
      values.push(updates.sourceUrl);
    }
    if (updates.sourceVideoPath !== undefined) {
      fields.push(`source_video_path = $${idx++}`);
      values.push(updates.sourceVideoPath);
    }
    if (updates.sourceVideoKey !== undefined) {
      fields.push(`source_video_key = $${idx++}`);
      values.push(updates.sourceVideoKey);
    }
    if (updates.storageProvider !== undefined) {
      fields.push(`storage_provider = $${idx++}`);
      values.push(updates.storageProvider);
    }
    if (updates.storageStatus !== undefined) {
      fields.push(`storage_status = $${idx++}`);
      values.push(updates.storageStatus);
    }
    if (updates.sourceType !== undefined) {
      fields.push(`source_type = $${idx++}`);
      values.push(updates.sourceType);
    }
    if (updates.status !== undefined) {
      fields.push(`status = $${idx++}`);
      values.push(updates.status);
    }
    if (updates.durationSeconds !== undefined) {
      fields.push(`duration_seconds = $${idx++}`);
      values.push(updates.durationSeconds);
    }
    if (updates.clipsCount !== undefined) {
      fields.push(`clips_count = $${idx++}`);
      values.push(updates.clipsCount);
    }
    if (updates.publishedCount !== undefined) {
      fields.push(`published_count = $${idx++}`);
      values.push(updates.publishedCount);
    }
    if (updates.draftCount !== undefined) {
      fields.push(`draft_count = $${idx++}`);
      values.push(updates.draftCount);
    }
    if (updates.thumbnailUrl !== undefined) {
      fields.push(`thumbnail_url = $${idx++}`);
      values.push(updates.thumbnailUrl);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);
    const sql = `UPDATE projects SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *;`;
    const res = await Database.query(sql, values);
    if (res.rows.length === 0) return null;
    return this.mapRow(res.rows[0]);
  }

  public static async delete(id: string): Promise<boolean> {
    return Database.withTransaction(async (client) => {
      await client.query('DELETE FROM clips WHERE project_id = $1;', [id]);
      await client.query('DELETE FROM source_videos WHERE project_id = $1;', [id]);
      const res = await client.query('DELETE FROM projects WHERE id = $1;', [id]);
      return (res.rowCount ?? 0) > 0;
    });
  }
}
