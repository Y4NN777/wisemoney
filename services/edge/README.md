# WiseMoney managed edge

Thin, stateless Go auth + AI-gateway proxy for managed mode.
Holds no financial data (INV-PROXY-01). BYO-key mode bypasses this service entirely.

## Commands for Y4NN to run

### Build and start

```sh
# From the repository root:
docker compose build edge
docker compose up -d postgres edge
```

### Apply migrations (golang-migrate)

```sh
# Install golang-migrate CLI if not present:
go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@v4.18.2

# Apply up:
migrate -database "$DATABASE_URL" -path ./services/edge/migrations up

# Roll back one step:
migrate -database "$DATABASE_URL" -path ./services/edge/migrations down 1
```

### Run locally (requires Go 1.23 and a running Postgres)

```sh
# Copy .env.example to .env, fill in values, then:
source .env
cd services/edge
go run ./cmd/edge
```

### govulncheck (CI — M-PROXY-02)

```sh
go install golang.org/x/vuln/cmd/govulncheck@latest
govulncheck ./...
```

## Architecture notes

- Listens on `:8080` (EDGE_PORT).
- Postgres: `postgres:5432` (compose service name). Tables: `users`, `refresh_tokens` only.
- Rate-limit: in-memory token bucket per user (Gate-4 #20). Redis is the scale-out path.
- Middleware chain: LogSanitizer → JWTAuth → RateLimit.
- Egress enforcement: structural payload cap for managed mode (AQ-01, THREAT_MODEL §3).
- Provider fallback: cross-provider chain per task type (FR-AIORCH-05).
- No financial data persisted anywhere on the edge (INV-PROXY-01).
