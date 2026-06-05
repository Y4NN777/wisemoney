# WiseMoney — Software Requirements Specification

| Field | Value |
| --- | --- |
| **Title** | WiseMoney — Software Requirements Specification |
| **Date** | 2026-06-02 |
| **Version** | SRS v0.1 (derived from PRD v0.1) |
| **Revision** | Rev 2026-06-02 — Gate-2: FR-AUTH added; multi-tenant proxy; multi-provider MVP; CSV/XLSX/JSON export; consent in localStorage. Rev 2026-06-05 — OQ-06 resolved (client auth token storage; see §15). |
| **Status** | Draft |
| **Owner** | Nathan (software architecture) |
| **Source** | `docs/PRD.md` v0.1; `docs/intake/intent-v0.1.md` v0.1 |

> This document states **what** WiseMoney must do in enough detail to build
> it, and what qualitative properties it must have. It owns the requirements
> boundary; it does not specify storage schemas, API signatures, or invariants —
> those belong to the CONTRACT (Zadok). Tags `[MVP]` and `[Post-MVP]` mark
> whether a requirement ships in the initial release or is deliberately deferred.

---

## 1. Scope & MVP cut

### 1.1 In scope for the MVP

The MVP is designed for the **Overwhelmed Tracker** (sole primary persona, Gate-1
decision 5): someone who wants to know where their money is, needs capture to be
near-frictionless, and values being told what to do rather than shown raw numbers.

The MVP ships the three UX loops (Capture / Understand / Learn & Act) through
three surfaces (Capture, Dashboard, Assistant) backed by:

- A complete Financial State layer (accounts, transactions, categories, budgets,
  goals, recurring items, timeline).
- A functional AI Intelligence layer with basic insight and recommendation
  generation, using the multi-provider orchestration model.
- A functional Financial Literacy layer with a conversational learning interface
  linked to the user's own behaviour.
- The full consent & egress model (both full and redacted modes) — this is a
  first-class MVP requirement, not a post-MVP concern.
- Both AI key modes: managed proxy and bring-your-own-key.
- Local-only encrypted persistence with file export/restore.

The MVP's AI Intelligence scope is intentionally bounded: the Behavioral
Intelligence engine (FR-AI-08, FR-AI-09) and the Predictive Financial engine
(FR-AI-05, FR-AI-06) are present in MVP only at their most essential depth. What-if
scenario simulation (FR-AI-07), behaviour scoring (FR-AI-10), and web-enhanced
intelligence (FR-AI-13) are Post-MVP. The adaptive learning progression system
(FR-LRN-04) is Post-MVP.

### 1.2 Deferred Post-MVP

The following capabilities are deliberately deferred. The architecture must
remain ready to add them without structural rework.

- Multi-device sync (locked decision 3; intent §6.2). `[Post-MVP]`
- Web-enhanced intelligence / external knowledge lookup (intent §5.3, Document B §2.7). `[Post-MVP]`
- Adaptive learning system — beginner-to-advanced progression tracking (Document B §3.2). `[Post-MVP]`
- Investment-fundamentals learning content (PRD §11; intent §3.3). `[Post-MVP]`
- Hidden account grouping (Document B §1.2). `[Post-MVP]`
- What-if scenario simulation (Document B §2.3). `[Post-MVP]`

---

## 2. Core entities (requirements level)

The system must represent the following named entities. Column types, indexes, and
storage schema are not specified here — those belong to the CONTRACT.

**Account** — a named store of money the user tracks. Must capture: a human name,
an account type (cash, bank card, other), an initial balance, and whether the
account is active.

**Transaction** — a discrete financial event the user records. Must capture: the
amount and its direction (income or expense), the account it belongs to, the
category, a timestamp (user-supplied or system-defaulted), an optional note, and
optional user-defined tags.

**Category** — a classification for transactions. Must capture: a name, whether it
is system-default or user-created, and optionally a parent category for grouping.

**Budget** — a spending target for a category within a period. Must capture: the
target category, the period (month), the spending limit, and the computed
remaining amount (derived from transactions).

**Goal** — a savings target the user defines. Must capture: a name, the target
amount, the current accumulated amount (derived from associated contributions),
and a target date if the user supplies one.

**RecurringItem** — an income or expense expected on a schedule. Must capture: the
amount and direction, the category, the frequency, the start date, and a human
label. Its projected occurrences must be visible to the Financial State engine.

