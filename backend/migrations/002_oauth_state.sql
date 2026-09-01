CREATE TABLE IF NOT EXISTS oauth_states (
    id VARCHAR PRIMARY KEY,
    state_hash VARCHAR NOT NULL UNIQUE,
    state_data TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_oauth_states_expires_at ON oauth_states (expires_at);
