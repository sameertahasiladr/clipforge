-- Migration 003: PostgreSQL-backed OAuth State and Encrypted Per-User Cookies
CREATE TABLE IF NOT EXISTS oauth_states (
    state_token VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    consumed_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
);
CREATE INDEX IF NOT EXISTS idx_oauth_states_token ON oauth_states(state_token);
CREATE INDEX IF NOT EXISTS idx_oauth_states_user ON oauth_states(user_id);

CREATE TABLE IF NOT EXISTS user_cookies (
    user_id VARCHAR(100) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    encrypted_cookies TEXT NOT NULL,
    cookie_count INT DEFAULT 0,
    youtube_cookie_count INT DEFAULT 0,
    has_session_cookies BOOLEAN DEFAULT FALSE,
    sample_domains TEXT[],
    size_bytes INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_user_cookies_user ON user_cookies(user_id);
