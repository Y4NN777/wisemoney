// Package store provides the pgx connection pool and the two repository types
// the edge persists: users and refresh_tokens.
//
// CRITICAL INVARIANT (INV-PROXY-01, Gate-4 decision 20):
//
//	This store contains NO financial data whatsoever.
//	Permitted tables: users, refresh_tokens.
//	Any column referencing a transaction, account, balance, amount, currency value,
//	category, budget, goal, merchant, note, tag, or any financial concept is
//	FORBIDDEN in this package by architectural contract.
//
// Rate-limit state is held in process memory (middleware/ratelimit.go), NOT in
// Postgres (Gate-4 decision 20, data-model.md §B.1).
package store

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// NewPool constructs a pgx connection pool for the edge auth database.
// The DSN is the DATABASE_URL env var (format: postgres://user:pass@host:port/db).
func NewPool(ctx context.Context, dsn string) (*pgxpool.Pool, error) {
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return nil, fmt.Errorf("store: creating pgx pool: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("store: pinging postgres: %w", err)
	}

	return pool, nil
}
