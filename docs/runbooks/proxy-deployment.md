# Runbook — Go edge proxy local deployment (Docker Compose)

| Field   | Value                                              |
| ------- | -------------------------------------------------- |
| Status  | Local/dev only; edge not deployed yet |
| Date    | 2026-06-29                                          |
| Scope   | Running the Go edge proxy + Postgres locally via Docker Compose |
| Source  | ARCHITECTURE §11 (deployment topology)             |

> The web app is currently hosted on Vercel. The Go edge is not deployed yet. This
> runbook covers the local Docker Compose stack for managed-mode development:
> Postgres plus the Go edge. BYO-key mode does not need this stack.

## Scope

- **Current hosting.** PWA is hosted on Vercel; Compose runs only the local Go edge
  plus Postgres for managed-mode development.
- **Images.** Go builder is pinned to `golang:1.25.11-bookworm`; runtime is
  `gcr.io/distroless/static-debian12:nonroot`; Postgres is `postgres:16.8`.

## Preconditions

- Docker + Compose are installed.
- `.env` exists at repo root, copied from `.env.example` and filled with real
  local secrets.
- `DATABASE_URL` points at the Compose service host `postgres`.
- `JWT_SIGNING_KEY` and `CONSENT_SIGNING_KEY` are both strong and different.

## Deployment steps

```bash
cp .env.example .env
docker compose up -d postgres
migrate -database "$DATABASE_URL" -path ./services/edge/migrations up
docker compose build edge
docker compose up -d edge
```

## Verification

- `docker compose ps` shows `postgres` healthy and `edge` running.
- `curl -i http://localhost:8080/v1/ai/proxy` should reject unauthenticated access.
- Confirm logs do not include provider keys, JWTs, consent assertions, or financial
  payloads.

## Rollback

- Stop the local edge with `docker compose stop edge`, rebuild from the
  previous commit, and start it again.
- Do not delete the `wisemoney_pgdata` volume unless intentionally resetting local
  auth data.

## Notes

- Postgres holds auth + rate-limit metadata only — never financial data.
- The current Compose file publishes Postgres on host port `5432` for local
  development. A future edge deployment must remove that host binding or restrict
  it to a private network.