**FinancialEvent** — a stored record of every state-changing action in the system
(see §5). Must capture the event type, a stable ID, a timestamp, the actor
(system or user), and a payload describing what changed.

**FinancialState snapshot** — a derived, point-in-time view computed from the
event log. Must capture: total balance across accounts, total income and total
expenses for the current period, net cash flow, category totals, budget progress
per budget, goal progress per goal, and projected upcoming recurring obligations.

---

## 3. Functional requirements — Financial State (FR-FS)

### 3.1 Financial Overview Engine

**FR-FS-01** `[MVP]` The system must maintain and expose a live financial snapshot
covering total balance, period income, period expenses, and net cash flow without
requiring the user to perform manual calculations.

**FR-FS-02** `[MVP]` The snapshot must update immediately when a transaction,
budget, or goal change is recorded — the user must never need to refresh manually.

**FR-FS-03** `[MVP]` The user must be able to view the monthly position (current
period) as the default view, with the ability to navigate to prior months.

### 3.2 Account Management

**FR-FS-04** `[MVP]` The user must be able to create, rename, and deactivate
accounts. At minimum the following account types must be supported: cash, bank,
credit card.

**FR-FS-05** `[MVP]` The system must display a per-account balance and the
aggregate balance across all active accounts.

**FR-FS-06** `[Post-MVP]` The user must be able to group accounts and optionally
hide grouped accounts from the main balance display.

### 3.3 Transaction System

**FR-FS-07** `[MVP]` The user must be able to record a transaction (income or
expense) by supplying at minimum an amount and a category, with all other fields
defaulting so capture takes as few steps as possible.

**FR-FS-08** `[MVP]` The user must be able to edit or delete any transaction they
have recorded, with the financial snapshot updating immediately.

**FR-FS-09** `[MVP]` The system must maintain a full history log of all
transactions, viewable with time-based filtering (day, week, month, year).

**FR-FS-10** `[MVP]` The user must be able to attach an optional free-text note
and optional tags to any transaction.

### 3.4 Category System

**FR-FS-11** `[MVP]` The system must ship a set of sensible default categories
sufficient to cover everyday personal finance without user configuration.

**FR-FS-12** `[MVP]` The user must be able to create custom categories.

**FR-FS-13** `[MVP]` The system must compute and display category-level totals for
the current period and trends across periods.

**FR-FS-14** `[MVP]` The system must support auto-categorization of new
transactions based on prior patterns or explicit rules defined by the user.

### 3.5 Budget System

**FR-FS-15** `[MVP]` The user must be able to define a monthly spending budget for
one or more categories.

**FR-FS-16** `[MVP]` The system must track spending against each active budget in
real time, computing and displaying the remaining amount.

**FR-FS-17** `[MVP]` The system must alert the user when a budget is approaching
exhaustion or has been exceeded.

### 3.6 Financial Goals

**FR-FS-18** `[MVP]` The user must be able to create a savings goal with a name
and target amount, and optionally a target date.

**FR-FS-19** `[MVP]` The system must track contributions toward each goal and
display progress.

### 3.7 Recurring Items

**FR-FS-20** `[MVP]` The user must be able to define a recurring income or expense
item with a frequency and starting date.

**FR-FS-21** `[MVP]` The system must project recurring items into the financial
state so the user can see upcoming obligations and expected cash flow impact.

### 3.8 Financial Timeline

**FR-FS-22** `[MVP]` The system must provide a chronological event history the
user can browse and filter by time range.

**FR-FS-23** `[MVP]` The system must compute and display trend evolution for
categories and net position over time.

---

## 4. Functional requirements — Financial Intelligence / AI (FR-AI)

### 4.1 Insight Engine

**FR-AI-01** `[MVP]` The system must analyse the user's financial state and surface
spending-pattern observations, budget anomalies, and cash-flow signals as an
insight stream.

**FR-AI-02** `[MVP]` The system must produce a monthly behaviour summary for the
user, covering key changes from the prior month.

### 4.2 Recommendation System

**FR-AI-03** `[MVP]` The system must generate concrete recommended actions (e.g.
budget adjustments, spending-reduction suggestions) grounded in the current
financial state.

