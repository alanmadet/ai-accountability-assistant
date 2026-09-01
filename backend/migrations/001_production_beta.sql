CREATE TABLE IF NOT EXISTS allowed_users (
    id VARCHAR PRIMARY KEY,
    email VARCHAR NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    invited_by VARCHAR,
    status VARCHAR NOT NULL DEFAULT 'invited',
    last_login_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_allowed_users_email_status ON allowed_users (email, status);

ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS google_access_token TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS google_token_expires_at TIMESTAMP;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS gmail_connected BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE user_settings SET gmail_connected = TRUE WHERE google_refresh_token IS NOT NULL;

INSERT INTO allowed_users (id, email, created_at, invited_by, status)
SELECT 'migrated-' || md5(lower(trim(user_email))), lower(trim(user_email)),
       CURRENT_TIMESTAMP, 'existing-deployment', 'active'
FROM user_settings
WHERE user_email IS NOT NULL AND trim(user_email) <> ''
ON CONFLICT (email) DO NOTHING;

ALTER TABLE processed_emails ADD COLUMN IF NOT EXISTS sender_email VARCHAR;
ALTER TABLE processed_emails ADD COLUMN IF NOT EXISTS thread_id VARCHAR;
ALTER TABLE processed_emails ADD COLUMN IF NOT EXISTS received_at TIMESTAMP;
ALTER TABLE processed_emails ADD COLUMN IF NOT EXISTS unsubscribe_url VARCHAR;
ALTER TABLE processed_emails ADD COLUMN IF NOT EXISTS rfc822_message_id VARCHAR;
ALTER TABLE processed_emails ADD COLUMN IF NOT EXISTS content_hash VARCHAR;
ALTER TABLE processed_emails ADD COLUMN IF NOT EXISTS embedded_at TIMESTAMP;
CREATE INDEX IF NOT EXISTS ix_processed_emails_user_received ON processed_emails (user_email, received_at DESC);

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;

ALTER TABLE sync_jobs ADD COLUMN IF NOT EXISTS user_email VARCHAR;
ALTER TABLE sync_jobs ADD COLUMN IF NOT EXISTS emails_synced INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sync_jobs ADD COLUMN IF NOT EXISTS emails_parsed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sync_jobs ADD COLUMN IF NOT EXISTS emails_embedded INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sync_jobs ADD COLUMN IF NOT EXISTS embedding_failures INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sync_jobs ADD COLUMN IF NOT EXISTS indexed_chunks INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sync_jobs ADD COLUMN IF NOT EXISTS error TEXT;
ALTER TABLE sync_jobs ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE sync_jobs ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;

ALTER TABLE insights ADD COLUMN IF NOT EXISTS subject_key VARCHAR;
ALTER TABLE insights ADD COLUMN IF NOT EXISTS is_dismissed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE insights ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE insights ADD COLUMN IF NOT EXISTS status VARCHAR NOT NULL DEFAULT 'active';
ALTER TABLE insights ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE insights ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;
ALTER TABLE insights ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP;
ALTER TABLE insights ADD COLUMN IF NOT EXISTS confidence INTEGER;
ALTER TABLE insights ADD COLUMN IF NOT EXISTS priority VARCHAR;
ALTER TABLE insights ADD COLUMN IF NOT EXISTS score DOUBLE PRECISION;
ALTER TABLE insights ADD COLUMN IF NOT EXISTS evidence_email_ids TEXT;
UPDATE insights SET status = 'dismissed' WHERE is_dismissed = TRUE AND status = 'active';
CREATE INDEX IF NOT EXISTS ix_insights_user_status ON insights (user_email, status, created_at DESC);

CREATE TABLE IF NOT EXISTS insight_feedback (
    id VARCHAR PRIMARY KEY,
    insight_id VARCHAR NOT NULL REFERENCES insights(id) ON DELETE CASCADE,
    user_email VARCHAR NOT NULL,
    useful BOOLEAN NOT NULL,
    reason VARCHAR,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_insight_feedback_insight ON insight_feedback (insight_id);

CREATE TABLE IF NOT EXISTS indexing_status (
    user_email VARCHAR PRIMARY KEY,
    emails_synced INTEGER NOT NULL DEFAULT 0,
    emails_parsed INTEGER NOT NULL DEFAULT 0,
    emails_embedded INTEGER NOT NULL DEFAULT 0,
    embedding_failures INTEGER NOT NULL DEFAULT 0,
    indexed_chunks INTEGER NOT NULL DEFAULT 0,
    last_successful_indexing_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_email_chunks_user_email ON email_chunks (user_email);
CREATE INDEX IF NOT EXISTS ix_processed_emails_fts ON processed_emails USING GIN (
    to_tsvector('english', coalesce(subject, '') || ' ' || coalesce(sender, '') || ' ' || coalesce(body, ''))
);
