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
- `docs/adr/` — architecture decision records (ADR-0001…0012)
- `docs/runbooks/` — operational runbooks (mixed: active local procedures +
  pre-production outlines)
- `docs/intake/intent-v0.1.md` — source intent + full decision log (locked + Gate-1…5)

## Current Phase

- **Phase:** Active MVP implementation
- **Milestone:** S0 specification baseline is complete; web and edge implementation
  are underway with CI correctness and dependency-security gates in place.
- **Mode:** execution

### Current Implementation Snapshot

- **Web app:** React 18 + TypeScript PWA with TanStack Router routes for dashboard,
  capture, assistant, budgets, goals, recurring, planning, and settings. Local
  financial-state flows are event-sourced and covered by domain/pillar tests.
- **Client data/security:** Dexie-backed local persistence, AES-GCM envelope
  helpers, passphrase/WebAuthn key-management foundation, sealed refresh-token
  session store, BYO-key settings, import/export, and consent/redaction modules.
- **AI orchestration:** Managed path attaches Bearer auth, `X-Egress-Level`,
  `X-Feature`, and full-consent assertions when available; assertion failures
  downgrade to redacted payloads. BYO direct-provider path remains a future slice.
- **Edge:** Go 1.25.11 service with auth register/login/refresh, Argon2id PHC
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
