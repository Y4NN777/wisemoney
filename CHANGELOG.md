# Changelog

All notable changes to WiseMoney are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security

- **Web dependency security** — patched transitive tooling dependencies to
  `brace-expansion` 1.1.16/2.1.2/5.0.8, `fast-uri` 3.1.4, and `js-yaml` 4.3.0.
  A time-bounded OSV exception covers only the dev-only brace-expansion branches
  that have no compatible fix for GHSA-mh99-v99m-4gvg; forcing major 5 breaks
  ESLint, and the exception expires on 2026-10-31.
- **Edge dependency security** — upgraded the pinned Go toolchain and builder to
  1.25.12 for GO-2026-5856, and `golang.org/x/text` to v0.39.0 for
  GO-2026-5970. The related `x/sync` indirect dependency moves to v0.21.0.

### Added

- **Traceable financial cycles** — added an optional cycle-closing workflow that
  generates both a passphrase-protected, restorable backup and a readable XLSX
  statement before reset can be confirmed. Closed-cycle receipts remain visible,
  while vault credentials, currency, exchange rates, and preferences carry into
  the new cycle.
- **Financial literacy help** — expanded the bilingual Help Center with plain-language
  explanations of income, expenses, balances, cash flow, positive/negative amounts,
  and month-over-month comparisons without adding guidance clutter to the dashboard.
- **Managed AI adapters** — aligned the edge with the active provider contract:
  OpenRouter Free and Gemini 3.6 Flash, with an optional DeepSeek V4 Flash
  adapter and tested cross-provider fallback. Removed the prohibited NVIDIA
  hosted adapter and obsolete managed OpenAI path.
- **PWA update prompt** — added a Sonner-powered update notification so refreshed
  service-worker builds can prompt the user instead of silently racing a reload.
- **Device unlock setup** — added explicit local WebAuthn credential registration,
  PRF capability verification, passphrase-only fallback, and a Chrome CTAP2 smoke
  test covering wrapped-key persistence and unlock after reload.
- **Global action feedback** — added localized success/error feedback across BYO
  key settings, budgets, export/import, goals, and recurring management flows.
- **Event-sourced management actions** — wired state-management actions through the
  financial-state event pipeline with tests for domain and pillar behavior,
  including recurring-item archival and projection removal.
- **Dettes & Créances** — added an event-sourced planning surface for receivables
  and debts with debtor/creditor name, motive, amount, date, status updates, and
  reminders for unsettled receivables.

### Fixed

- **Session-safe PWA updates** — defers service-worker activation and reload while
  the private vault is open, preventing an in-app update from unexpectedly returning
  the user to the locked shell and requiring the passphrase again.
- **Money-movement semantics** — aligned income and expense arrow directions across
  Capture and Dashboard so incoming money points down into the account and outgoing
  money points up out of it.
- **Financial projections** — made event replay deterministic for equal timestamps,
  fixed historical period boundaries and stale snapshots, applied transaction
  updates/deletions correctly, excluded validly archived accounts from current
  totals, and keeps legacy invalid archives visible for user recovery.
- **Concurrent mutations** — rejects writes validated against an outdated journal
  tail, refreshes UI queries after failed or cross-tab mutations, and prevents
  duplicate same-day realisation of a recurring item. Cross-tab invalidation also
  covers encrypted base-currency changes.
- **Budgets, recurrence, and currencies** — limited category totals to expenses,
  corrected recurring catch-up and anchor dates, converted aggregates into the
  selected base currency, and added exact half-even conversion for ISO currency
  fraction digits (including XOF, JPY, and KWD).
- **Import and export** — validates encrypted backup envelopes and event types,
  restores atomically without destroying prior vault metadata on failure, exports
  version 2 backups with base-currency and custom-FX settings, retains version 1
  import and legacy encrypted-envelope compatibility, uses compact Base64 encrypted
  envelopes, emits a real OOXML XLSX workbook, and protects CSV output from
  spreadsheet-formula injection.
- **Journal performance** — indexes replayed transactions by id, narrows budget
  aggregation by category, and applies decrypted history in bounded batches.
- **Monetary integrity** — rejects balance, goal, transfer, and projection arithmetic
  outside JavaScript's safe-integer range, and prevents edits or deletions that
  would recreate hidden balances on archived accounts.
- **Session and AI data flow** — made refresh persistence race-safe, scoped query
  caches to the unlocked vault, separated conversational prompts from financial
  context, fixed BYO provider fallback, and built AI context from active
  transactions with real month-over-month trends. Added an explicit vault lock
  action that drops the master key, access token, and decrypted query cache while
  retaining only the sealed refresh token for restoration after unlock.
