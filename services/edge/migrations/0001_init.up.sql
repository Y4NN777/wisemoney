-- DESIGNED — applied by Y4NN via golang-migrate; never auto-run.
-- Migration: 0001_init
-- Direction: up
-- Tool: golang-migrate (https://github.com/golang-migrate/migrate)
-- Apply: migrate -database "$DATABASE_URL" -path ./migrations up
--
-- This schema contains ONLY auth state for the managed edge.
-- NO financial data. NO balance, account, transaction, category, budget, goal,
-- merchant, note, tag, or any financial concept. (INV-PROXY-01, Gate-4 decision 20)
--
-- Rate-limit state is in-memory (Go process), NOT in Postgres.
-- (Gate-4 decision 20, data-model.md §B.1)

CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE users (
    id            UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    email         CITEXT      NOT NULL,
    password_hash TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT users_email_uq UNIQUE (email),
    CONSTRAINT users_password_hash_nonempty CHECK (LENGTH(password_hash) > 0)
);

-- email index: login lookup (FindByEmail)
CREATE INDEX users_email_idx ON users (email);
-- created_at index: audit / admin queries
CREATE INDEX users_created_at_idx ON users (created_at);

CREATE TABLE refresh_tokens (
    id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT        NOT NULL,  -- SHA-256 of the raw token; raw token never stored
    issued_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked_at  TIMESTAMPTZ,           -- NULL = active; set on revocation or family invalidation
    CONSTRAINT refresh_tokens_token_hash_uq UNIQUE (token_hash),
    CONSTRAINT refresh_tokens_expiry_check CHECK (expires_at > issued_at)
);

-- user_id index: family-invalidation (RevokeAllForUser) and token listing
CREATE INDEX refresh_tokens_user_id_idx ON refresh_tokens (user_id);
-- expires_at index: periodic cleanup of expired + revoked rows
CREATE INDEX refresh_tokens_expires_at_idx ON refresh_tokens (expires_at);
-- token_hash index: single-token lookup on refresh (FindByTokenHash)
CREATE INDEX refresh_tokens_token_hash_idx ON refresh_tokens (token_hash);
