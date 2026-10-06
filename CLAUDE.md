# WiseMoney — Project State

> Seeded by `/mishkan-init`; refreshed as the implementation moves. This is the
> lean, dynamic project state artifact.
> It loads after the user-level harness identity and is injected last (after the
> cached static prefix) so sprint state stays at the end of context.

## Project

- **Name:** WiseMoney
- **What:** Local-first personal-finance PWA (mobile-first) on three equal pillars —
  Financial State (tracking), Financial Intelligence (multi-model AI guidance),
  Financial Literacy (conversational learning). Surfaces: Dashboard, Capture, Assistant.
- **Current hosting:** Web app is live at `https://wisemoney.y7labs.studio/`
  through Vercel. Go edge/Postgres are not deployed yet; use local Docker Compose
  for managed-mode edge development.
- **Stack:** React + TypeScript PWA (Vite · service worker · Dexie/IndexedDB · Web
  Crypto AES-GCM · client-side event-sourcing) — **all domain logic is client-side**.
  Thin **Go** managed edge (net/http+chi · golang-jwt · x/crypto/argon2) doing
  auth → rate-limit → AI provider routing/fan-out/fallback → response normalization.
  **Postgres** (auth + rate-limit metadata only — never financial data). Docker
  Compose, pinned, distroless Go image. BYO-key mode bypasses the edge entirely.
- **Cognee namespace:** wisemoney
- **Initialised:** 2026-06-02

## Design artifacts (in `docs/`)

- `docs/PRD.md` — product requirements
- `docs/SRS.md` — software requirements (MVP cut; FR-AUTH; Gate-5 additions)
- `docs/CONTRACT.md` — invariants + guarantees (INV-EGR-03 mode-split amended)
- `docs/ARCHITECTURE.md` — system architecture
- `docs/THREAT_MODEL.md` — STRIDE security threat model
- `docs/diagrams/C4/` — C4 diagrams (Context / Container / Component)
- `docs/adr/` — architecture decision records (ADR-0001…0013)
- `docs/literacy/course-v1.md` — literacy course: 77 lessons and their sources; `evidence-v1.md`
  traces each claim; research logs in `docs/research/2026-10-03-*.md`
- `docs/api/learn.openapi.yaml` — literacy tutor gateway contract
- `docs/runbooks/` — operational runbooks (mixed: active local procedures +
  pre-production outlines)
- `docs/intake/intent-v0.1.md` — source intent + full decision log (locked + Gate-1…5)

## Current Phase

- **Phase:** Active MVP implementation
- **Milestone:** S0 specification baseline is complete; web and edge implementation
  are underway with CI correctness and dependency-security gates in place.
- **Mode:** execution

### Current Implementation Snapshot

- **Web app:** React 18 + TypeScript PWA. Three-tab IA (Home · Activity · Plan) with a
  centre capture button that opens an amount-first sheet; Settings in the header;
  Assistant reached from Settings and a Home card once a provider is usable. The header holds
  reminders, help (opens WiseBot) and Settings. Routes:
  `/`, `/operations`, `/planning` (+ `/budgets`, `/goals`, `/planned-expenses`,
  `/recurring`, `/debts`), `/assistant`, `/learn`, `/settings`, `/help`, `/updates`, all app
  routes under the pathless `_vault` layout. Home shows one viewport (summary, one
  attention card, five recent movements) with the rest under a fold. Local
  financial-state flows are event-sourced and covered by domain/pillar tests.
- **Client data/security:** Dexie-backed local persistence, AES-GCM envelope
  helpers, passphrase key management with device unlock (WebAuthn PRF) enabled
  after setup from Settings › Security, sealed refresh-token session store, BYO-key
  settings, import/export, and consent/redaction modules. First run: landing →
  passphrase (show toggle, plain guidance) → three-step first session (currency and account
  accepted as they are, first movement, one plan or "Later"). The landing page loads
  without the vault, storage or app code; one locale per visit.
- **Literacy:** `/learn` ("Éducation financière") is a conversation with a tutor on Gemma through
  `api/learn` (closed schema, zero vault egress, own consent, optional web search). The 77 bilingual
  lessons (`apps/web/content/literacy/`, built by `tools/literacy/assemble.py`, written only from cited
  sources) are its knowledge base on the server, retrieved by `gemini-embedding-001` vectors
  (`tools/literacy/embed.mjs`, measured on 55 labelled questions in `api/learn/_retrievalEval.ts`); keyword
  search is the fallback. No lessons on the phone: the tutor needs a connection.
- **AI orchestration:** Managed path attaches Bearer auth, `X-Egress-Level`,
  `X-Feature`, and full-consent assertions when available; assertion failures
  downgrade to redacted payloads. BYO direct-provider path remains a future slice.
- **Edge:** Go 1.25.13 service with auth register/login/refresh, Argon2id PHC
  password hashing, HS256 JWTs, refresh-token rotation/reuse detection, consent
  assertion endpoint, managed proxy gate, payload caps, middleware, provider router,
  and Postgres migrations.
