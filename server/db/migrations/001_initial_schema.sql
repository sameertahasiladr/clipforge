-- ====================================================================
-- ClipForge AI — Migration 001: Initial Schema (Authoritative PostgreSQL)
-- ====================================================================

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(100) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    full_name VARCHAR(150),
    avatar_url TEXT,
    role VARCHAR(50) DEFAULT 'creator',
    plan_tier VARCHAR(50) DEFAULT 'free',
    google_id VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Insert default user for guest/standalone pipeline jobs
INSERT INTO users (id, email, full_name, role, plan_tier)
VALUES ('usr-default', 'creator@clipforge.ai', 'ClipForge Creator', 'creator', 'free')
ON CONFLICT (id) DO NOTHING;

-- 2. Projects Table
CREATE TABLE IF NOT EXISTS projects (
    id VARCHAR(100) PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    source_url TEXT NOT NULL,
    source_video_path TEXT,
    source_platform VARCHAR(50) DEFAULT 'youtube',
    source_type VARCHAR(50) DEFAULT 'youtube',
    status VARCHAR(50) DEFAULT 'queued',
    duration_seconds NUMERIC(10, 2) DEFAULT 0,
    clips_count INT DEFAULT 0,
    published_count INT DEFAULT 0,
    draft_count INT DEFAULT 0,
    thumbnail_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at DESC);

