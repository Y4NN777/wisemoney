# WiseMoney — Architecture

| Field   | Value                                                        |
| ------- | ------------------------------------------------------------ |
| Title   | WiseMoney — Architecture                                 |
| Date    | 2026-06-02                                                   |
| Version | ARCHITECTURE v0.1                                            |
| Status  | Draft                                                        |
| Owners  | Bezalel (CTO) · Nathan (software architecture)               |
| Source  | PRD v0.1; SRS v0.1 Rev 2026-06-02; CONTRACT v0.1             |

> This document states **how** WiseMoney is structured: components, data
> flows, and the decisions that bind implementation. It does not own the
> adversarial security analysis (THREAT_MODEL, Benaiah) nor the formal C4 diagrams
> (Meshullam) — both follow this document. Where this architecture surfaces a
> security seam, it marks the seam and hands the resolution to the THREAT_MODEL.
>
> It honours every CONTRACT invariant. Where an approved Gate-4 stack choice meets
> an invariant, the invariant wins and the choice is implemented to satisfy it.

---

## 1. Architectural overview & principles

WiseMoney is a **client-heavy / thin-edge** system. Essentially all domain and
business logic lives in the **client** — a React + TypeScript PWA. The **backend**
is a thin, stateless Go edge whose only jobs are to authenticate managed-mode
users, rate-limit them, and proxy AI requests to providers. The backend holds **no
financial or domain logic** (Gate-4 decision 16). Postgres backs the edge with
users/auth and rate-limit metadata only — **never financial data**.

This split is the spine of the architecture and is what lets the product keep its
local-first promise: the entire Financial State pillar — capture, snapshot
derivation, balances, budgets, goals, recurring projections, FX conversion — runs
on-device with no server in the loop (INV-PERS-01, INV-PERS-05). The server exists
solely to hold provider keys the user has chosen not to hold themselves.

**Guiding principles (mapped to NFR-MOD):**

- **Pillars are independent modules (NFR-MOD-01).** Financial State, Financial
  Intelligence, and Financial Literacy are bounded modules. The State pillar has
  **zero dependency** on the AI pillar — an AI-layer failure must not break State,
  capture, or the dashboard (INV-PROXY-04).
- **AI is decoupled from UI (NFR-MOD-02).** UI surfaces never call provider SDKs.
  They talk to an internal AI-orchestration interface; the provider/transport
  detail (managed proxy vs BYO direct) is hidden behind it.
- **Consent is an isolated subsystem (NFR-MOD-03).** No feature module reads or
  writes consent state directly. All consent reads/writes go through the consent
  subsystem, which is the single point that shapes any egress context.
- **Local-first is the default, cloud is opt-in.** Managed mode introduces a cloud
  dependency; BYO-key mode has none (INV-AUTH-05).
- **Money is integer minor units everywhere.** Floats are forbidden for monetary
  amounts at every boundary (INV-MON-01). This is an architectural constraint on
  every module that touches money.

---

## 2. Component decomposition

### 2.1 Client (the PWA — holds all domain logic)

- **Event Store** — append-only `FinancialEvent` log persisted in IndexedDB via
  Dexie. The single source of truth (INV-EVT-01). Encrypted at rest (§7).
- **FinancialState Engine** — replays the event log into the current snapshot,
  maintains a cached snapshot for fast reads, and recomputes derived metrics
  (balances, cash flow, category totals, budget progress, goal progress, recurring
  projections). Replay is authoritative; the cache is an optimisation (INV-EVT-02).
- **Domain pillars (three bounded modules):**
  - **Financial State** — accounts, transactions, categories, budgets, goals,
    recurring items, timeline. The reality layer; no AI dependency.
  - **Financial Intelligence** — insight, recommendation, prediction, behavioural
    pattern detection. Consumes State; produces guidance via the AI orchestration
    client. Decoupled — its failure degrades gracefully (INV-PROXY-04).
  - **Financial Literacy** — conversational learning, contextual learning
    injection, concept library. Consumes State + the Assistant surface.
- **AI Context Builder** — transforms the snapshot + a time-windowed event slice
  into a structured context for AI submission (FR-DE-06/07). It **always** routes
  its output through the consent subsystem before any egress; it never emits a
  context directly to a transport.
- **Consent & Redaction Subsystem** — the sole owner of consent state
  (localStorage) and the sole producer of egress-shaped contexts. Given a feature
  + the requested egress level, it returns either a full context (only if
  per-feature full-egress consent is granted, INV-EGR-02) or a redacted context
  capped at the FR-CONSENT-07 / INV-EGR-01 ceiling. No other module may shape an
  egress payload.