**FR-AI-04** `[MVP]` The system must flag risks — including overspending trends,
projected budget exhaustion, and cash-flow shortfalls — as actionable alerts.

### 4.3 Predictive Engine

**FR-AI-05** `[MVP]` The system must project the user's end-of-month balance given
current trajectory and recurring obligations.

**FR-AI-06** `[MVP]` The system must predict budget exhaustion dates for active
budgets where the current spending rate makes exhaustion likely before month-end.

**FR-AI-07** `[Post-MVP]` The system must support what-if scenario simulation
(e.g. "what if I cut dining by 20%?").

### 4.4 Behavioral Intelligence

**FR-AI-08** `[MVP]` The system must detect recurring spending habits and
category-dependency patterns from the transaction history.

**FR-AI-09** `[MVP]` The system must surface behavior-pattern observations to the
user as part of the insight stream.

**FR-AI-10** `[Post-MVP]` The system must compute and evolve a behaviour score
over time, with explanation of what is driving it.

### 4.5 AI Context Engine (internal)

**FR-AI-11** `[MVP]` Internally, the system must aggregate the current financial
state and recent event history into a structured context representation suitable
for submission to AI models.

**FR-AI-12** `[MVP]` The context representation must be time-windowed (e.g. last
30 days by default) so that context sent to AI providers is bounded and relevant.

### 4.6 Web-Enhanced Intelligence

**FR-AI-13** `[Post-MVP]` The system must support lookups of external financial
knowledge to enrich explanations and validate guidance with up-to-date information.

---

## 5. Functional requirements — Financial Learning (FR-LRN)

### 5.1 Conversational Learning Interface

**FR-LRN-01** `[MVP]` The Assistant surface must provide a chat-based interface
through which the user can ask financial questions in natural language and receive
explanations tied to their real transactions and state.

**FR-LRN-02** `[MVP]` The system must deliver context-aware explanations: when the
user asks "why am I overspending?" or equivalent, the answer must reference the
user's own data, not generic advice.

**FR-LRN-03** `[MVP]` The system must trigger contextual learning prompts in
response to relevant user actions (e.g. a budget breach, a large unusual
transaction), offering a just-in-time educational nudge.

### 5.2 Adaptive Learning Progression

**FR-LRN-04** `[Post-MVP]` The system must track the user's learning progression
from beginner through intermediate to advanced and adapt explanations to their
current level over time.

### 5.3 Financial Concept Library

**FR-LRN-05** `[MVP]` The system must be able to explain the following core
financial concepts when asked: budgeting, saving, cash flow, expense categories,
recurring obligations, and debt basics.

**FR-LRN-06** `[Post-MVP]` The learning library must expand to cover investment
fundamentals (for educational purposes only — no trading capability).

### 5.4 Teaching Model Routing

**FR-LRN-07** `[MVP]` Learning responses must be generated by or routed to models
configured for teaching: simplified explanations, example-based answers, and
step-by-step breakdowns. This is a routing concern internal to the AI orchestration
layer, transparent to the user.

---

## 6. Functional requirements — User Interaction (FR-UI)

### 6.1 Capture Surface

**FR-UI-01** `[MVP]` The Capture surface must allow a user to log an expense or
income in the minimum number of steps; the happy path must not require navigation
away from a single entry point.

**FR-UI-02** `[MVP]` Capture must function fully offline. A transaction recorded
offline must persist and be reflected in the financial state immediately, without
waiting for any network connection.

### 6.2 Dashboard Surface

**FR-UI-03** `[MVP]` The Dashboard must display at a glance: total balance,
income-vs-expense for the current period, category breakdown, budget status
indicators, and the monthly position — all without manual interaction.

**FR-UI-04** `[MVP]` Dashboard data must be available offline, showing the last
computed state.

### 6.3 Insight Feed & Action System

**FR-UI-05** `[MVP]` The system must surface AI-generated insights and risk alerts
to the user as a feed or notification-style stream accessible from the main
navigation.

**FR-UI-06** `[MVP]` Recommended actions must be dismissable and, where applicable,
directly actionable (e.g. a budget-adjustment suggestion should pre-populate the
budget edit flow).

### 6.4 Assistant Surface

**FR-UI-07** `[MVP]` The Assistant surface must support open-ended chat between
the user and the AI system, covering both guidance queries and learning queries in
a single interface.

