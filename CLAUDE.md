# WiseMoney — Project State

> Seeded by `/mishkan-init`. This is the lean, dynamic project state artifact.
> It loads after the user-level harness identity and is injected last (after the
> cached static prefix) so sprint state stays at the end of context.

## Project

- **Name:** WiseMoney
- **What:** Local-first personal-finance PWA (mobile-first) on three equal pillars —
  Financial State (tracking), Financial Intelligence (multi-model AI guidance),
  Financial Literacy (conversational learning). Surfaces: Dashboard, Capture, Assistant.
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
- `docs/adr/` — architecture decision records (ADR-0001…0009)
- `docs/runbooks/` — operational runbooks (stubs)
- `docs/intake/intent-v0.1.md` — source intent + full decision log (locked + Gate-1…5)

## Current sprint

- **Sprint:** S0
- **Milestone:** Initialisation complete — specification baseline (PRD → SRS →
  CONTRACT → ARCHITECTURE → THREAT_MODEL → C4 → docs) established and internally
  consistent.
- **Mode:** execution

### Tasks

<!-- maintained by Nehemiah; conforms to sprint-state.schema.json -->
- **T-S0-01** — MODELING (*done*): UML set in `docs/diagrams/UML/` + persistence
  schema in `docs/modeling/data-model.md` (IndexedDB/Dexie stores + encryption
  boundary, Postgres `users`/`refresh_tokens`, migrations DESIGNED not executed).
  Refinements: added `goal_contribution_recorded` event type (INV-EVT-04); rate-limit
  reconciled to in-memory (Gate-4 #20). Money = integer minor units + ISO-4217.
  *Carry-forward (implementation-time):* DQ-01 projection-staleness rebuild strategy;
  DQ-02 atomic key-rotation. (DQ-03 export format — resolved: decrypted portable JSON;
  encrypted variant = passphrase-wrapped; keyMeta + BYO keys excluded from plaintext.)
- **T-S0-02** — Verify and link AI provider data-handling terms (Gemini · NVIDIA
  NIM · OpenAI): retention + model-training opt-out. **Launch-blocker** (Gate-5
  decision 28; `docs/runbooks/provider-terms-verification.md`). Ops/legal.
- **T-S0-03** — Scaffold (*done*): `apps/web` (React/TS PWA, 27 files) + `services/edge`
  (Go, 22 files) + root contract (compose, env, README, SECURITY). Pinned, idiomatic,
  typed stubs citing FR/INV; **no installs/builds run** — run sequence in `README.md`.
  *Follow-ups:* `/dep-audit` before `pnpm install` (frontend added `@tanstack/react-query`
  + `@tanstack/react-router` beyond the zustand brief). **Routing lib DECIDED 2026-06-03:**
  TanStack Router confirmed/kept (Y4NN) — aligns with Panim rule; no `react-router` present.
- **T-S0-04** — `/dep-audit` (*done 2026-06-03*): cleared 2 CVSS-9.8 finds + more.
  Edge: pgx 5.7.4→5.9.2 (CVE-2026-33816), x/crypto 0.38.0→0.52.0 (argon2 path),
  chi 5.2.1→5.2.4, Go 1.23→1.25.11 (`toolchain` directive + Dockerfile, clears 51 stdlib).
  Frontend: vite→^7.3.5 / vitest→^4.1.8 (9.8) / plugin-react→^5.2.0 / vite-plugin-pwa→^1.3.0;
  Vite-7 target for portfolio alignment. osv-scanner v2.3.8 → both surfaces clean.
  Added `GOTOOLCHAIN=local`, `.github/workflows/security-scan.yml` (GitHub Actions —
  repo is GitHub-hosted; project override of the Migdal GitLab default), ADR-0010, scanning
  runbook, CHANGELOG. *Carry-forward (Migdal):* wire the edge **build stage** so the CI
  **binary-scan** gate (`osv-scanner scan binary`, authoritative) activates — currently
  guarded by `exists: dist/edge`; confirm `EDGE_BINARY_PATH` when build lands. **Y4NN runs
  `go mod tidy` (done) + commits; no installs/deploys by AI.**
- **T-S0-05** — Consent gate on `/v1/ai/proxy` (*done 2026-06-03*): `consentSvc.Verify`
  wired into the proxy handler (Hizkiah); fail-closed→redacted on any verify failure, then
  structural cap (`egress.Validator`) yields 400 on full-only fields. Feature transport pinned:
  **`X-Feature` header** (ARCHITECTURE §10a amended). 10 gate tests pass (build+vet+test via
  golang:1.25.11 container); Uriah QA **PASS** — no bypass path, JWT-sub sole identity, no
  payload logged. *Client carry-forward:* `apps/web/src/ai/orchestration.ts` managed path must
  attach `X-Feature` + `X-Consent-Assertion` when implemented (still a stub).
- **Consent-assertion wire shape — PINNED** (ARCHITECTURE §10a): HMAC-SHA256, dedicated
  `CONSENT_SIGNING_KEY` (must differ from JWT key), `user_id`/`feature`/`level`/`exp`(~5m),
  `X-Consent-Assertion` + `X-Feature` headers, fail-closed→redacted. Wired end-to-end on the
  edge (config/consent/egress/proxy/router). Nonce-replay denylist deferred (short TTL; §10a).

### Blockers

<!-- raised by any agent; Mishmar flags carry highest priority -->
- None blocking development. (T-S0-02 is a *launch*-blocker, not a dev-blocker.)

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

*Updated at milestones by Nehemiah. Mirrored to Cognee. Restored by `/mishkan-resume`.*