- **PWA/UI:** Service-worker update prompt, refreshed app icons, localized action
  feedback, responsive account form fixes, and stabilized dropdowns in dialogs.
- **CI:** `.github/workflows/verify.yml` runs web typecheck/lint/test and edge
  build/vet/test. `.github/workflows/security-scan.yml` runs pinned osv-scanner
  manifest scans; its binary scan activates when a compiled `dist/edge` artifact is
  present in that workflow.
- **Hosting:** Web is live at `https://wisemoney.y7labs.studio/` on Vercel.
  Edge/Postgres deployment is pending; current managed-mode backend operation is
  local/dev Docker Compose only.

### Recently Closed

- S0 design baseline and ADRs through ADR-0012.
- Dependency audit baseline and GitHub Actions security scan.
- Client crypto foundation and auth-session module.
- Edge auth completion and consent gate on `/v1/ai/proxy`.
- Managed AI orchestration path with redacted downgrade safety.
- Changelog and documentation freshness pass for stale S0/workflow language.
- UX simplification Phases 0–4 (2026-09-24, local commits on `main`): navigation
  unification, instant capture sheet, one-step onboarding, three-tab IA, Home first
  viewport, Plan sections, radius scale, vocabulary sweep, import-boundary lint
  (`docs/plans/ux-simplification-implementation.md`).
- Required first session with a locale-guessed currency step, WiseBot panel rework
  (2026-09-26, `docs/plans/first-session-wisebot-literacy.md` Tracks 1–2).
- UX audit 2026-10, blocks A and B (2026-10-05, `docs/designs/ux-audit-2026-10.md`): landing
  download 375 → 169 KB, first run 20 → 11 taps, coach tip bound to its page, balance as the
  Home hero, one money format, one focus ring, AA field borders, help topics rewritten.
  Block C the same day: three header controls with WiseBot behind the help button, Settings as
  a list with one screen per section (`?panel=<id>`), titles on the page, Plan as one list,
  edit and delete from Activity, restore link on the landing page, lessons in a sheet and
  linked from Plan (`/learn?unit=<id>`).

### Tracked Follow-Ups

- Wire CI binary scan to a real compiled edge artifact or keep running the local
  binary scan before release.
- Choose and deploy the Go edge/Postgres hosting target, then point Vercel
  `VITE_EDGE_BASE_URL` at the deployed edge.
- Add production CORS/security headers and PWA CSP before staging/production.
- Add auth-route rate limiting before login is exposed to real users.
- Replace ad hoc logging with structured logging before production.
- Implement transaction-backed refresh rotation to close the concurrent
  double-issuance race.
- Add Postgres-backed integration tests for edge handlers.
- Implement BYO direct-provider orchestration.
- Server functions run on Node 20 (root `engines`), which is past end of life; move to a
  current LTS as its own change. Add a post-deploy probe of `/api/help` and `/api/learn`.
- Literacy course v1: local expert review before removing the "not yet reviewed" line; get the
  two Burkinabè booklets from their official publishers; ask brokers for fee grids.
- Landing page pass ("premium" look) — Phase 5 of the UX plan, design proposal first.
- After the UX audit: a test with five real users and a run on a real low-end Android phone;
  currency listbox keyboard model; chart text alternative (its data points are the only
  targets left under 44 px).

### Blockers

<!-- raised by any agent; Mishmar flags carry highest priority -->
- None blocking development. (T-S0-02 verified + strategy decided (ADR-0011); residual
  *launch*-gate is now only managed full-egress, which is deferred — so not blocking MVP.)

### Open flags

- **[Mishmar — accepted residual]** Full-egress sends raw financial PII to third-party
  AI providers; provider-side retention is irreducibly outside user control once it
  egresses. Mitigated by per-feature consent + redacted-default + disclosure; residual
  accepted by design. (THREAT_MODEL headline; ADR-0001.)
- **[Mishmar]** Consent state lives in localStorage (unencrypted, user-clearable);
  egress enforcement must be server-boundary in managed mode (structural payload cap
  + signed consent assertion, FR-AUTH-06) and is client-side/user-as-principal in
  BYO-key mode (INV-EGR-03 amended). (ADR-0008.)
- **[Mishmar — MODELING residual]** IndexedDB plaintext index keys (timestamps,
  event types, entity-ref counts, period structure) leak *activity timing and volume*
  to an adversary with device read access — never amounts or merchant detail. Accepted
  trade-off for offline-first queryability; fold into THREAT_MODEL on next revision.
- **[Product]** Personas: Overwhelmed Tracker is the sole MVP primary; the other two
  are secondary/future and remain unvalidated.
- **[Scope]** Multi-currency, multi-provider, encrypted export, and a multi-tenant
  hosted proxy are all in MVP — heavier than a minimal build; chosen deliberately.

---

*Updated at implementation milestones. Historical S0 task detail lives in git history
and the dated design artifacts.*
