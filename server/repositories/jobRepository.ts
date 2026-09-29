import { Database } from '../db/database.ts';
import { ProcessingJob, JobPipelineStep } from '../services/jobService.ts';

export class JobRepository {
  public static mapRow(row: any): ProcessingJob {
    return {
      jobId: row.job_id,
      projectId: row.project_id || undefined,
      userId: row.user_id || undefined,
      state: row.state as JobPipelineStep,
      statusMessage: row.status_message || '',
      stepIndex: parseInt(row.step_index, 10) || 0,
      totalSteps: parseInt(row.total_steps, 10) || 8,
      progressPercent: parseInt(row.progress_percent, 10) || 0,
      sourceVideoPath: row.source_video_path || undefined,
      renderedClipsCount: parseInt(row.rendered_clips_count, 10) || 0,
      totalClipsToRender: parseInt(row.total_clips_to_render, 10) || 0,
      error: row.error || undefined,
      errorCode: row.error_code || undefined,
      failedClipId: row.failed_clip_id || undefined,
      createdAt: Number(row.created_at) || Date.now(),
      updatedAt: Number(row.updated_at) || Date.now(),
    };
  }

  public static async create(job: ProcessingJob, projectId?: string, userId?: string): Promise<ProcessingJob> {
    const effectiveUserId = (userId || job.userId || '').trim();
    if (!effectiveUserId) {
      throw new Error('userId is mandatory to create a processing job.');
    }
    const effectiveProjectId = projectId || job.projectId || null;
    const sql = `
      INSERT INTO processing_jobs (
        job_id, project_id, user_id, state, status_message, step_index,
        total_steps, progress_percent, source_video_path,
        rendered_clips_count, total_clips_to_render, error,
        error_code, failed_clip_id, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
      )
      ON CONFLICT (job_id) DO UPDATE SET
        project_id = COALESCE(EXCLUDED.project_id, processing_jobs.project_id),
        user_id = EXCLUDED.user_id,
        state = EXCLUDED.state,
        status_message = EXCLUDED.status_message,
        step_index = EXCLUDED.step_index,
        total_steps = EXCLUDED.total_steps,
        progress_percent = EXCLUDED.progress_percent,
        source_video_path = COALESCE(EXCLUDED.source_video_path, processing_jobs.source_video_path),
        rendered_clips_count = EXCLUDED.rendered_clips_count,
        total_clips_to_render = EXCLUDED.total_clips_to_render,
        error = EXCLUDED.error,
        error_code = EXCLUDED.error_code,
        failed_clip_id = EXCLUDED.failed_clip_id,
        updated_at = EXCLUDED.updated_at
      RETURNING *;
    `;
    const params = [
      job.jobId,
      effectiveProjectId,
      effectiveUserId,
      job.state,
      job.statusMessage,
      job.stepIndex,
      job.totalSteps,
      job.progressPercent,
      job.sourceVideoPath || null,
      job.renderedClipsCount,
      job.totalClipsToRender,
      job.error || null,
      job.errorCode || null,
      job.failedClipId || null,
      job.createdAt,
      job.updatedAt,
    ];
    const res = await Database.query(sql, params);
    return this.mapRow(res.rows[0]);
  }

  public static async findById(jobId: string, userId: string): Promise<ProcessingJob | null> {
    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      throw new Error('userId is mandatory to find processing job.');
    }
    const sql = 'SELECT * FROM processing_jobs WHERE job_id = $1 AND user_id = $2 LIMIT 1;';
    const params = [jobId, userId.trim()];
    const res = await Database.query(sql, params);
    if (res.rows.length === 0) return null;
    return this.mapRow(res.rows[0]);
  }

  public static async update(
    jobId: string,
    updates: Partial<ProcessingJob> & { projectId?: string },
    userId: string
  ): Promise<ProcessingJob | null> {
    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      throw new Error('userId is mandatory to update processing job.');
    }
    const cleanUserId = userId.trim();
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (updates.state !== undefined) {
      fields.push(`state = $${idx++}`);
      values.push(updates.state);
    }
    if (updates.statusMessage !== undefined) {
      fields.push(`status_message = $${idx++}`);
      values.push(updates.statusMessage);
    }
    if (updates.stepIndex !== undefined) {
      fields.push(`step_index = $${idx++}`);
      values.push(updates.stepIndex);
    }
    if (updates.progressPercent !== undefined) {
      fields.push(`progress_percent = $${idx++}`);
      values.push(updates.progressPercent);
    }
    if (updates.sourceVideoPath !== undefined) {
      fields.push(`source_video_path = $${idx++}`);
      values.push(updates.sourceVideoPath);
    }
    if (updates.renderedClipsCount !== undefined) {
      fields.push(`rendered_clips_count = $${idx++}`);
      values.push(updates.renderedClipsCount);
    }
    if (updates.totalClipsToRender !== undefined) {
      fields.push(`total_clips_to_render = $${idx++}`);
      values.push(updates.totalClipsToRender);
    }
    if (updates.error !== undefined) {
      fields.push(`error = $${idx++}`);
      values.push(updates.error);
    }
    if (updates.errorCode !== undefined) {
      fields.push(`error_code = $${idx++}`);
      values.push(updates.errorCode);
    }
    if (updates.failedClipId !== undefined) {
      fields.push(`failed_clip_id = $${idx++}`);
      values.push(updates.failedClipId);
    }
    if (updates.projectId !== undefined) {
      fields.push(`project_id = $${idx++}`);
      values.push(updates.projectId);
    }

    fields.push(`updated_at = $${idx++}`);
    values.push(Date.now());

    values.push(jobId);
    const jobIdx = idx++;
    values.push(cleanUserId);
    const userIdx = idx++;

    const sql = `UPDATE processing_jobs SET ${fields.join(', ')} WHERE job_id = $${jobIdx} AND user_id = $${userIdx} RETURNING *;`;
    const res = await Database.query(sql, values);
    if (res.rows.length === 0) return null;
    return this.mapRow(res.rows[0]);
  }

  public static async list(userId: string): Promise<ProcessingJob[]> {
    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      throw new Error('userId is mandatory to list processing jobs.');
    }
    const res = await Database.query(
      'SELECT * FROM processing_jobs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50;',
      [userId.trim()]
    );
    return res.rows.map(this.mapRow);
  }
}
