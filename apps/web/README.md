# @wisemoney/web

React 18 + TypeScript 5 PWA client. All domain logic lives here; the Go edge is
thin auth + AI proxy only (ARCHITECTURE §1).

The web app is live at `https://wisemoney.y7labs.studio/`, hosted through Vercel.
Managed financial calls require a deployed edge URL; until the edge is deployed,
use `VITE_EDGE_BASE_URL=http://localhost:8080` for local managed-mode development.
The public WiseBot product-help assistant uses separate Vercel functions and
never calls the Go financial edge.

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

# Run the built PWA smoke flow (requires a preview server on port 4173):
pnpm --filter @wisemoney/web test:pwa

# Verify WebAuthn PRF setup/unlock with Chrome's virtual CTAP2 authenticator:
pnpm --filter @wisemoney/web test:webauthn

# Build for production:
pnpm build
```

## Environment

Copy `.env.example` (repo root) to `.env` when using managed mode. Client-visible
variables use the `VITE_` prefix:

- `VITE_EDGE_BASE_URL` — base URL for the managed Go edge (managed mode only).
  BYO-key mode runs fully client-side and does not need this variable (INV-AUTH-05).
- `VITE_HELP_DAILY_UNITS` and `VITE_HELP_LOCAL_CONCURRENCY` — optional local
  admission limits; defaults are 20 units per UTC day and one active request per
  browser profile.

### Help gateway deployment

The function under `api/help/messages.ts` is a stateless same-origin proxy. It
calls the Google Gemini API directly, keeps the credential outside the PWA
bundle, and stores no queue, quota, question, image, or conversation. It has no
database or Go edge dependency.

Written help and WiseBot share the versioned `ProductTask` catalog in
`src/help/corpus.ts`. The browser sends only known task identifiers and a
strict `SafeHelpContext` (version, locale, surface, entry point, and optional
generic fault code); the function rebuilds trusted instructions from the
catalog and rejects unknown identifiers or extra fields. Amounts, balances,
account names, transactions, notes, vault contents, screenshots, and stacks are
not part of that context. Provider output is streamed as `meta`, `delta`, and
`done` SSE events, with deterministic catalog steps as the client fallback.

Create a free-tier API key in Google AI Studio and set `GEMINI_API_KEY` in the
Vercel project's server environment. Leave billing and automatic upgrades
disabled on the Google project. `HELP_GEMMA_MODEL` defaults to
`gemma-4-26b-a4b-it`; neither variable may use the `VITE_` prefix. Restrict the
key to the Generative Language API where Google Cloud key restrictions are
available.

The PWA implements admission in TypeScript using a FIFO queue, Web Locks, and
browser storage shared across tabs. Text costs one unit, an image costs two,
reservations expire automatically, failed provider requests are refunded, and the
pool resets at midnight UTC. These limits intentionally apply to one browser
profile: clearing site data resets them, and they do not claim to coordinate users
on separate devices. Provider throttling is retried by the stateless function and
is never exposed directly to the browser. When Google's free quota is unavailable,
the chat stops cleanly while the cached written guide remains available. Before
the first message, the PWA explains that chat content is sent to Google and asks
the user not to include personal or financial information.

## Architecture notes

- All financial data lives in IndexedDB (Dexie), encrypted AES-GCM (INV-PERS-02).
- Money is integer minor units everywhere — no floats (INV-MON-01).
- The event log is append-only and is the single source of truth (INV-EVT-01/02).
- Planned expenses are one-off intentions managed from Planning and stored in
  that journal. They remain
  separate from actual transactions and from repeating recurring items, and affect
  balances only when completion creates an expense transaction.
- The custom `injectManifest` service worker precaches the offline shell and WASM
  unlock asset. Its versioned IndexedDB reminder queue isolates `financial` and
  `coach` scopes and stores only a label, dates, locale, and app-relative
  destination—never an amount or decrypted vault payload. Coach notifications
  require explicit permission, are silent, expire after 48 hours, and are capped
  locally.
  Delivery is opportunistic because browser activation and Periodic Background
  Sync availability vary by platform.
- The local coach is deterministic and event-driven. Settings, exposure history,
  and generic diagnostics remain on the device; no provider request starts until
  the user explicitly opens WiseBot and sends a question.
- ICS helpers create a manual dated or recurring reminder, or four rotating weekly
  review series. Calendar files are bilingual, include `VALARM`, and omit amounts.
- The Financial State pillar has zero dependency on the AI pillar (NFR-MOD-01).
- UI surfaces never import provider SDKs (NFR-MOD-02).
- All consent reads/writes go through `src/consent/` only (NFR-MOD-03).