**FR-UI-08** `[MVP]` The Assistant must have access to the current financial state
context when generating responses so that answers are grounded in the user's
actual data (subject to consent state — see §8).

---

## 7. Functional requirements — Data & Event System (FR-DE)

### 7.1 Financial Event System

**FR-DE-01** `[MVP]` Every state-changing user action must be stored as an
immutable FinancialEvent. The following event types must be supported in the MVP:
`transaction_created`, `transaction_updated`, `transaction_deleted`,
`budget_updated`, `goal_created`, `goal_updated`, `goal_contribution_recorded`,
`recurring_item_created`, `recurring_item_updated`, `insight_generated`,
`learning_interaction`. (`goal_contribution_recorded` is a distinct event type so
that a Goal's accumulated amount derives exclusively from contribution events per
CONTRACT INV-EVT-04 — added during MODELING, 2026-06-02.)

**FR-DE-02** `[MVP]` Each FinancialEvent must carry a stable identifier,
a timestamp, the event type, and a payload sufficient to reconstruct the change it
represents.

**FR-DE-03** `[MVP]` The current FinancialState snapshot must be derivable by
replaying the event log from inception. The snapshot must also be cached so that
state reads do not require a full replay in normal operation.

### 7.2 Historical Data Engine

**FR-DE-04** `[MVP]` The system must retain the complete event history without
pruning, enabling full timeline reconstruction and long-term trend analysis.

**FR-DE-05** `[MVP]` The system must support time-windowed queries over the event
history so that trend views and AI context builds can operate on bounded ranges.

### 7.3 AI Context Integration

**FR-DE-06** `[MVP]` The system must maintain an internal AI context builder that
transforms the current FinancialState snapshot and a time-windowed slice of events
into a structured representation suitable for AI provider submission.

**FR-DE-07** `[MVP]` The context builder must respect the user's consent state:
when full-egress consent is granted, the context may include raw transaction
detail; when only redacted consent is granted (or consent has been declined), the
context must contain only aggregated/derived summaries (see §8.3).

---

## 8. Consent & egress requirements (FR-CONSENT)

Consent is a first-class functional requirement (locked decision 1). The consent
system is not a checkbox flow; it is a user-facing feature with its own design.

### 8.1 Per-feature consent gate

**FR-CONSENT-01** `[MVP]` No AI feature may send any user financial data to an
external provider without an explicit, per-feature consent decision by the user.
The consent prompt must display, in plain language: what data will be sent, to
which provider, and for what purpose.

**FR-CONSENT-02** `[MVP]` The user must be able to grant or decline consent per
feature independently. Granting consent for one feature must not imply consent for
any other feature.

**FR-CONSENT-03** `[MVP]` Consent decisions must be persistent: the user must not
be re-prompted each session for a decision they have already made, and they must
be able to review and change prior decisions from a single consent management
screen. Consent state is stored in **separate browser storage (localStorage)**,
distinct from the encrypted financial store (Gate-2 decision 9).

> **SECURITY NOTE:** localStorage is unencrypted and user-clearable. Because
> consent state gates egress, egress enforcement must not rely solely on this
> client-side flag. Enforcement design — including any server-side or secondary
> check — is owned by the THREAT_MODEL (Benaiah). This SRS records the requirement
> and flags the gap; it does not resolve it.

**FR-CONSENT-04** `[MVP]` Consent must be revocable at any time. Revoking consent
for a feature must immediately cause the system to revert that feature to
redacted-egress mode.

### 8.2 Full-egress mode (opt-in)

**FR-CONSENT-05** `[MVP]` When the user grants full-egress consent for an AI
feature, the system may include raw transaction detail in the context submitted to
the AI provider for that feature.

### 8.3 Redacted-egress mode (default and declined-consent fallback)

Redacted egress is the default state for every AI feature. It is also the fallback
when the user declines full-egress consent (Gate-1 decision 6).

**FR-CONSENT-06** `[MVP]` When a feature operates in redacted-egress mode — either
because the user has not yet been prompted, has declined, or has revoked full-egress
consent — the feature must still function, but the context submitted to the AI
provider must contain only aggregated and derived summaries. Raw transactions must
never be included.

**FR-CONSENT-07** `[MVP]` "Aggregated and derived summaries" means, at minimum:
period totals per category, overall income and expense totals for the period, net
cash flow, budget status (percentage consumed), goal progress (percentage toward
target), and trend direction. No individual transaction amount, date, merchant, or
note may be included in a redacted-egress context.

