# Changelog

All notable changes to WiseMoney are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **PWA update prompt** — added a Sonner-powered update notification so refreshed
  service-worker builds can prompt the user instead of silently racing a reload.
- **Global action feedback** — added localized success/error feedback across BYO
  key settings, budgets, export/import, goals, and recurring management flows.
- **Event-sourced management actions** — wired state-management actions through the
  financial-state event pipeline with tests for domain and pillar behavior.
- **Dettes & Créances** — added an event-sourced planning surface for receivables
  and debts with debtor/creditor name, motive, amount, date, status updates, and
  reminders for unsettled receivables.

### Fixed

- **PWA assets and refresh flow** — refreshed app icons, added `workbox-window`, and
  fixed the update-handler lint issue and reload race.
- **Responsive web UI** — constrained the account form on small screens and
  stabilized dropdown behavior inside dialogs.
- **Capture flow** — added action feedback and fixed event-sourced state updates
  from capture interactions.

### Changed

- **Public docs** — updated the root README status/run instructions and rewrote
  `SECURITY.md` for public readability.

### Security

- **Edge — pgx/v5 5.7.4 → 5.9.2** — fixes CVE-2026-33816 (GO-2026-4772, CVSS 9.8),
  a memory-safety vulnerability in the Postgres driver on the auth + rate-limit path
  (also clears GO-2026-4771).
- **Edge — golang.org/x/crypto 0.38.0 → 0.52.0** — clears GO-2025-4134 / GO-2025-4135
  and ~10 related advisories; this library backs argon2 password hashing (FR-AUTH).
- **Edge — go-chi/chi/v5 5.2.1 → 5.2.4** — fixes GO-2025-3770 (host-header injection →
  open redirect in `RedirectSlashes`) and GO-2026-4316.
- **Edge — Go toolchain 1.23 → 1.25.11** — `go.mod` `go 1.25.0` + `toolchain go1.25.11`,
  Dockerfile builder `golang:1.25.11-bookworm`. Clears 51 stdlib advisories.
- **Frontend — vitest ^2.0.5 → ^4.1.8** — fixes GHSA-5xrq-8626-4rwp (CVSS 9.8, dev-time
  test runner).
- **Frontend — vite ^5.4.0 → ^7.3.5** — fixes GHSA-4w7w-66w2-5vf9 (CVSS 6.3, dev server);
  transitively fixes esbuild GHSA-67mh-4wv8-2f99 (CVSS 5.3). Target Vite 7 chosen for
  portfolio alignment (ADR-0010).

### Added

- **AI orchestration — managed path** — `submit` (managed mode) attaches the in-memory
  access JWT (`Bearer`), resolves egress level from per-feature consent (`X-Egress-Level`
  + `X-Feature`, and `X-Consent-Assertion` only on full), and calls the edge `/v1/ai/proxy`
  via `edgeClient.postAiProxy`. 401 → session refresh + one retry; 503 → `ProviderUnavailableSignal`
  (INV-PROXY-04, never fabricates); 200 → normalized response. Consent-gated egress enforced
  client-side and at the edge boundary. When full consent is granted but the assertion is
  missing/expired, the client **re-acquires** it (`POST /v1/consent/assert`, with refresh+retry)
  and, if that fails, **gracefully downgrades** — `toRedacted()` strips full-only fields so a
  full-shaped payload is never sent under a `redacted` header. BYO-direct path remains a
  separate follow-up.
- **Client auth-session module** — `api/edgeClient.ts` (typed register/login/refresh,
  `Authorization: Bearer`, HTTPS-enforced base URL) + `auth/session.ts` (zustand store).
  Access JWT held **in-memory only**; refresh token **AES-GCM-sealed** into a new `authSession`
  IndexedDB store (**Dexie v3**); on-demand refresh with rotation, 401 → clear + delete,
  `restoreSession` on unlock, `logout`. INV-AUTH-06/07 enforced (in-memory access, sealed
  refresh, unlock-coupled, no background refresh). Mishmar PASS-WITH-NITS (closed) + QA PASS.
- **Edge — managed-mode auth** (`/v1/auth/register|login|refresh`) — wired to the Postgres
  repos. Argon2id PHC password hashing + constant-time verify (INV-AUTH-02, M-AUTH-03);
  15-min HS256 access JWT (alg-pinned) + rotating single-use refresh token with
  **reuse-detection family invalidation** (M-AUTH-05, RFC 6749 §10.4); login timing-equalized
  against account enumeration. Mishmar review fixed a timing-oracle (dummy hash now uses prod
  Argon2 params) and pinned JWT to HS256. (Refresh rotation atomicity + handler integration
  tests are tracked follow-ups.)