- **Client protocol validation** — rejects malformed successful auth and AI edge
  responses before they can enter session state, and bounds browser requests to
  the edge and direct BYO providers with 30-second abort signals.
- **International interface** — connected dashboard, budget, goal, recurring, and
  provider-key surfaces to the English/French resources and removed stale
  single-provider labels from the multi-provider assistant.
- **Managed egress** — removed the unused consent-assertion endpoint and secret;
  every managed request now has one non-elevatable aggregate-only schema.
- **Edge resource bounds** — added per-provider attempt deadlines, immediate
  cancellation of fallback after client disconnect, startup and header timeouts,
  strict JWT/Argon2 configuration bounds, and explicit trusted-proxy IP handling.
- **Sensitive buffer lifetime** — zeroes plaintext event, snapshot, FX-rate,
  refresh-token, export, provider-key, master-key, and WebAuthn PRF byte buffers
  in success and failure paths after their final cryptographic use.
- **Encrypted financial settings** — moved the base currency out of plaintext
  `localStorage` into the AES-GCM-sealed `appSettings` store, added automatic
  legacy migration, and restores backup currency plus FX rates atomically.
- **Transfer projection** — retained transfer date and motive in the derived state
  and exposed transfers in the dashboard history without counting internal moves
  as income or expense.
- **Transaction lifecycle** — exposed event-sourced transaction editing and deletion
  from the current dashboard, preserving note, tags, and merchant fields while
  invalidating all affected financial queries.
- **Recurring schedules and import integrity** — kept monthly/yearly schedules
  anchored to their original start date after late realisation, and reject imports
  that write incompatible currencies or mutate archived entities.
- **Edge memory bounds** — periodically evicts inactive per-user rate-limit buckets
  and validates positive rate-limit configuration.
- **PWA assets and refresh flow** — refreshed app icons, added `workbox-window`, and
  fixed the update-handler reload race, SPA deep-link fallback, manifest metadata,
  service-worker cleanup, and route-level loading.
- **Responsive web UI** — constrained the account form on small screens and
  stabilized dropdown behavior inside dialogs.
- **Capture flow** — added action feedback and fixed event-sourced state updates
  from capture interactions.

### Changed

- **Adaptive financial workflows** — Dashboard now focuses new users on account
  creation or their first transaction before revealing analytics; Capture surfaces
  missing prerequisites as direct actions; Assistant consolidates unavailable-AI
  guidance; and Planning and Settings use denser, better-constrained layouts.
- **Dashboard information hierarchy** — separated globally available money from
  monthly activity, clarified received/spent/difference relationships, scoped
  transaction filters to the transaction list, and removed redundant explanatory
  copy and competing card subtitles.
- **Dashboard welcome and period control** — replaced the large bordered month header
  with an open greeting area and compact month switcher. Greetings follow the time
  of day, rotate predictably once per day, and remain fully localized; the year only
  appears when viewing a different year.
- **Public docs** — updated the root README status/run instructions and rewrote
  `SECURITY.md` for public readability.
- **Production defaults** — new local vaults default to XOF; forms and summaries
  now use the selected base or account currency instead of assuming USD.

### Security

- **Managed edge hardening** — added per-IP and per-account auth attempt limits,
  atomic refresh-token rotation and an exact
  aggregate-only schema for redacted AI egress.
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

- **AI orchestration — managed path** — `submit` attaches the in-memory access JWT
  (`Bearer`) and calls `/v1/ai/proxy` with an aggregate-only payload. 401 triggers
  one session refresh and retry; 503 returns `ProviderUnavailableSignal`; 200 is
  normalized. BYO mode calls configured providers directly and may use explicitly
  consented full context.
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
  Argon2 params) and pinned JWT to HS256. Refresh rotation is transactional so concurrent
  reuse cannot create parallel token lineages.
- **Client crypto foundation** — `crypto/envelope.ts` (AES-GCM-256 seal/open, unique
  96-bit IV) and `crypto/keyManagement.ts` (Argon2id master-key derivation via hash-wasm,
  passphrase verification, BYO key seal/open, WebAuthn-PRF master-key wrap/unwrap). Keys
  imported non-extractable, `encrypt`/`decrypt` usages only; raw key bytes zeroed after use
  (INV-KEY-02/03). Dexie schema → **v2** (`keyMeta.wrappedIv`). Mishmar review PASS-WITH-NITS.
- **Edge aggregate gate on `POST /v1/ai/proxy`** — validates the exact managed
  aggregate schema and rejects full-only fields. No client header or assertion can
  elevate a managed request to full egress.
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