**FR-CONSENT-08** `[MVP]` The exact per-feature redaction shape (which specific
summary fields each feature submits) must be specified in the definition of each
AI feature. This SRS establishes FR-CONSENT-07 as the minimum permitted set; a
feature may further restrict it.

### 8.4 Egress transparency

**FR-CONSENT-09** `[MVP]` The user must be able to inspect, from a single screen,
the complete list of AI features that are capable of egress, the consent state of
each, the provider each feature routes to, and a plain-language description of
what each sends.

---

## 9. AI key-handling requirements (FR-KEY)

Both modes are first-class and coexist. The user chooses; the capability set is
identical in both.

### 9.1 Managed proxy mode

**FR-KEY-01** `[MVP]` The system must support a managed mode in which AI provider
keys are held server-side by a thin stateless proxy. In this mode, the client
application must never receive, store, or transmit the provider keys.

**FR-KEY-02** `[MVP]` The managed proxy must be stateless with respect to user
data: it routes requests and returns responses without storing financial context.

### 9.2 Bring-your-own-key mode

**FR-KEY-03** `[MVP]` The system must support a bring-your-own-key mode in which
the user supplies their own AI provider API key(s). Supplied keys must be stored
encrypted on-device and must never be transmitted to the managed proxy or any
server other than the intended AI provider.

**FR-KEY-04** `[MVP]` The user must be able to add, update, and delete their own
provider keys without needing to contact any server.

### 9.3 Mode switching

**FR-KEY-05** `[MVP]` The user must be able to switch between managed mode and
bring-your-own-key mode at any time without data loss.

---

## 9a. Functional requirements — Identity & Authentication (FR-AUTH)

These requirements apply **exclusively to managed proxy mode**. Bring-your-own-key
mode requires no account and no authentication: it operates entirely on-device with
no server involvement. Local-first operation is preserved as a full user choice.

**FR-AUTH-01** `[MVP]` A user must authenticate before the managed proxy will
process any request. Unauthenticated requests to the managed proxy must be
rejected. Managed-mode requests must be attributable to an authenticated identity.

**FR-AUTH-02** `[MVP]` The managed proxy must enforce per-user isolation: one
user's requests, API keys, and context must never be accessible to or inferable by
another user. Isolation must hold at both the request routing and the rate-limiting
layers.

**FR-AUTH-03** `[MVP]` The managed proxy must enforce per-user rate-limiting.
A single user's traffic must not be able to exhaust the proxy's provider budget or
degrade service for other users.

**FR-AUTH-04** `[MVP]` The managed proxy must remain stateless with respect to
financial data. Authentication and rate-limiting are the only state the proxy may
maintain about a user; it must not store financial context, transaction payloads,
or AI responses (see CON-04).

**FR-AUTH-05** `[MVP]` Bring-your-own-key mode must not require account creation,
authentication, or any contact with the managed proxy. A user who chooses BYO-key
must be able to operate the full application without any cloud dependency.

**FR-AUTH-06** `[MVP]` (Gate-5 decision 24) In managed mode, the proxy must issue a
**server-signed, short-lived consent assertion** when a user grants per-feature
full-egress consent. A managed-mode full-egress request lacking a valid assertion
must be treated as redacted. The proxy must additionally enforce a **structural
payload cap**: redacted-mode requests are validated against an aggregate-only schema
and rejected if they carry any field permissible only under full egress. This is the
managed-mode egress enforcement mechanism (INV-EGR-03 amended, clause (a)); it does
not apply to BYO-key mode, which has no proxy.

---

## 10. Multi-provider AI orchestration requirements (FR-AIORCH)

### 10.1 Provider support

**FR-AIORCH-01** `[MVP]` The AI layer must integrate Google Gemini, NVIDIA NIM,
and OpenAI as named providers at MVP launch. All three are mandatory at initial
release, not optional. The provider set must be extensible without structural
code changes. (Gate-2 decision 10.)

### 10.2 Model routing per task type

**FR-AIORCH-02** `[MVP]` The orchestration layer must route inference tasks to
models appropriate for the task type. The task types and their routing requirements
are:

- **Reasoning tasks** (recommendations, risk analysis, projection) — route to a
  model with strong analytical reasoning capability.
