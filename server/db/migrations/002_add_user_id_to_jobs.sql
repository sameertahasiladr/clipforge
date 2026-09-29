-- Migration 002: Add user_id to processing_jobs for Phase 6 multi-user security
ALTER TABLE processing_jobs ADD COLUMN IF NOT EXISTS user_id VARCHAR(100) REFERENCES users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_processing_jobs_user_id ON processing_jobs(user_id);