- **Crypto / Key-Management Module** — Argon2id KDF, AES-GCM encrypt/decrypt for
  the IndexedDB store, WebAuthn-wrapped daily unlock, and storage of BYO provider
  keys encrypted at rest (§7, INV-KEY-02/03, INV-PERS-02).
- **Export / Import Module** — JSON (lossless, restore-capable, INV-PERS-03),
  CSV + XLSX (human-readable secondaries, never restore formats, INV-PERS-04).
- **Three UI surfaces** — **Dashboard** (State snapshot), **Capture** (fast entry,
  offline-first), **Assistant** (chat: guidance + learning).

### 2.2 Backend (the Go edge — thin, stateless, no domain logic)

- **Auth Service** — email+password registration/login, Argon2id password hashing
  (INV-AUTH-02), JWT issuance/rotation/validation (INV-AUTH-03), password reset.
- **Rate-Limiter** — per-user token-bucket, in-memory for the current scale
  (tens–hundreds); Redis is the documented scale-out path (§12). Enforces
  per-user isolation at the limiting layer (INV-AUTH-04).
- **Request Router** — authenticates → rate-limits → selects provider/model for the
  task type → dispatches. Owns concurrent fan-out and cross-provider fallback.
- **Provider-Adapter Layer** — one adapter per provider (Gemini, NVIDIA NIM,
  OpenAI), each translating the internal request into the provider's API and back.
  Adding a provider is adding an adapter + routing config — no cross-cutting change
  (FR-AIORCH-01, INV-PROXY-03).
- **Response Normalizer** — collapses every provider response into one internal
  shape before it returns to the client (INV-PROXY-03). No feature depends on a
  provider-specific format.

The edge persists **only** auth + rate-limit state in Postgres. It never persists
transaction payloads, financial context, or AI responses (INV-PROXY-01).

---

## 3. Key data flows

Prose + simple diagrams here; the formal C4 is Meshullam's next step.

**(a) Capture → event append → snapshot update (offline).**
```
User → Capture surface → State module → Event Store (append, encrypted)
                                       → FinancialState Engine (update cached snapshot)
                                       → Dashboard reflects new state
```
Entirely on-device. No network. Succeeds offline (INV-PERS-01, FR-UI-02).

**(b) Dashboard read.**
```
Dashboard → FinancialState Engine → cached snapshot (fast path)
                                   (replay from Event Store if cache absent/suspect)
```
Read is local and offline-capable (INV-PERS-01). Cache divergence resolves to
replay (INV-EVT-02).

**(c) Managed-mode AI request.**
```
Feature → AI Context Builder → Consent Subsystem (shape per consent)
        → AI Orchestration client → [network] → Go edge:
            authenticate (JWT) → rate-limit → route → provider adapter → provider
            → normalize response → [network] → client → feature renders
```
The Go edge is a real boundary here. It holds the provider key; the client never
sees it (INV-KEY-01).

**(d) BYO-key AI request.**
```
Feature → AI Context Builder → Consent Subsystem (shape per consent)
        → AI Orchestration client → [network] → provider directly (BYO key)
        → response → client → feature renders
```
**The proxy is bypassed entirely.** No auth, no cloud dependency (INV-AUTH-05).
The BYO key is decrypted in-memory, used for the call, never sent to the edge
(INV-KEY-02). Note the egress-enforcement consequence in §11.

---

## 4. Event-sourcing design

- **Append-only log in IndexedDB.** Every state-changing action is a
  `FinancialEvent` appended to the log and never mutated or deleted (INV-EVT-01).
  Edits and deletes of user-visible entities are themselves new events
  (`transaction_updated`, `transaction_deleted`) — the log only grows.
- **Snapshot derivation + caching.** The FinancialState Engine folds the event log
  into a snapshot. A cached snapshot serves reads in normal operation; on cold
  start, cache miss, or any integrity doubt, the engine replays from inception
  (INV-EVT-02). **Replay wins**: if cache and replay disagree, replay is correct.
- **Referential integrity, maintained client-side.** At append time the State
  module validates that a transaction event names an existing Account ID and
  Category ID, and a budget names an existing Category ID (INV-EVT-03). IDs are
  stable identifiers — renames do not change them. Goal accumulated amounts derive
  **only** from contribution events (INV-EVT-04); no path sets a goal total
  directly. Recurring projections are derived data — a projection never writes to
  the log; an occurrence becomes an event only when the user realises it as a
  Transaction (INV-EVT-05).