-- 3. Source Videos Table
CREATE TABLE IF NOT EXISTS source_videos (
    id VARCHAR(100) PRIMARY KEY,
    project_id VARCHAR(100) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    youtube_video_id VARCHAR(50),
    video_title TEXT NOT NULL,
    channel_name VARCHAR(255),
    channel_id VARCHAR(100),
    duration_seconds NUMERIC(10, 2) NOT NULL,
    resolution VARCHAR(50) DEFAULT '1080p',
    storage_path TEXT,
    audio_path TEXT,
    raw_transcript JSONB,
    has_rights_confirmed BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_source_videos_project_id ON source_videos(project_id);

-- 4. Clips Table
CREATE TABLE IF NOT EXISTS clips (
    id VARCHAR(100) PRIMARY KEY,
    project_id VARCHAR(100) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    clip_number INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    hook TEXT NOT NULL,
    description TEXT,
    suggested_caption TEXT,
    hashtags TEXT[] DEFAULT '{}',
    call_to_action TEXT,
    ai_viral_score INT NOT NULL CHECK (ai_viral_score BETWEEN 0 AND 100),
    start_time_seconds NUMERIC(8, 2) NOT NULL,
    end_time_seconds NUMERIC(8, 2) NOT NULL,
    duration_seconds NUMERIC(8, 2) NOT NULL,
    aspect_ratio VARCHAR(20) DEFAULT '9:16',
    thumbnail_url TEXT,
    video_url TEXT,
    local_render_path TEXT,
    status VARCHAR(50) DEFAULT 'draft',
    render_status VARCHAR(50) DEFAULT 'completed',
    published_at TIMESTAMP WITH TIME ZONE,
    caption_style VARCHAR(50) DEFAULT 'none',
    font_family VARCHAR(50) DEFAULT 'Plus Jakarta Sans',
    caption_position VARCHAR(20) DEFAULT 'bottom',
    watermark_enabled BOOLEAN DEFAULT FALSE,
    watermark_text VARCHAR(100) DEFAULT '@clipforge.ai',
    speaker_center_x_percent NUMERIC(5, 2) DEFAULT 50,
    full_text TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_clips_project_id ON clips(project_id);
CREATE INDEX IF NOT EXISTS idx_clips_user_id ON clips(user_id);
CREATE INDEX IF NOT EXISTS idx_clips_score ON clips(ai_viral_score DESC);

-- 5. Processing Jobs Table (Long-running Video Processing Pipeline Persistence)
CREATE TABLE IF NOT EXISTS processing_jobs (
    job_id VARCHAR(100) PRIMARY KEY,
    project_id VARCHAR(100) REFERENCES projects(id) ON DELETE SET NULL,
    state VARCHAR(50) NOT NULL,
    status_message TEXT,
    step_index INT DEFAULT 0,
    total_steps INT DEFAULT 8,
    progress_percent INT DEFAULT 0,
    source_video_path TEXT,
    rendered_clips_count INT DEFAULT 0,
    total_clips_to_render INT DEFAULT 0,
    error TEXT,
    error_code VARCHAR(100),
    failed_clip_id VARCHAR(100),
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_processing_jobs_state ON processing_jobs(state);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_updated_at ON processing_jobs(updated_at DESC);

-- 6. Social Accounts Table
CREATE TABLE IF NOT EXISTS social_accounts (
    id VARCHAR(100) PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform VARCHAR(50) NOT NULL,
    account_username VARCHAR(150) NOT NULL,
    channel_or_page_name VARCHAR(255),
    platform_account_id VARCHAR(150),
    avatar_url TEXT,
    is_connected BOOLEAN DEFAULT FALSE,
    connected_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) DEFAULT 'Not Connected',
    access_token_encrypted TEXT,
    refresh_token_encrypted TEXT,
    token_expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, platform)
);

-- Seed default initial social accounts for usr-default
INSERT INTO social_accounts (id, user_id, platform, account_username, channel_or_page_name, is_connected, status)
VALUES 
    ('acc_ig', 'usr-default', 'instagram', 'Not Connected', 'Instagram Business / Creator Account', FALSE, 'Not Connected'),
    ('acc_yt', 'usr-default', 'youtube', 'Not Connected', 'YouTube Channel', FALSE, 'Not Connected'),
    ('acc_fb', 'usr-default', 'facebook', 'Not Connected', 'Facebook Page', FALSE, 'Not Connected')
ON CONFLICT (id) DO NOTHING;

-- 7. Publishing Jobs Table
CREATE TABLE IF NOT EXISTS publishing_jobs (
    id VARCHAR(100) PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    clip_id VARCHAR(100) NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
    clip_title VARCHAR(255),
    platform VARCHAR(50) NOT NULL,
    account_id VARCHAR(100),
    status VARCHAR(50) DEFAULT 'QUEUED',
    scheduled_at TIMESTAMP WITH TIME ZONE,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    published_at TIMESTAMP WITH TIME ZONE,
    external_post_id VARCHAR(150),
    external_post_url TEXT,
    error_message TEXT,
    retry_count INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_publishing_jobs_user ON publishing_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_publishing_jobs_status ON publishing_jobs(status);
CREATE INDEX IF NOT EXISTS idx_publishing_jobs_scheduled ON publishing_jobs(scheduled_at);

-- 8. Scheduled Posts Table
CREATE TABLE IF NOT EXISTS scheduled_posts (
    id VARCHAR(100) PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    clip_id VARCHAR(100) NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
    clip_title VARCHAR(255),
    platforms TEXT[] NOT NULL,
    scheduled_date VARCHAR(50) NOT NULL,
    scheduled_time VARCHAR(50) NOT NULL,
    timezone VARCHAR(50) DEFAULT 'UTC',
    status VARCHAR(50) DEFAULT 'scheduled',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_scheduled_posts_date ON scheduled_posts(scheduled_date);

-- 9. Analytics Table
CREATE TABLE IF NOT EXISTS analytics (
    id VARCHAR(100) PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    clip_id VARCHAR(100) REFERENCES clips(id) ON DELETE SET NULL,
    platform VARCHAR(50) NOT NULL,
    views_count INT DEFAULT 0,
    likes_count INT DEFAULT 0,
    comments_count INT DEFAULT 0,
    shares_count INT DEFAULT 0,
    avg_watch_time_seconds NUMERIC(5, 2) DEFAULT 0,
    engagement_rate NUMERIC(5, 2) DEFAULT 0,
    recorded_at DATE DEFAULT CURRENT_DATE
);

CREATE INDEX IF NOT EXISTS idx_analytics_user ON analytics(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_date ON analytics(recorded_at);
