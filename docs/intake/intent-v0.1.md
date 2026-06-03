# WiseMoney — Intake / Source Intent (v0.1)

> Provenance record for `/mishkan-init`. This is the raw intent Y4NN provided,
> plus the four locked initialisation decisions. Every init specialist (Nehemiah,
> Nathan, Zadok, Bezalel, Benaiah, Meshullam, Jehoshaphat) works from this file.
> Captured: 2026-06-02. Not a deliverable — source material.

---

## Locked initialisation decisions (Y4NN, 2026-06-02)

1. **Privacy posture — FULL EGRESS, USER-CONSENTED.** Raw financial detail MAY be
   sent to AI providers (Gemini, NVIDIA NIM, OpenAI, others) for richer guidance,
   gated behind clear, explicit, per-feature user consent. Consent UX is therefore
   a first-class functional requirement, not a checkbox.
2. **AI key handling — BOTH.** Support (a) a thin, stateless proxy that holds
   provider keys server-side so the client never sees them, AND (b) a
   bring-your-own-key mode where a user supplies their own provider keys, stored
   encrypted on-device. The two modes coexist; the user chooses.
3. **Persistence & sync — SINGLE-DEVICE, LOCAL-ONLY (MVP).** Data lives in
   encrypted on-device storage (IndexedDB). Backup/restore via file export. The
   architecture is sync-ready but multi-device sync is explicitly OUT of MVP
   scope (§6.2 "Optional").
4. **Init scope — FULL SEQUENCE, GATED.** Run PRD → SRS → CONTRACT → ARCHITECTURE
   → THREAT_MODEL → C4 → docs scaffold → Cognee → CLAUDE.md → Sprint S0, pausing
   at each consequential step.

### Gate-1 decisions (Y4NN, 2026-06-02, after PRD review)
5. **Personas — PRIMARY ONLY.** "Overwhelmed Tracker" is the sole MVP primary
   persona. "Improving Learner" and "Privacy-Conscious User" are secondary/future.
6. **Declined-consent fallback — REDACTED EGRESS.** When a user declines egress
   consent for an AI feature, the feature still works in redacted mode: only
   aggregated/derived summaries (totals, category breakdowns, trends) may be sent;
   raw transactions never leave the device. Redacted egress is the default; full
   egress is the opt-in upgrade.
7. **Success metrics — SKIP (qualitative only).** No KPIs, no quantified thresholds,
   no SLAs. WiseMoney is a pragmatic personal-use product ("good to use"), not
   enterprise software. Keep all artifacts lean and proportionate — no enterprise
   ceremony. Success criteria stay qualitative (intent §10).

### Gate-2 decisions (Y4NN, 2026-06-02, after SRS review, before CONTRACT)
8.  **Managed proxy — MULTI-TENANT HOSTED.** The managed AI proxy serves multiple
    users with per-user isolation. This requires a user identity + authentication
    subsystem and per-user rate-limiting. Managed mode is therefore cloud-dependent;
    **bring-your-own-key mode remains fully local** (local-first survives as a user
    choice, not the only path). New requirement area FR-AUTH enters the SRS,
    managed-mode only.
9.  **Consent persistence — SEPARATE BROWSER STORAGE (localStorage).** Consent state
    is stored separately from financial data. SECURITY FLAG for Benaiah: localStorage
    is unencrypted and user-clearable; since consent gates egress, real enforcement
    cannot rely solely on this client flag — the THREAT_MODEL owns enforcement design.
10. **MVP AI providers — MULTIPLE AT LAUNCH.** Integrate 2–3 providers (Gemini,
    NVIDIA NIM, OpenAI) at MVP with cross-provider fallback (FR-AIORCH-05 becomes
    cross-provider).
11. **Export formats — CSV + XLSX + JSON.** All three. JSON is the lossless,
    restore-capable primary format (event-log structure preserved); CSV and XLSX are
    human-readable secondary exports (may be lossy for nested event structure).
12. **OQ-01 redaction-shape ownership — DEFAULTED.** CONTRACT specifies only the
    invariant ("no raw transactions in redacted-egress context" + FR-CONSENT-07
    minimum set); per-feature redaction shapes are build-time implementation
    decisions (Bezalel), not contract clauses. Keeps the CONTRACT lean.

### Gate-3 decisions (Y4NN, 2026-06-02, before CONTRACT)
13. **Managed-proxy auth — EMAIL + PASSWORD, SELF-MANAGED JWT.** The proxy owns
    credential storage (password hashing), password reset, JWT issuance/rotation,
    and brute-force defense. THREAT_MODEL scope widens accordingly (Benaiah).
