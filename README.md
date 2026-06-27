# WiseMoney

> Local-first personal-finance PWA — real-time tracking, AI financial guidance, and
> adaptive financial literacy, in one mobile-first loop. All financial data lives
> encrypted on-device; any cloud/AI egress is consent-gated.

**Status:** Sprint S0 — specification, design, and MVP scaffold complete; full client
auth-session, crypto, AI orchestration (managed-mode), and PWA foundation wired.
Full design set in [`docs/`](./docs/) (start at [`docs/README.md`](./docs/README.md)).

## Structure

```
apps/web/        React + TypeScript PWA — ALL domain logic + encrypted IndexedDB
services/edge/   Go managed edge — thin stateless auth + AI-gateway (no financial data)
docs/            PRD · SRS · CONTRACT · ARCHITECTURE · THREAT_MODEL · C4 · UML · data model · ADRs
docker-compose.yml   Postgres (auth only) + the Go edge
```

Bring-your-own-key mode runs the app fully client-side with **no** backend at all;
the Go edge + Postgres are only needed for *managed* AI-key mode.

## Prerequisites

- Node 20 + pnpm 9 (frontend)
- Docker + Compose (edge + Postgres; the edge builds in-image, so a local Go
  toolchain is **not** required)

## Run

> Dependency audit already done (`/dep-audit` at `050d578`). All dependencies pinned
> and verified.

**Frontend (PWA):**
```
pnpm install            # from repo root (pnpm workspace)
pnpm dev                # WiseMoney web on http://localhost:5173
```

**Managed edge (only for managed AI-key mode):**
```
cp .env.example .env    # then fill secrets (use SOPS/age for real secrets)
docker compose up -d postgres
# apply the DESIGNED migrations (you run these — never auto-run):
#   migrate -path services/edge/migrations -database "$DATABASE_URL" up
docker compose build edge && docker compose up -d edge   # edge on http://localhost:8080
```

For local (non-Docker) edge dev only: `cd services/edge && go mod tidy` first.

## Security

See [`SECURITY.md`](./SECURITY.md) and [`docs/THREAT_MODEL.md`](./docs/THREAT_MODEL.md).
**Launch-blocker:** verify AI-provider data-handling terms before shipping managed
mode ([`docs/runbooks/provider-terms-verification.md`](./docs/runbooks/provider-terms-verification.md)).
