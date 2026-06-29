# @wisemoney/web

React 18 + TypeScript 5 PWA client. All domain logic lives here; the Go edge is
thin auth + AI proxy only (ARCHITECTURE §1).

The web app is live at `https://wisemoney.y7labs.studio/`, hosted through Vercel.
Managed-mode calls require a deployed edge URL; until the edge is deployed, use
`VITE_EDGE_BASE_URL=http://localhost:8080` for local managed-mode development.

## Prerequisites

- Node 20 (`.nvmrc` at repo root)
- pnpm >= 9 (never npm or yarn)

## Dev commands

```sh
# Install all workspace deps (run from repo root):
pnpm install

# Start dev server (hot-reload, PWA disabled in dev):
pnpm dev

# Type-check:
pnpm typecheck

# Lint:
pnpm lint

# Run unit tests:
pnpm test

# Build for production:
pnpm build
```

## Environment

Copy `.env.example` (repo root) to `.env` when using managed mode. The only
variable the PWA reads is:

- `VITE_EDGE_BASE_URL` — base URL for the managed Go edge (managed mode only).
  BYO-key mode runs fully client-side and does not need this variable (INV-AUTH-05).

## Architecture notes

- All financial data lives in IndexedDB (Dexie), encrypted AES-GCM (INV-PERS-02).
- Money is integer minor units everywhere — no floats (INV-MON-01).
- The event log is append-only and is the single source of truth (INV-EVT-01/02).
- The Financial State pillar has zero dependency on the AI pillar (NFR-MOD-01).
- UI surfaces never import provider SDKs (NFR-MOD-02).
- All consent reads/writes go through `src/consent/` only (NFR-MOD-03).