14. **Currency — MULTI-CURRENCY FROM MVP.** Money invariant: every amount = integer
    minor units + ISO-4217 currency code. Each account has a fixed currency;
    transactions are in their account's currency. Aggregates/display convert into a
    user-chosen BASE currency using locally-cached, user-editable FX rates (optional
    online refresh, NEVER a hard online dependency — preserves offline-first). FX-rate
    sourcing detail is a downstream ARCHITECTURE item. (Default stands unless Y4NN
    later picks strictly-manual or strictly-online rates.)
15. **CONTRACT scope — APPROVED as presented** (money/event-log/egress/key/auth/
    persistence/proxy invariants + guarantees). `/plan` gate satisfied.

### Gate-4 decisions (Y4NN, 2026-06-02, ARCHITECTURE /plan)
16. **Logic placement — CLIENT-HEAVY.** Essentially ALL financial/domain business
    logic lives in the client (event-sourcing, snapshot derivation, balances, budgets,
    goals, recurring projections, FX conversion, consent/redaction, encryption, AI
    context building, export/import). The backend has NO financial business logic.
17. **Backend — GO.** The managed proxy is a thin, stateless, multi-tenant auth +
    AI-gateway edge in Go (net/http + chi, golang-jwt, x/crypto/argon2). Job: auth →
    rate-limit → route to provider → normalize response. Concurrent fan-out +
    cross-provider fallback. Single static binary, distroless Docker image.
    DEVIATES from MISHKAN FastAPI baseline — engineer override, justified because the
    backend does no domain logic. Likely Post-MVP growth = services/sync (stays Go).
    **Polyglot escape hatch (documented, not built):** if AI/ML compute ever lands
    Post-MVP, add a Python worker BEHIND the Go edge — never a rewrite.
18. **Frontend — REACT + TS PWA.** Vite, service worker (offline), Dexie/IndexedDB,
    Web Crypto AES-GCM at rest, client-side event-sourcing. pnpm.
19. **Encryption key — HYBRID.** Passphrase → Argon2id derives the key; day-to-day
    unlock via WebAuthn/biometric. Lose passphrase = lose data (JSON export is the
    recovery path).
20. **Datastore — POSTGRES (pgx)** for users/auth (Argon2id hashes) + rate-limit
    metadata ONLY. Never financial data. Rate-limit in-memory token-bucket now; Redis
    documented as the scale-out path.
21. **Scale target — TENS–HUNDREDS (small public).** Single modest container host
    suffices; detailed hosting/ops deferred to the Migdal infra phase.
22. **Topology — TWO UNITS** (PWA client + Go proxy) + Postgres, Docker Compose,
    pinned versions, distroless Go image. BYO-key mode bypasses the proxy entirely
    (client → provider, zero cloud dependency). SECURITY.md present.

### Gate-5 decisions (Y4NN, 2026-06-02, after THREAT_MODEL)
23. **INV-EGR-03 — AMEND (mode-split).** Zadok applies the THREAT_MODEL §5 exact
    text: (a) managed mode = server/boundary enforcement at the Go edge; (b) BYO-key
    mode = client-side enforcement only, user-as-principal, with MANDATORY disclosure
    in the BYO consent UI that no server-side enforcement exists.
24. **AQ-01 enforcement — STRUCTURAL CAP + SIGNED CONSENT ASSERTION.** The Go edge
    validates redacted requests against an aggregate-only JSON schema (rejects any
    full-egress-only field, 400) AND requires a server-signed, short-lived consent
    assertion for full egress (absent → treated as redacted). Adds a consent-assertion
    issuance endpoint to the Go edge (CONFIRMED in scope).
25. **AQ-02 — BYO client-trust ACCEPTED** (user is data subject + key-holder + sole
    operator). Hard condition: BYO consent UI must state plainly there is no
    server-side enforcement.
26. **Encrypted export — OPTIONAL ENCRYPTED EXPORT IN MVP.** Ship an opt-in
    passphrase-encrypted export alongside plaintext, with a clear plaintext warning.
    JSON remains the lossless restore format (INV-PERS-03); encrypted variant wraps it.
27. **Passphrase policy — BALANCED.** Enforce a sensible minimum (length +
    zxcvbn-style strength check), live strength meter, block only genuinely weak
    passphrases. Tuned for the Overwhelmed Tracker (low friction, real security).
28. **Provider data-handling terms — LAUNCH-BLOCKER TASK (S0).** Gemini / NVIDIA NIM
    / OpenAI retention + model-training opt-out terms MUST be verified and linked
    before ship. Ops/legal item; no specifics may be fabricated. Tracked in Sprint S0.