- **Sync-readiness.** The append-only log with stable IDs is the substrate a
  Post-MVP sync layer would build on (FR-PERSIST-07). Sync is **not** built now.

---

## 5. FX-rate sourcing (resolved — CONTRACT deferred this here)

The CONTRACT bound the invariants (offline-first INV-MON-03, non-mutation
INV-MON-04, banker's rounding INV-MON-05) and left the mechanism to architecture.
Resolved mechanism:

- **A locally-cached, user-editable rate table is the sole conversion source.**
  It lives **on-device**, inside the encrypted IndexedDB store (the same encrypted
  store as financial data, INV-PERS-02), keyed by `(base, quote)` currency pair.
  Each entry carries the rate and a `lastUpdated` timestamp.
- **Conversions always read from this cached table — never a live call.** Every
  conversion site (dashboard aggregates, multi-currency totals) reads the cached
  rate. Offline and online produce identical derived totals given identical cached
  rates (INV-MON-03). This is non-negotiable: there is no code path where a
  conversion awaits a network response.
- **Optional best-effort refresh when online.** When connectivity exists, the user
  may trigger (or the app may opportunistically offer) a refresh from a rate source
  that **writes new values into the cached table**. A refresh is a write to the
  cache, never a dependency of a conversion. If the refresh fails or the device is
  offline, conversions continue against existing cached rates unaffected. The
  concrete rate provider is a deferred, swappable detail (it sits behind a small
  adapter); the architecture binds only that refresh is best-effort and decoupled
  from conversion.
- **Rates are user-editable.** The user can manually set or correct any rate. This
  is the floor capability that guarantees the product works with zero online rate
  access (manual-only is a valid steady state).
- **Staleness is surfaced, never silently trusted.** Each conversion display can
  reference the `lastUpdated` of the rates it used; the UI surfaces staleness
  (e.g. "rates last updated N days ago") so the user knows derived totals rest on
  possibly-old rates. Staleness is informational — it never blocks a conversion.
- **Rounding.** Conversion rounds **half-even (banker's rounding)** to the target
  currency's minor unit, applied uniformly at every conversion site (INV-MON-05).
  Conversion is display/derivation only; stored source amounts are never mutated
  (INV-MON-04).

---

## 6. CQ-01 resolved — account currency immutable from creation

**Resolution: an Account's currency is immutable from creation, with no zero-event
exception.** The currency is chosen at account-creation time and can never change
thereafter — not even before the first transaction.

**Why.** The CONTRACT default (INV-MON-02) already fixes currency after the first
event; the only open question was the zero-event window. Making currency immutable
from creation is the simpler, safer rule: (1) it removes a stateful special case
("is this account still mutable?") that every currency-touching code path would
otherwise have to check; (2) it eliminates a subtle correctness trap where a
budget, goal, or recurring item attached to a freshly-created account could be
silently invalidated by a currency change; (3) "I picked the wrong currency" is
cleanly served by deleting the just-created (empty) account and creating a new one
— no data exists to lose. The marginal convenience of in-place correction is not
worth a mutable-currency code path. Immutable-from-creation it is.

---

## 7. Hybrid key-management flow

The encryption key is **hybrid** (Gate-4 decision 19): a passphrase derives the
master key; day-to-day unlock is via WebAuthn/biometric.

```
Setup:
  passphrase ──Argon2id(KDF: salt, memory, iterations, parallelism)──▶ master key (in memory)
  master key ──AES-GCM──▶ encrypts the IndexedDB financial store + BYO key material

Daily unlock:
  WebAuthn / biometric ──unwraps──▶ a stored wrapped copy of the master key ──▶ master key (in memory)

Recovery:
  passphrase is the root of trust. Lose it ⇒ data is unrecoverable by design.
  The recovery path is the lossless JSON export (re-import into a fresh setup).
```

- **Argon2id KDF parameters** (salt + tuned memory/iteration/parallelism cost) are
  recorded alongside the encrypted store so the master key can be re-derived from
  the passphrase on any device the export is restored to. The passphrase itself is
  never stored.
- **AES-GCM** (Web Crypto) encrypts the store; all financial data and key material
  are encrypted at rest at all times (INV-PERS-02, INV-KEY-03).
- **WebAuthn-wrapped daily unlock.** After first setup, the master key is wrapped
  for convenient biometric unlock so the user is not retyping the passphrase every
  session. The passphrase remains the recovery root; WebAuthn is a convenience
  layer over it, not a replacement for it.
- **Recovery is the JSON export.** Because losing the passphrase loses the data,
  the lossless JSON export (INV-PERS-03) is the explicit, documented recovery
  mechanism. The architecture must make exporting easy and must communicate that it
  is the only backstop. *(The user-facing strength of this — passphrase entropy,
  export cadence prompts, the irreversibility warning — is a UX + threat-model
  concern; the architecture fixes the mechanism.)*

---

## 8. Auth architecture (managed proxy)

Applies **only** to managed mode. BYO-key mode has no auth and no account
(INV-AUTH-05).

```
Register/login: email + password
  password ──Argon2id(salt)──▶ hash, stored in Postgres (INV-AUTH-02; never plaintext)
  on success ──▶ issue JWT (server-signed, expiry) + refresh token
Each proxied request:
  client presents JWT ──▶ edge validates signature + expiry (INV-AUTH-03)
  invalid/absent ⇒ reject (INV-AUTH-01: no unauthenticated path)
  valid ⇒ attribute to user identity ──▶ per-user rate-limit + routing (INV-AUTH-04)
Refresh: short-lived access JWT + refresh token rotation (detail → THREAT_MODEL)
```

- **Per-user isolation (INV-AUTH-04)** holds at routing and rate-limiting: a user's
  JWT scopes their request to their own rate budget and their own provider routing;
  no shared anonymous pool exists.
- **Signing key is server-only (INV-AUTH-03)** — never transmitted to any client.
- **BYO-key path needs no auth (INV-AUTH-05)** — it never contacts the edge.

> The auth **mechanism** is fixed (email+password → Argon2id → self-managed JWT,
> Gate-3 decision 13, closing SRS OQ-06). Brute-force defenses, refresh-token
> rotation policy, password-reset flow hardening, and JWT lifetime tuning are
> adversarial-design detail **owned by the THREAT_MODEL (Benaiah)**.

---

## 9. AI orchestration

- **Task-type routing.** Four task types map to provider/model choices via an
  **operator-configurable routing config** (FR-AIORCH-03), no code change to
  re-route:
  - *Reasoning* (recommendations, risk, projection) → strong-reasoning model.
  - *Classification* (categorization, pattern detection) → lightweight/fast model.
  - *Teaching* (learning chat, concept explanation) → strong instruction-following
    model.
  - *Summarization* (behaviour summaries, insights) → structured-synthesis model.
- **Cross-provider fallback (Gate-2 decision 10, FR-AIORCH-05).** Each task type
  has a primary and an **ordered cross-provider fallback chain**. If the primary
  model fails/times out, the router retries with a model on a **different
  provider** before surfacing any error. Same-provider fallback does **not** satisfy
  this. The router owns the ordering and the concurrent fan-out.
- **Normalized internal response contract (INV-PROXY-03).** The Response Normalizer
  collapses every provider response into one internal shape before it reaches any
  consumer. Features depend on the internal shape only.
- **Graceful degradation (INV-PROXY-04, FR-AIORCH-06).** If every model for a task
  type is unavailable, AI features **fail closed** with a clear user message; they
  never fabricate. Financial State and Capture stay fully functional — they have no
  AI dependency.

In **BYO-key mode** routing/fallback/normalization run **client-side** (the AI
orchestration client embeds the same routing config and per-provider adapters);
there is no edge in the path. In **managed mode** these run on the Go edge.

---

## 10. Egress-enforcement architecture (cross-cutting — seam flagged)

INV-EGR-03 requires egress enforcement to be a **server/boundary guarantee**, not
client-trust. This architecture must be honest that the two modes differ
fundamentally on whether a server boundary even exists.

**Managed mode — a real boundary exists.** The Go edge sits between the client and
the provider. Because every managed-mode request passes through the edge, the edge
**can** enforce egress shape: the architecture provides a seam for the edge to
inspect/limit the egress level the client claims, independent of the client's
localStorage consent flag (which is advisory UI context only, INV-EGR-03). The edge
is the enforcement point — it sees the outbound payload before it reaches a
provider. *(Whether the edge re-derives the permitted shape, or validates a signed
consent assertion, or caps payloads structurally, is the adversarial design and is
owned by the THREAT_MODEL.)*

**BYO-key mode — there is NO server boundary.** The client talks to the provider
**directly** (flow (d)). No edge sees the request. Therefore, in BYO-key mode,
egress shaping is **necessarily client-side**: the consent & redaction subsystem on
the device is the only thing between the user's data and the provider. This is an
honest architectural limit, not an oversight: the same property that makes BYO-key
fully local and cloud-free (INV-AUTH-05) also removes the server enforcement point
that INV-EGR-03 assumes. A user in BYO-key mode is, by construction, trusting
client-side enforcement of their own egress — and it is *their own* provider key and
*their own* data leaving to a provider *they* chose.

**The seam, stated plainly:** redacted-vs-full egress is enforceable at a boundary
in managed mode and only at the client in BYO-key mode. INV-EGR-03's "server
boundary" guarantee is satisfiable in managed mode and structurally unsatisfiable in
BYO-key mode.

> **OWNED BY THREAT_MODEL (Benaiah).** The adversarial analysis and the final
> enforcement design — for managed mode (how the edge enforces shape without
> trusting the client flag) and for BYO-key mode (what assurance is achievable when
> the user is both the principal and the key-holder, and whether that residual
> client-trust is acceptable given it is the user's own key and own data) — are the
> THREAT_MODEL's to resolve. This architecture surfaces the reality and provides the
> managed-mode enforcement seam; it does not claim to have solved the security
> design. **This is the headline cross-cutting security item to carry forward.**

### 10a. Consent-assertion contract (pinned, 2026-06-02)

The managed-mode enforcement mechanism (AQ-01) is pinned here so the egress
subsystem is built against a fixed contract. The CONTRACT binds the *principle*
(INV-EGR-03a: server-boundary enforcement, not client trust); this section binds
the *wire shape*.

**Purpose.** The client's localStorage consent flag is advisory and untrusted
(INV-EGR-03). Before the edge forwards a *full-egress* payload to a provider, it
requires a **server-minted, signed permission slip** — the consent assertion —
proving consent was granted via a server round-trip, not merely claimed by the
client.

| Aspect | Pinned decision |
| --- | --- |
| **Algorithm** | HMAC-SHA256 over the assertion fields (the edge both issues and verifies — symmetric is correct). |
| **Signing key** | A **dedicated** `CONSENT_SIGNING_KEY`, distinct from `JWT_SIGNING_KEY` and **required to differ** (independent rotation). Server-only. |
| **Bound fields** | `user_id` (must equal the caller's authenticated JWT `sub`, INV-AUTH-04), `feature` (per-feature, INV-EGR-02), `level` = `"full"`, `iat`, `exp`, `nonce`. |
| **TTL** | `CONSENT_ASSERTION_TTL` ≈ **5 min** — short, so a stale/leaked slip cannot be replayed for long. |
| **Issued by** | `POST /v1/consent/assert` (authenticated) on per-feature full-egress grant → returned to the client, cached **opaquely** per feature. |
| **Carried on** | request header **`X-Consent-Assertion`** (kept separate from `Authorization`). |
| **Edge verification** | on `/v1/ai/proxy`: valid HMAC **and** not expired **and** `user_id`==caller **and** `feature`==request's feature **and** `level=="full"` → permit full payload; **any failure ⇒ force redacted** (structural payload cap rejects full-only fields). Fail-closed. |
| **Revocation** | short TTL + client dropping the cached slip on revoke. A `nonce`/`jti` one-time-use denylist is **deferred** (overkill at this TTL and scale) — recorded as a hardening TODO. |

Until the proxy handler wires `consentSvc.Verify(...)`, `/v1/ai/proxy` MUST treat
every request as redacted (fail-closed). Implemented by: `internal/consent`
(issue/verify), `internal/egress` (structural cap), `consent/consentStore.ts` +
`ai/orchestration.ts` (client: obtain, cache, attach the header).

---

## 11. Deployment topology

**Two units + a datastore**, orchestrated by Docker Compose:

```
┌─────────────────────────┐        ┌──────────────────────────┐
│  PWA static host        │        │  Go proxy (edge)         │
│  (React/TS build,       │        │  net/http + chi, JWT,    │
│   service worker)       │        │  Argon2id, rate-limit,   │
│                         │        │  provider adapters       │
└─────────────────────────┘        │  distroless, pinned      │
                                   └────────────┬─────────────┘
                                                │
                                   ┌────────────▼─────────────┐
                                   │  Postgres (pgx)          │
                                   │  users/auth + rate-limit │
                                   │  metadata ONLY           │
                                   └──────────────────────────┘

BYO-key bypass:  PWA ───────────────────────────────▶ AI provider
                 (no edge, no Postgres, no cloud dependency)
```

- **Go image is distroless and version-pinned.** Single static binary. **No
  `:latest` tags anywhere** — every image pinned (harness primitive).
- **Postgres holds auth + rate-limit metadata only** — never financial data
  (Gate-4 decision 20, INV-PROXY-01).
- **BYO-key mode bypasses the proxy entirely** — client → provider, zero cloud
  dependency (INV-AUTH-05).
- **Rate-limit evolution.** In-memory token-bucket now (tens–hundreds of users);
  **Redis is the documented scale-out path** when per-instance memory state must be
  shared across instances. Not built now.
- **Documented Python-worker escape hatch.** If Post-MVP brings AI/ML compute, a
  Python worker is added **behind** the Go edge (a third internal unit) — never a
  rewrite of the edge (Gate-4 decision 17). Documented, **not built**.

> **Detailed hosting/ops is deferred to the Migdal infra phase.** This document
> fixes the logical topology and the unit boundaries; concrete host sizing,
> networking, TLS termination, secrets delivery (SOPS/age), backup/restore ops, and
> the hardening overlay applied on every container recreate are Migdal's to detail.

---

## 12. Module boundaries & dependency rules

These rules enforce NFR-MOD and are binding on implementation:

1. **AI failure must not break Financial State (NFR-MOD-01, INV-PROXY-04).** The
   Financial State module has **no compile-time or runtime dependency** on the AI
   modules. State, capture, and dashboard import nothing from Intelligence,
   Literacy, or the AI orchestration client.
2. **UI never calls provider SDKs (NFR-MOD-02).** UI surfaces depend only on
   internal interfaces. The AI orchestration client is the **only** module that
   knows about providers (managed transport or BYO direct); provider SDKs/adapters
   live behind it.
3. **Only the consent subsystem touches consent state (NFR-MOD-03).** No feature
   module reads or writes localStorage consent directly. The AI Context Builder
   **must** pass every outbound context through the consent subsystem; it has no
   path to a transport that bypasses it. The consent subsystem is the single
   producer of egress-shaped payloads (INV-EGR-01, INV-EGR-02).
4. **The edge holds no domain logic (Gate-4 decision 16).** The Go edge depends on
   nothing financial. Any code that computes a balance, budget, projection, or
   conversion belongs on the client; it may not appear on the edge.
5. **Money is integer minor units across every boundary (INV-MON-01).** No module
   may represent a monetary amount as a float at any storage or transmission point.
6. **The event log is append-only at the module boundary (INV-EVT-01).** Only the
   Event Store appends; no module mutates or deletes a committed event.

---

## 13. Open questions (architecture-level)

Genuine architecture-level questions only; nothing fabricated.

- **AQ-01 — Managed-mode egress enforcement mechanism (→ THREAT_MODEL).** This
  architecture provides the seam (the edge is the boundary, §10) but deliberately
  does not pick the mechanism by which the edge enforces redacted-vs-full shape
  without trusting the client's localStorage flag (re-derive shape at the edge?
  validate a signed consent assertion? structural payload caps?). Benaiah owns the
  choice. **Headline item.**
- **AQ-02 — Residual client-trust in BYO-key egress (→ THREAT_MODEL).** BYO-key
  mode has no server boundary, so egress shaping is necessarily client-side (§10).
  The open question is whether that residual client-side trust is acceptable given
  the user is both principal and key-holder using their own key and data — and if
  not, what compensating control (if any) applies. Benaiah owns the verdict.
- **AQ-03 — FX-rate refresh source (→ later build decision, swappable).** The
  refresh source behind the rate-table adapter (§5) is intentionally unspecified
  and swappable; the architecture binds only that refresh is best-effort and
  decoupled from conversion. A concrete source is a build-time choice, not an
  architecture-level blocker.
- **AQ-04 — CON-04 wording drift — RESOLVED (2026-06-02).** SRS CON-04 previously
  described the managed proxy as "a thin FastAPI service"; Gate-4 decision 17
  superseded this with **Go**. SRS CON-04 and the intake have been reconciled to Go;
  this architecture implements the binding Gate-4 (Go) choice. Closed.

---

*End of ARCHITECTURE v0.1. Co-owned by Bezalel (CTO) and Nathan (architecture).
Next in sequence: THREAT_MODEL (Benaiah) — owns AQ-01 and AQ-02 and the full
egress-enforcement design — then C4 (Meshullam). This document owns structure, data
flows, and the decisions above; it does not own the adversarial security analysis
or the formal C4 diagrams.*
