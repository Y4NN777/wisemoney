package store

// users.go — UserRepository for the `users` table (data-model.md §B.2).
//
// Schema (applied by Y4NN via golang-migrate — migrations/0001_init.up.sql):
//
//	CREATE TABLE users (
//	    id            UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
//	    email         CITEXT      NOT NULL,
//	    password_hash TEXT        NOT NULL,
//	    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
//	    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
//	    CONSTRAINT users_email_uq UNIQUE (email),
//	    CONSTRAINT users_password_hash_nonempty CHECK (LENGTH(password_hash) > 0)
//	);
//
// All queries are parameterised (no string interpolation — SQL injection
// prevention is structural here, not a code-review checklist item).
//
// INVARIANT REMINDER: no financial column may ever be added to this table
// (INV-PROXY-01). If a financial concept needs persistence, it belongs on the
// client (IndexedDB), not here.

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// User is the edge representation of a managed-mode user.
// It contains ONLY auth fields — no financial data (INV-PROXY-01).
type User struct {
	ID           string
	Email        string
	PasswordHash string // Argon2id PHC string (INV-AUTH-02)
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

// UserRepository provides parameterised queries against the `users` table.
type UserRepository struct {
	pool *pgxpool.Pool
}

// NewUserRepository constructs a UserRepository.
func NewUserRepository(pool *pgxpool.Pool) *UserRepository {
	return &UserRepository{pool: pool}
}

// Create inserts a new user. Returns an error if the email already exists
// (the caller must map the unique-constraint error to the appropriate HTTP response
// without leaking account existence — M-AUTH-03).
func (r *UserRepository) Create(ctx context.Context, email, passwordHash string) (*User, error) {
	const q = `
		INSERT INTO users (email, password_hash)
		VALUES ($1, $2)
		RETURNING id, email, password_hash, created_at, updated_at
	`
	var u User
	err := r.pool.QueryRow(ctx, q, email, passwordHash).Scan(
		&u.ID, &u.Email, &u.PasswordHash, &u.CreatedAt, &u.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("store: users.Create: %w", err)
	}
	return &u, nil
}

// FindByEmail retrieves a user by email for login.
// Returns (nil, nil) when no user is found — the caller must use constant-time
// comparison and return the same error message as for wrong password (M-AUTH-03).
func (r *UserRepository) FindByEmail(ctx context.Context, email string) (*User, error) {
	const q = `
		SELECT id, email, password_hash, created_at, updated_at
		FROM users
		WHERE email = $1
	`
	var u User
	err := r.pool.QueryRow(ctx, q, email).Scan(
		&u.ID, &u.Email, &u.PasswordHash, &u.CreatedAt, &u.UpdatedAt,
	)
	if err != nil {
		// pgx.ErrNoRows means no user with this email — not an error for the caller;
		// the login handler must treat nil user the same as a wrong password (M-AUTH-03).
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("store: users.FindByEmail: %w", err)
	}
	return &u, nil
}

// FindByID retrieves a user by primary key.
// Used by the refresh-token flow to validate the user still exists (INV-AUTH-03).
func (r *UserRepository) FindByID(ctx context.Context, id string) (*User, error) {
	const q = `
		SELECT id, email, password_hash, created_at, updated_at
		FROM users
		WHERE id = $1
	`
	var u User
	err := r.pool.QueryRow(ctx, q, id).Scan(
		&u.ID, &u.Email, &u.PasswordHash, &u.CreatedAt, &u.UpdatedAt,
	)
	if err != nil {
		// pgx.ErrNoRows: user was deleted between token issuance and refresh.
		// Return nil, nil so the refresh handler can issue a clean 401 (INV-AUTH-03).
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("store: users.FindByID: %w", err)
	}
	return &u, nil
}