### Standing tension to carry into THREAT_MODEL
"Full egress" (decision 1) is in direct tension with feature §7.2 "Local-first
sensitive data handling" and the product's "local-first" identity. This is held
deliberately: the resolution is consent + redaction-by-default options + clear
data-egress disclosure, NOT silent reconciliation. Benaiah owns it.

---

## Document A — Product Spec (v0.1)

### 1. Product Definition
WiseMoney is a **local-first personal finance PWA** that combines: real-time
financial state tracking, behavioral financial guidance, structured financial
learning. It is a **daily financial intelligence system**, not just a tracker.

### 2. Core Objective
Help users clearly understand: (1) where their money is, (2) what their financial
situation is, (3) what they should do next, (4) how to improve their financial
literacy over time.

### 3. Core Pillars (3 equal)
- **3.1 Financial State (Core Tracking)** — continuously maintains a clear,
  updated view of income, expenses, balances, budgets, categories, financial
  trends. The "dashboard reality layer".
- **3.2 Financial Intelligence (AI Guidance Layer)** — interprets financial state
  into insights, risks, recommendations, behavioral patterns. The "decision layer".
- **3.3 Financial Literacy (Learning Layer)** — structured learning that improves
  understanding over time: budgeting, saving, debt, spending behavior, planning.
  Delivered via a conversational AI learning interface (chat-based). The
  "education + growth layer".

### 4. Core UX Model — 3 continuous loops
- **4.1 Capture** — log income / expense / transfer / recurring quickly. Goal:
  maintain accurate financial state.
- **4.2 Understand** — see current position, category breakdown, trends, budget
  status. Goal: instant clarity.
- **4.3 Learn & Act (dual output)** — (A) Action Layer: recommendations, warnings,
  optimization; (B) Learning Layer: explanations, guided learning, concepts tied
  to behavior. Goal: improve behavior AND understanding.

### 5. AI System — Multi-Model Orchestration
A distributed intelligence layer, not a single model.
- **5.1 Model strategy** — multiple providers: Gemini, NVIDIA NIM, OpenAI
  (optional), other inference providers.
- **5.2 Role separation** — insight-generation models → interpretation; reasoning
  models → recommendations; teaching models → learning chat; lightweight models →
  classification + categorization.
- **5.3 Web-enhanced intelligence** — AI may retrieve external financial knowledge,
  validate explanations, improve educational accuracy, support current guidance.

### 6. Financial State System (core feature)
Always maintains a live financial snapshot: total balance, cash flow, category
distribution, budget status, recurring obligations. The primary product anchor;
everything else depends on it.

### 7. Learning Layer (key differentiator)
Embedded in daily usage (not a separate module), conversational, context-aware
(based on user behavior), progressive (adapts to knowledge level). Answers e.g.
"why am I overspending?", "how do budgets work?", "how can I save more?".

### 8. System Principles
- **8.1 Separation of concerns** — tracking ≠ intelligence ≠ learning; each layer
  independent but connected through shared financial state.
- **8.2 Context consistency** — all AI/system outputs reference current financial
  state, recent behavior, user goals.
- **8.3 Minimal user complexity** — user interacts only with: adding money events,
  viewing financial state, receiving guidance/learning. Everything else internal.

### 9. UX Structure (mobile-first) — 3 primary interfaces
1. **Dashboard** (Financial State) — clear snapshot.
2. **Capture** (Quick Input) — fast transaction entry.
3. **Assistant** (Learn + Guide Chat) — AI intelligence + learning interface.

### 10. Success Criteria
Successful if: users understand their financial state instantly; open it daily
without friction; improve financial behavior over time; actively learn through
the system; financial clarity becomes automatic, not manual.

---

## Document B — Complete Structured Feature Set (v0.1)

### 1. CORE SYSTEM FEATURES (Financial State Layer)
- **1.1 Financial Overview Engine** — real-time snapshot; total balance; income vs
  expense summary; net cash flow; monthly position view.
- **1.2 Account Management** — multiple accounts (cash, bank, cards); balance
  tracking; account-level aggregation; optional hidden account grouping.
- **1.3 Transaction System** — add income/expense; edit/delete; history log;
  tagging; notes per transaction.
- **1.4 Category System** — default categories; custom creation; auto-categorization;
  category-level totals; category trend tracking.
- **1.5 Budget System** — monthly budgets; category-specific budgets; progress
  tracking; overspending alerts; remaining-budget calculation.
- **1.6 Financial Goals System** — savings goal creation; progress tracking;
  contribution history; completion tracking.
- **1.7 Recurring Transactions** — recurring income/expense setup; subscription
  tracking; auto-projection into financial state.
