package store

// refresh_tokens.go — RefreshTokenRepository for the `refresh_tokens` table
// (data-model.md §B.2).
//
// Schema (applied by Y4NN via golang-migrate — migrations/0001_init.up.sql):
//
//	CREATE TABLE refresh_tokens (
//	    id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
//	    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
//	    token_hash  TEXT        NOT NULL,
//	    issued_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
//	    expires_at  TIMESTAMPTZ NOT NULL,
//	    revoked_at  TIMESTAMPTZ,
//	    CONSTRAINT refresh_tokens_token_hash_uq UNIQUE (token_hash),
//	    CONSTRAINT refresh_tokens_expiry_check CHECK (expires_at > issued_at)
//	);
//
// The raw token value is NEVER stored — only its SHA-256 hash (token_hash).
// The raw token is returned to the client once at issuance and discarded
// server-side (M-AUTH-04, data-model.md §B.2).
//
// INVARIANT REMINDER: no financial column may ever be added to this table
// (INV-PROXY-01).

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// RefreshToken is the edge representation of a stored refresh token.
type RefreshToken struct {
	ID        string
	UserID    string
	TokenHash string
	IssuedAt  time.Time
	ExpiresAt time.Time
	RevokedAt *time.Time // nil = active
}

// RefreshTokenRepository provides parameterised queries against `refresh_tokens`.
type RefreshTokenRepository struct {
	pool *pgxpool.Pool
}

// NewRefreshTokenRepository constructs a RefreshTokenRepository.
func NewRefreshTokenRepository(pool *pgxpool.Pool) *RefreshTokenRepository {
	return &RefreshTokenRepository{pool: pool}
}

// Create persists a new refresh token (hash only — raw token already sent to client).
func (r *RefreshTokenRepository) Create(ctx context.Context, userID, tokenHash string, expiresAt time.Time) (*RefreshToken, error) {
	const q = `
		INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
		VALUES ($1, $2, $3)
		RETURNING id, user_id, token_hash, issued_at, expires_at, revoked_at
	`
	var t RefreshToken
	err := r.pool.QueryRow(ctx, q, userID, tokenHash, expiresAt).Scan(
		&t.ID, &t.UserID, &t.TokenHash, &t.IssuedAt, &t.ExpiresAt, &t.RevokedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("store: refresh_tokens.Create: %w", err)
	}
	return &t, nil
}

// FindByTokenHash retrieves a token by its SHA-256 hash for rotation validation.
// Returns the record even if revoked — the caller checks RevokedAt.
func (r *RefreshTokenRepository) FindByTokenHash(ctx context.Context, hash string) (*RefreshToken, error) {
	const q = `
		SELECT id, user_id, token_hash, issued_at, expires_at, revoked_at
		FROM refresh_tokens
		WHERE token_hash = $1
	`
	var t RefreshToken
	err := r.pool.QueryRow(ctx, q, hash).Scan(
		&t.ID, &t.UserID, &t.TokenHash, &t.IssuedAt, &t.ExpiresAt, &t.RevokedAt,
	)
	if err != nil {
		// pgx.ErrNoRows: token hash not in the table (unknown / already purged).
		// Return nil, nil so the refresh handler issues a clean 401.
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("store: refresh_tokens.FindByTokenHash: %w", err)
	}
	return &t, nil
}

// Rotate atomically consumes an active refresh token and inserts its replacement.
// rotated is false when another request already consumed the presented token.
func (r *RefreshTokenRepository) Rotate(
	ctx context.Context,
	presentedID, userID, replacementHash string,
	replacementExpiresAt time.Time,
) (replacement *RefreshToken, rotated bool, err error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, false, fmt.Errorf("store: refresh_tokens.Rotate begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	tag, err := tx.Exec(ctx, `
		UPDATE refresh_tokens
		SET revoked_at = now()
		WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
	`, presentedID, userID)
	if err != nil {
		return nil, false, fmt.Errorf("store: refresh_tokens.Rotate revoke: %w", err)
	}
	if tag.RowsAffected() != 1 {
		return nil, false, nil
	}

	const insert = `
		INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
		VALUES ($1, $2, $3)
		RETURNING id, user_id, token_hash, issued_at, expires_at, revoked_at
	`
	var created RefreshToken
	if err := tx.QueryRow(ctx, insert, userID, replacementHash, replacementExpiresAt).Scan(
		&created.ID,
		&created.UserID,
		&created.TokenHash,
		&created.IssuedAt,
		&created.ExpiresAt,
		&created.RevokedAt,
	); err != nil {
		return nil, false, fmt.Errorf("store: refresh_tokens.Rotate create: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, false, fmt.Errorf("store: refresh_tokens.Rotate commit: %w", err)
	}
	return &created, true, nil
}

// RevokeAllForUser invalidates the entire token family for a user on reuse
// detection (THREAT_MODEL §2.2 family invalidation on reuse detection).
func (r *RefreshTokenRepository) RevokeAllForUser(ctx context.Context, userID string) error {
	const q = `
		UPDATE refresh_tokens
		SET revoked_at = now()
		WHERE user_id = $1 AND revoked_at IS NULL
	`
	_, err := r.pool.Exec(ctx, q, userID)
	if err != nil {
		return fmt.Errorf("store: refresh_tokens.RevokeAllForUser: %w", err)
	}
	return nil
}

// DeleteExpiredRevoked purges expired and revoked tokens (table hygiene).
// Intended to be called from a periodic background job or a startup task.
// Query from data-model.md §B.2.
func (r *RefreshTokenRepository) DeleteExpiredRevoked(ctx context.Context) error {
	const q = `DELETE FROM refresh_tokens WHERE expires_at < now() AND revoked_at IS NOT NULL`
	_, err := r.pool.Exec(ctx, q)
	if err != nil {
		return fmt.Errorf("store: refresh_tokens.DeleteExpiredRevoked: %w", err)
	}
	return nil
}
