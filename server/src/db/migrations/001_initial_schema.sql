-- ZERO TRACE Database Schema Migration 001
-- Zero Metadata Anonymous Metadata Store
-- PostgreSQL and SQLite compatible syntax

CREATE TABLE IF NOT EXISTS shares (
    id VARCHAR(64) PRIMARY KEY,
    owner_token_hash VARCHAR(128) NOT NULL,
    is_password_protected BOOLEAN NOT NULL DEFAULT FALSE,
    password_salt VARCHAR(64),
    is_one_time BOOLEAN NOT NULL DEFAULT FALSE,
    max_downloads INTEGER NOT NULL DEFAULT 0,
    download_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    total_size_bytes BIGINT NOT NULL,
    chunk_count INTEGER NOT NULL,
    encrypted_manifest TEXT NOT NULL,
    is_destroyed BOOLEAN NOT NULL DEFAULT FALSE,
    destroyed_reason VARCHAR(64)
);

CREATE INDEX IF NOT EXISTS idx_shares_expires_at ON shares(expires_at);
CREATE INDEX IF NOT EXISTS idx_shares_is_destroyed ON shares(is_destroyed);