- **Classification tasks** (transaction categorization, pattern detection) — route
  to a lightweight, fast model.
- **Teaching tasks** (learning chat, concept explanation) — route to a model with
  strong instruction-following and explanation capability.
- **Summarization tasks** (behaviour summaries, insight generation) — route to a
  model suited for structured text synthesis.

**FR-AIORCH-03** `[MVP]` The routing configuration (which model handles which task
type) must be operator-configurable without code changes.

### 10.3 Response normalization

**FR-AIORCH-04** `[MVP]` The orchestration layer must normalize responses from all
providers into a consistent internal representation before they reach any feature
that consumes AI output. Features must not depend on provider-specific response
formats.

### 10.4 Fallback behaviour

**FR-AIORCH-05** `[MVP]` For each task type, a fallback model must be configured.
Fallback is **cross-provider**: if the primary model for a task type fails or is
unavailable, the system must automatically retry with a model from a different
provider before surfacing an error to the user. Falling back to a different model
on the same provider does not satisfy this requirement. (Gate-2 decision 10.)

**FR-AIORCH-06** `[MVP]` If all configured models for a task type are unavailable,
the system must degrade gracefully: financial state features (FR-FS) and capture
(FR-UI-01, FR-UI-02) must continue to work; AI-dependent features must surface a
plain message indicating the AI service is temporarily unavailable.

---

## 11. Persistence requirements (FR-PERSIST)

### 11.1 Local encrypted storage

**FR-PERSIST-01** `[MVP]` All user financial data — transactions, accounts,
budgets, goals, recurring items, the event log, AI key material — must be stored
in encrypted on-device storage. No financial data may be stored in plain text at
rest.

**FR-PERSIST-02** `[MVP]` Storage must be local-only for the MVP. No financial
data is replicated to any cloud service by the persistence layer.

**FR-PERSIST-03** `[MVP]` The storage layer must support full offline operation:
reads and writes must succeed without any network connection.

### 11.2 Offline-first capture

**FR-PERSIST-04** `[MVP]` Transactions and other state-changing events recorded
while the device is offline must be persisted immediately and reflected in the
local financial state without delay. No action on the user's part is required when
connectivity is restored.

### 11.3 Export and restore

**FR-PERSIST-05** `[MVP]` The user must be able to export all their data at any
time. Three export formats must be supported (Gate-2 decision 11):

- **JSON** — the primary, lossless format. The full event-log structure must be
  preserved. This is the restore-capable format; it must contain sufficient data
  to fully reconstruct local state via FR-PERSIST-06.
- **CSV** — a human-readable secondary export. May be lossy with respect to nested
  event structure; does not need to support full restore.
- **XLSX** — a human-readable secondary export. Same lossiness allowance as CSV;
  does not need to support full restore.

All three formats must be available from the same export flow.

**FR-PERSIST-08** `[MVP]` (Gate-5 decision 26) The user must be offered an **opt-in
passphrase-encrypted export** alongside the plaintext exports. The encrypted variant
wraps the lossless JSON export and is itself restore-capable. When the user chooses a
plaintext export, the system must show a clear warning that the file contains their
complete financial history unprotected. Encryption uses the same passphrase-derived
keying as at-rest encryption (see NFR-SEC-05).

**FR-PERSIST-06** `[MVP]` The user must be able to restore from a previously
exported **JSON** file (plaintext or passphrase-encrypted), replacing the current
local state. Restore from CSV or XLSX is not required.

### 11.4 Sync-readiness

**FR-PERSIST-07** `[MVP]` The persistence architecture must be sync-ready: the
event-log model (FR-DE-01 through FR-DE-03) must be the foundation so that a sync
layer can be added Post-MVP without restructuring the storage model. The sync
layer itself is Post-MVP (see §1.2).

---

## 12. Non-functional requirements (NFR)

Stated qualitatively per the working steer (Gate-1 decision 7). No numeric
thresholds are defined.

### 12.1 Performance

**NFR-PERF-01** `[MVP]` The PWA must load to an interactive state quickly enough
that it does not feel slow on a mid-range mobile device with a warm cache.

**NFR-PERF-02** `[MVP]` Navigation between the three surfaces (Dashboard, Capture,
Assistant) must feel instantaneous; there must be no perceptible delay between a
user tap and a visible response.

