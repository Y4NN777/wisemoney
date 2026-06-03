-- DESIGNED — applied by Y4NN via golang-migrate; never auto-run.
-- Migration: 0001_init
-- Direction: down (rollback)
-- Tool: golang-migrate
-- Apply: migrate -database "$DATABASE_URL" -path ./migrations down 1

DROP TABLE IF EXISTS refresh_tokens;
DROP TABLE IF EXISTS users;
DROP EXTENSION IF EXISTS citext;