- **Client crypto foundation** — `crypto/envelope.ts` (AES-GCM-256 seal/open, unique
  96-bit IV) and `crypto/keyManagement.ts` (Argon2id master-key derivation via hash-wasm,
  passphrase verification, BYO key seal/open, WebAuthn-PRF master-key wrap/unwrap). Keys
  imported non-extractable, `encrypt`/`decrypt` usages only; raw key bytes zeroed after use
  (INV-KEY-02/03). Dexie schema → **v2** (`keyMeta.wrappedIv`). Mishmar review PASS-WITH-NITS.
- **Edge — consent gate on `POST /v1/ai/proxy`** — `consentSvc.Verify` wired into the
  proxy handler (ARCHITECTURE §10a, INV-EGR-03a). Full-egress requires a valid, unexpired,
  signature-correct assertion bound to the caller's JWT sub, the `X-Feature` header, and
  `level="full"`; any failure forces redacted and the structural cap rejects full-only
  fields with 400. Fail-closed; no payload logged (INV-PROXY-02). 10 gate tests.
- **`X-Feature` request header** — declares the feature a `/v1/ai/proxy` request pertains
  to (ARCHITECTURE §10a). Sibling to `X-Egress-Level` / `X-Consent-Assertion`.
- `GOTOOLCHAIN=local` in the edge Dockerfile builder — hermetic build, no surprise
  toolchain auto-download.

### Fixed

- **Security hardening (review triage quick-wins)** — request body-size limits on all edge
  routes (8 KiB auth/consent, 1 MiB proxy; 413 on exceed, CWE-400); register password/email
  max-length bounds (≤128 / ≤254, Argon2 DoS guard); `.env.example` → `sslmode=require`
  (CWE-311); `apps/web` startup assertion requiring `https://` for `VITE_EDGE_BASE_URL` in
  production builds (CWE-311). See `security-review.md` triage.
- **`apps/web/tsconfig.json`** — added `allowImportingTsExtensions` + `noEmit` (removed
  `outDir`; Vite handles bundling). The scaffold imports with explicit `.ts`/`.tsx`
  extensions; this clears the project-wide TS5097 errors surfaced by the first typecheck.
- **`apps/web` lint hygiene** — eslint `no-unused-vars` now honors the `^_`
  intentionally-unused convention; 61 stub-file lint errors cleared without implementing
  product logic (async stubs converted to non-async `Promise.reject`, behaviorally identical;
  removed dead imports; dropped one redundant type assertion). `apps/web` now passes
  lint + typecheck + test clean.
- `.github/workflows/security-scan.yml` (GitHub Actions) — osv-scanner v2.3.8 (pinned,
  SHA256-verified) manifest scan + authoritative binary scan; fails on new critical/high.
- `docs/adr/0010-dependency-security-baseline-and-scanning-policy.md` — dependency
  security baseline and scanning policy.
- `docs/adr/0011-mvp-ai-provider-strategy-managed-redacted-byo-key-full-egress.md` —
  MVP provider strategy (T-S0-02 verification outcome).
- `docs/adr/0012-client-auth-session-and-token-storage.md` — client token storage
  decision (resolves SRS OQ-06).
- `docs/runbooks/dependency-scanning.md` — how-to for running the scans.

### Changed

- **AI provider strategy (ADR-0011)** — provider data-handling terms verified
  (2026-06-05). MVP: managed mode = free models (OpenRouter + Gemini-free),
  **redacted-egress only**; full-egress = **BYO-key only**; NVIDIA hosted **dropped**
  (ToS §4.3 prohibits financial data + trains with no opt-out); paid managed deferred.
  ARCHITECTURE §9a/§9b, CONTRACT §8 (MVP-scoping note, INV-EGR-03a unchanged),
  THREAT_MODEL §2.1 + §7 residual updated.
- **Client auth token storage (ADR-0012, resolves OQ-06)** — access JWT held in-memory
  only; refresh token in the AES-GCM-encrypted IndexedDB store (master-key/WebAuthn-gated);
  session coupled to store-unlock; no edge wire change. Adds CONTRACT INV-AUTH-06/07;
  escalates M-EGR-04 (strict CSP/SRI) to a primary MVP control; adds an edge
  refresh-rotation reuse-detection obligation (M-AUTH-05).
- **Frontend** — `@vitejs/plugin-react` ^4.3.1 → ^5.2.0, `vite-plugin-pwa` ^0.20.5 →
  ^1.3.0 (required peers for Vite 7).
- Routing library decision recorded: TanStack Router confirmed (no `react-router`).