**NFR-PERF-03** `[MVP]` Transaction capture must complete — persisting the event
and updating the visible financial state — before the user has time to consider
whether it worked.

**NFR-PERF-04** `[MVP]` AI-driven features (insight generation, assistant
responses) may have higher latency than local operations; the UI must signal
loading state so the user is never left looking at a frozen interface.

### 12.2 Security & privacy

**NFR-SEC-01** `[MVP]` Sensitive financial data must be encrypted at rest. This
applies to all financial events, account data, and AI key material.

**NFR-SEC-02** `[MVP]` No financial data may leave the device except through the
explicit consent gates defined in §8. The consent system is a security boundary,
not only a UX one.

**NFR-SEC-03** `[MVP]` AI provider keys in bring-your-own-key mode must be treated
as secrets: encrypted on storage, never logged, never included in error messages
or telemetry.

**NFR-SEC-04** `[MVP]` The full-egress vs local-first tension (PRD §12.1) is held
deliberately and is not resolved in this SRS. Resolution — via consent + redacted-
egress-by-default + clear disclosure — is owned by the THREAT_MODEL (Benaiah).
This SRS encodes the consent and redaction requirements; the threat model encodes
the adversarial analysis.

**NFR-SEC-05** `[MVP]` (Gate-5 decision 27) The passphrase that derives the at-rest
encryption key (and the encrypted-export key, FR-PERSIST-08) must meet a **balanced**
quality bar: a sensible minimum length plus a strength check (zxcvbn-style), surfaced
through a live strength meter, blocking only genuinely weak passphrases. The bar must
not impose heavy composition rules that would deter the primary persona at setup.
Passphrase strength is load-bearing — it directly bounds the strength of at-rest
encryption (INV-PERS-02 / INV-KEY-03).

### 12.3 Modularity

**NFR-MOD-01** `[MVP]` The three pillars (Financial State, Financial Intelligence,
Financial Literacy) must be implemented as independently bounded modules. A failure
or unavailability of the AI layer must not prevent the Financial State layer from
operating.

**NFR-MOD-02** `[MVP]` The AI orchestration layer must be decoupled from all UI
components. UI surfaces must interact with AI through defined internal interfaces,
not by calling provider SDKs directly.

**NFR-MOD-03** `[MVP]` The consent and egress subsystem must be its own isolated
concern: no feature module may inspect or mutate consent state directly; all
consent reads and writes must go through the consent subsystem.

---

## 13. System constraints

Derived from the EXPOSED/HIDDEN model (intent §8) and the locked decisions.

**CON-01** The user interacts only with: financial state (Dashboard), transaction
capture (Capture), insights and recommended actions (Insight Feed + Action System),
and the learning/guidance chat (Assistant). All other system behaviour — AI
routing, event aggregation, model orchestration, prediction engine, context
building — is internal and must not require user understanding or intervention.

**CON-02** The product is a PWA. The mobile-first layout is the primary design
target; the product must be fully usable on a mobile browser without installation.

**CON-03** The persistence layer for the MVP is IndexedDB (local browser storage).
This is the sole data store for MVP. No separate backend database is required for
the client application.

**CON-04** The managed AI proxy is a thin **Go** service (locked decision 2, with
the language superseded to Go by Gate-4 decision 17; Gate-2 decision 8). It is
**multi-tenant hosted**: it serves multiple users from
a single deployment. It carries user identity and authentication, per-user
isolation, and per-user rate-limiting (see FR-AUTH). Despite this, the proxy
remains stateless with respect to financial data: it must not persist financial
context, transaction data, or AI responses between calls — it authenticates,
rate-limits, and routes. Managed mode therefore introduces a cloud dependency.
Bring-your-own-key mode carries no such dependency and remains fully local.

**CON-05** Multi-device sync is architecturally anticipated but must not ship in
the MVP. Any work that inadvertently builds sync behaviour in MVP scope is out of
scope and must be deferred.

---

## 14. Traceability

Every requirement group traces to a PRD pillar and loop. Nothing in this SRS
exists outside the PRD's boundaries.

