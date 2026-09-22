-- ====================================================================
-- ClipForge AI — Migration 001: Initial Schema
-- ====================================================================

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    full_name VARCHAR(150),
    avatar_url TEXT,
    role VARCHAR(50) DEFAULT 'creator',
    plan_tier VARCHAR(50) DEFAULT 'free',
    google_id VARCHAR(100) UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    source_url TEXT NOT NULL,
    source_platform VARCHAR(50) DEFAULT 'youtube',
    status VARCHAR(50) DEFAULT 'completed',
    duration_seconds INT DEFAULT 0,
    clips_count INT DEFAULT 0,
    published_count INT DEFAULT 0,
    draft_count INT DEFAULT 0,
    thumbnail_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);

CREATE TABLE IF NOT EXISTS source_videos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    youtube_video_id VARCHAR(50) NOT NULL,
    video_title TEXT NOT NULL,
    channel_name VARCHAR(255),
    channel_id VARCHAR(100),
    duration_seconds INT NOT NULL,
    resolution VARCHAR(50) DEFAULT '1080p',
    storage_path TEXT,
    audio_path TEXT,
    raw_transcript JSONB,
    has_rights_confirmed BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS clips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    clip_number INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    hook TEXT NOT NULL,
    description TEXT,
    suggested_caption TEXT,
    hashtags TEXT[] DEFAULT '{}',
    call_to_action TEXT,
    ai_viral_score INT NOT NULL CHECK (ai_viral_score BETWEEN 0 AND 100),
    start_time_seconds NUMERIC(6, 2) NOT NULL,
    end_time_seconds NUMERIC(6, 2) NOT NULL,
    duration_seconds NUMERIC(5, 2) NOT NULL,
    aspect_ratio VARCHAR(20) DEFAULT '9:16',
    thumbnail_url TEXT,
    video_url TEXT,
    status VARCHAR(50) DEFAULT 'draft',
    caption_style VARCHAR(50) DEFAULT 'dynamic',
    font_family VARCHAR(50) DEFAULT 'Plus Jakarta Sans',
    caption_position VARCHAR(20) DEFAULT 'bottom',
    watermark_enabled BOOLEAN DEFAULT FALSE,
    watermark_text VARCHAR(100) DEFAULT '@clipforge',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_clips_project_id ON clips(project_id);
CREATE INDEX IF NOT EXISTS idx_clips_user_id ON clips(user_id);
CREATE INDEX IF NOT EXISTS idx_clips_score ON clips(ai_viral_score DESC);

CREATE TABLE IF NOT EXISTS clip_captions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clip_id UUID NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
    word_timings JSONB NOT NULL,
    full_text TEXT NOT NULL,
    style_config JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS social_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform VARCHAR(50) NOT NULL,
    account_username VARCHAR(150) NOT NULL,
    account_id VARCHAR(150) NOT NULL,
    channel_or_page_name VARCHAR(255),
    avatar_url TEXT,
    is_connected BOOLEAN DEFAULT TRUE,
    access_token_encrypted TEXT,
    refresh_token_encrypted TEXT,
    token_expires_at TIMESTAMP WITH TIME ZONE,
    permissions_scope TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, platform, account_id)
);

CREATE TABLE IF NOT EXISTS publishing_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    clip_id UUID NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
    social_account_id UUID REFERENCES social_accounts(id) ON DELETE SET NULL,
    platform VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'queued',
    publish_mode VARCHAR(20) DEFAULT 'immediate',
    scheduled_for TIMESTAMP WITH TIME ZONE,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    retry_count INT DEFAULT 0,
    external_post_id VARCHAR(150),
    external_post_url TEXT,
    is_demo BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_publishing_jobs_user ON publishing_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_publishing_jobs_status ON publishing_jobs(status);
CREATE INDEX IF NOT EXISTS idx_publishing_jobs_scheduled ON publishing_jobs(scheduled_for);

CREATE TABLE IF NOT EXISTS scheduled_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    clip_id UUID NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
    platforms VARCHAR(50)[] NOT NULL,
    scheduled_date DATE NOT NULL,
    scheduled_time TIME NOT NULL,
    timezone VARCHAR(50) DEFAULT 'UTC',
    status VARCHAR(50) DEFAULT 'scheduled',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    clip_id UUID REFERENCES clips(id) ON DELETE SET NULL,
    platform VARCHAR(50) NOT NULL,
    views_count INT DEFAULT 0,
    likes_count INT DEFAULT 0,
    comments_count INT DEFAULT 0,
    shares_count INT DEFAULT 0,
    avg_watch_time_seconds NUMERIC(5, 2) DEFAULT 0,
    engagement_rate NUMERIC(5, 2) DEFAULT 0,
    recorded_at DATE DEFAULT CURRENT_DATE
);

CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_name VARCHAR(50) NOT NULL,
    monthly_price_cents INT DEFAULT 0,
    clip_limit_monthly INT DEFAULT 30,
    clips_used_this_month INT DEFAULT 0,
    video_minutes_limit INT DEFAULT 60,
    video_minutes_used INT DEFAULT 0,
    storage_gb_limit INT DEFAULT 5,
    storage_gb_used NUMERIC(5, 2) DEFAULT 0.5,
    status VARCHAR(50) DEFAULT 'active',
    renews_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(150) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) DEFAULT 'info',
    is_read BOOLEAN DEFAULT FALSE,
    link_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