- **1.8 Financial Timeline Engine** — chronological history; time-based filtering
  (day/week/month/year); trend evolution.

### 2. FINANCIAL INTELLIGENCE LAYER (AI SYSTEM)
- **2.1 Financial Insight Engine** — spending-pattern detection; budget-anomaly
  detection; cash-flow analysis; monthly behavior summary.
- **2.2 Recommendation System** — personalized recommendations; budget-optimization
  suggestions; spending-reduction suggestions; risk alerts.
- **2.3 Predictive Financial Engine** — end-of-month balance projection; spending
  forecast; budget-exhaustion prediction; what-if scenario simulation.
- **2.4 Behavioral Intelligence System** — habit detection; category-dependency
  detection; behavior scoring; habit-evolution tracking.
- **2.5 AI Context Engine (internal)** — financial-state aggregation for AI;
  event-based context building; behavior summarization; time-windowed context.
- **2.6 Multi-Model AI Orchestration Layer** — multi-provider support; model routing
  per task type (reasoning / classification / teaching / summarization); response
  normalization; fallback model system.
- **2.7 Web-Enhanced Intelligence Layer** — external knowledge lookup; explanation
  enrichment; up-to-date concept guidance; advice validation against external sources.

### 3. FINANCIAL LEARNING LAYER (core differentiator)
- **3.1 Conversational Learning Interface** — chat-based education; interactive Q&A;
  context-aware explanations; personalized learning paths.
- **3.2 Adaptive Learning System** — beginner→intermediate→advanced progression;
  behavior-based learning; concept reinforcement; mistake-based triggers.
- **3.3 Financial Concept Library** — budgeting; saving; debt management; spending
  psychology; planning basics; investment fundamentals (optional expansion).
- **3.4 Contextual Learning Injection** — learning triggered by user actions;
  explanation tied to real transactions; just-in-time education; micro-learning.
- **3.5 AI Teaching Models Layer** — teaching-oriented model routing; simplified
  explanation generation; example-based responses; step-by-step breakdowns.

### 4. USER INTERACTION SYSTEM
- **4.1 Capture System** — quick input; minimal-step expense logging; fast income
  entry; offline-first capture.
- **4.2 Financial Dashboard** — live snapshot; income vs expense viz; category
  breakdown; budget status indicators; monthly summary.
- **4.3 Insight Feed** — AI insight stream; risk notifications; summaries;
  behavioral feedback.
- **4.4 Action System** — recommended actions; budget-adjustment suggestions;
  spending-correction guidance; goal-adjustment prompts.
- **4.5 Learning Chat Interface** — assistant chat UI; context-aware explanations;
  on-demand teaching; personalized coaching.

### 5. DATA & EVENT SYSTEM
- **5.1 Financial Event System** — all activity stored as events: transaction_created,
  budget_updated, goal_created, insight_generated, learning_interaction.
- **5.2 Financial State Engine** — aggregates events into current state; real-time
  snapshot; computes derived metrics (cashflow, budgets, trends).
- **5.3 Historical Data Engine** — full history; behavior-timeline reconstruction;
  long-term evolution tracking.

### 6. SYSTEM INTEGRATION LAYERS
- **6.1 Offline-First Storage Layer** — local persistent storage; full offline
  functionality; sync-ready architecture.
- **6.2 Sync Layer (OPTIONAL — out of MVP)** — multi-device sync; conflict
  resolution; background sync.
- **6.3 AI Context Integration Layer** — structured data prep for AI; event→context
  transformation; time-window slicing for reasoning.

### 7. NON-FUNCTIONAL SYSTEM FEATURES
- **7.1 Performance** — instant PWA load; offline-first responsiveness; minimal
  interaction latency.
- **7.2 Security & Privacy** — local-first sensitive-data handling; secure optional
  sync; no mandatory cloud dependency. (NB: in tension with full-egress decision —
  resolved via consent + redaction options, owned by THREAT_MODEL.)
- **7.3 Modularity** — feature isolation per domain; independent financial modules;
  AI system decoupled from UI.

### 8. PRODUCT CONSTRAINT MODEL
- **8.1 EXPOSED to user** — financial state; transaction capture; insights; learning chat.
- **8.2 HIDDEN (internal)** — AI routing complexity; event system; data aggregation;
  multi-model orchestration; predictive modeling engines.

### 9. CORE PRODUCT DEFINITION (final)
> WiseMoney is a local-first financial operating system combining real-time
> money tracking, AI-driven financial intelligence, and adaptive financial
> education — all delivered through a minimal mobile-first interaction loop.