| SRS group | PRD pillar | PRD loop | Intent section |
| --- | --- | --- | --- |
| FR-FS (Financial State) | §6.1 Financial State | Capture, Understand | Doc A §3.1, §6; Doc B §1 |
| FR-AI (Financial Intelligence) | §6.2 Financial Intelligence | Learn & Act (action) | Doc A §3.2, §5; Doc B §2 |
| FR-LRN (Financial Literacy) | §6.3 Financial Literacy | Learn & Act (learning) | Doc A §3.3, §7; Doc B §3 |
| FR-UI (User Interaction) | §7.2 Surfaces | All three loops | Doc A §9; Doc B §4 |
| FR-DE (Data & Event System) | §6.1, §6.2, §6.3 (foundation) | All three loops | Doc B §5 |
| FR-CONSENT (Consent & Egress) | §9.1 Privacy posture | Cross-cutting | Locked decision 1, Gate-1 decision 6 |
| FR-KEY (Key Handling) | §9.2 AI key handling | Cross-cutting | Locked decision 2 |
| FR-AUTH (Identity & Auth) | §9.2 AI key handling (managed mode) | Cross-cutting | Locked decision 2; Gate-2 decision 8 |
| FR-AIORCH (AI Orchestration) | §6.2 Financial Intelligence | Learn & Act | Doc A §5; Doc B §2.6 |
| FR-PERSIST (Persistence) | §9.3 Persistence & sync | Cross-cutting | Locked decision 3; Doc B §6.1 |
| NFR (Non-functional) | §5.1 Goals; §9.1–9.3 | Cross-cutting | Doc B §7 |
| CON (Constraints) | §5.2 Non-goals | — | Doc A §8; Doc B §8 |

---

## 15. Open questions for Y4NN before the CONTRACT

**OQ-01 — RESOLVED (Gate-2 decision 12).** CONTRACT specifies only the invariant
("no raw transactions in redacted-egress context") plus the FR-CONSENT-07 minimum
set. Per-feature redaction shapes are build-time implementation decisions owned by
Bezalel; they are not contract clauses. Keeps the CONTRACT lean.

**OQ-02 — RESOLVED (Gate-2 decision 11).** Export formats are JSON (lossless,
restore-capable primary), CSV, and XLSX (human-readable secondaries, may be lossy).
See FR-PERSIST-05 and FR-PERSIST-06.

**OQ-03 — RESOLVED (Gate-2 decision 8).** The managed proxy is multi-tenant
hosted, not Y4NN self-hosted for personal use. Per-user isolation and rate-limiting
are required. See FR-AUTH and CON-04.

**OQ-04 — RESOLVED (Gate-2 decision 9).** Consent state is stored in separate
browser storage (localStorage), distinct from the encrypted financial store. See
FR-CONSENT-03 and its SECURITY NOTE.

**OQ-05 — RESOLVED (Gate-2 decision 10).** Multiple providers (Gemini, NVIDIA NIM,
OpenAI) are mandatory at MVP launch. Fallback is cross-provider. See FR-AIORCH-01
and FR-AIORCH-05.

### Genuinely new open question introduced by the multi-tenant change

**OQ-06 — RESOLVED (Y4NN decision, 2026-06-05).** Client auth token storage and
session lifecycle for managed mode are now specified. The access token (15-minute
JWT) is held exclusively in non-persistent JavaScript module memory — never in
localStorage, sessionStorage, document.cookie, or any unencrypted persistent
store. The refresh token (long-lived opaque, rotating) is persisted exclusively in
the AES-GCM-encrypted IndexedDB store under the same master key as financial data
and BYO key material, readable only after WebAuthn/passphrase unlock. The
managed-edge session is coupled to store unlock state: when locked, no managed-edge
calls and no background token refresh occur; re-acquisition is transparent on
unlock. This coupling is correct by design (INV-PERS-01 and the encryption model
both require an unlocked store for managed-edge operation). These decisions
introduce no wire-format change — JSON body tokens with Authorization: Bearer are
preserved. The edge is additionally obligated to implement RFC 6749 rotation
reuse-detection (invalidate entire token family on presentation of a
previously-rotated token). Full invariant text: CONTRACT INV-AUTH-06 and
INV-AUTH-07. Architecture detail: ADR-0012 (Client auth session and token
storage).

---

*End of SRS v0.1 Rev 2026-06-05. This document owns WHAT/qualitative-HOW-MUCH.
Schemas, invariants, and API guarantees belong to CONTRACT (Zadok). All open
questions in §15 are resolved.*
