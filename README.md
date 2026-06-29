<p align="center">
  <img src="./apps/web/public/logo.svg" alt="WiseMoney" width="260" />
</p>

<p align="center">
  Personal finance, local-first. Track money, plan ahead, and use AI guidance only when you choose to.
</p>

<p align="center">
  <strong>Live PWA: <a href="https://wisemoney.y7labs.studio/">wisemoney.y7labs.studio</a></strong> · <strong>Go edge not deployed yet</strong>
</p>

# WiseMoney

WiseMoney is a mobile-first personal finance PWA. It keeps financial data on the
device by default, uses an encrypted local event log, and separates everyday money
tracking from optional AI features.

The app is already live at
[wisemoney.y7labs.studio](https://wisemoney.y7labs.studio/), served as a PWA via
Vercel. The managed Go edge exists in this repo for auth and managed AI proxying,
but it is not deployed yet. Until that edge is online, managed-mode AI calls are
local-development only; bring-your-own-key mode remains the backend-free path.

## What is in the app

- Dashboard, capture flow, budgets, goals, recurring transactions, and settings.
- Dettes & Créances: debts and receivables with motive, amount, date, status, and
  reminders for unsettled receivables.
- Local encrypted storage with Dexie / IndexedDB and Web Crypto.
- PWA installability, service-worker update prompt, and live Vercel-hosted web build.
- Optional managed edge in Go for auth, consent assertions, and AI proxy routing.

## Current deployment

| Surface | Status |
| --- | --- |
| Web PWA | Live at [wisemoney.y7labs.studio](https://wisemoney.y7labs.studio/) |
| Go edge | Not deployed yet |
| Postgres for edge auth | Local/dev only |
| BYO-key AI mode | Does not need the edge |

## Run locally

```bash
pnpm install
pnpm dev
```

The web app runs at `http://localhost:5173`.

## Managed edge locally

Only needed for managed AI-key mode.

```bash
cp .env.example .env
docker compose up -d postgres
migrate -path services/edge/migrations -database "$DATABASE_URL" up
docker compose build edge
docker compose up -d edge
```

The edge runs at `http://localhost:8080`.

## Repository

| Path | Purpose |
| --- | --- |
| `apps/web/` | React + TypeScript PWA. Domain logic and encrypted local storage live here. |
| `services/edge/` | Go managed edge for auth, consent, rate limiting, and AI proxying. |
| `docs/` | Product, architecture, threat model, ADRs, diagrams, and runbooks. |
| `docker-compose.yml` | Local Postgres + edge stack for managed-mode development. |

## Documentation

Start with [docs/README.md](./docs/README.md). Security posture is documented in
[SECURITY.md](./SECURITY.md) and [docs/THREAT_MODEL.md](./docs/THREAT_MODEL.md).

Provider data-handling verification remains a launch gate for any managed-mode
provider expansion: [provider terms runbook](./docs/runbooks/provider-terms-verification.md).
