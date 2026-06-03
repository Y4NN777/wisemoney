# WiseMoney — Product Requirements Document

| Field | Value |
| --- | --- |
| **Title** | WiseMoney — Product Requirements Document |
| **Date** | 2026-06-02 |
| **Version** | PRD v0.1 (derived from intent v0.1) |
| **Status** | Draft |
| **Owner** | Nehemiah (PM) |
| **Source** | `docs/intake/intent-v0.1.md` (Document A — Product Spec v0.1; Document B — Feature Set v0.1) |

> This document states **what** WiseMoney must do and **why**. It does not
> specify how — no schemas, APIs, or implementation. The software requirements
> (SRS) follow separately and own the *how-much* and *how*.

---

## 1. Executive summary

WiseMoney is a local-first personal finance progressive web app (PWA) that
unifies three capabilities most tools keep separate: real-time financial state
tracking, AI-driven financial guidance, and adaptive financial education. It is
positioned as a *daily financial intelligence system* — not merely a transaction
tracker — built around a minimal, mobile-first interaction loop. The product's
purpose is to make a person's financial reality instantly legible, tell them what
to do next, and grow their financial literacy over time, all from a single device
with data held locally by default and any cloud egress gated behind explicit,
per-feature user consent.

---

## 2. Problem statement

People routinely lack a clear, current, trustworthy picture of their own money.
The friction is threefold and compounding:

- **State is opaque.** Balances, cash flow, budgets, and recurring obligations
  live across accounts and apps; assembling a single current picture is manual
  and rarely done, so the true position is usually unknown between statements.
- **Insight is absent.** Even when the numbers are visible, most tools stop at
  display. They do not interpret patterns, flag risks, project where the month
  ends, or say what to do — leaving the user to draw conclusions they are not
  equipped to draw.
- **Understanding never grows.** Users repeat the same financial mistakes because
  nothing teaches them *why* a behaviour is costly, in the moment it matters.
  Generic financial education is disconnected from the user's actual behaviour.

The result is decisions made on stale, partial, or misunderstood information.
WiseMoney exists to close all three gaps in one continuous daily loop: an
always-current picture, actionable guidance on top of it, and learning embedded
in the act of using the product.

---

## 3. Vision / core product definition

Anchored on the final definition in intent §9:

> **WiseMoney is a local-first financial operating system combining real-time
> money tracking, AI-driven financial intelligence, and adaptive financial
> education — all delivered through a minimal mobile-first interaction loop.**

The core objective (intent §2) is to help users clearly understand four things:
(1) where their money is, (2) what their financial situation is, (3) what they
should do next, and (4) how to improve their financial literacy over time. Every
capability in this document exists to serve one of those four understandings.

---

## 4. Target users & personas

> **INFERRED.** The intent does not name a target audience or supply market data.
> The personas below are reasonable inferences from the product's stated objective,
> its mobile-first single-device posture, and its literacy/coaching emphasis. They
> are working assumptions, **not** validated segments. No market size, adoption, or
> preference figures are claimed.
>
> **Y4NN decision (2026-06-02):** the **Overwhelmed Tracker** is the **sole primary
> persona for the MVP**. The other two are secondary / future — recorded so their
> needs stay visible, but MVP prioritisation serves the primary first.

- **The Overwhelmed Tracker — PRIMARY (MVP, inferred).** Wants to know where their
  money is and feels behind on it. Has tried tracking apps and abandoned them due to
  effort. Needs capture to be near-frictionless and the current position to be
  obvious at a glance. Values being *told what to do*, not just shown numbers. **The
  MVP is designed for this person first.**
- **The Improving Learner — secondary/future (inferred).** Motivated to get better
  with money but lacks vocabulary and confidence. Benefits most from learning tied
  to their own real transactions, delivered conversationally and progressively. The
  learning pillar serves this persona; not the MVP's primary optimisation target.
- **The Privacy-Conscious User — secondary/future (inferred).** Comfortable with AI
  assistance but wants to know exactly what leaves their device and to control it per
  feature. The local-by-default posture and explicit consent gate matter to this
  persona, but the MVP is not primarily tuned to them.

---

## 5. Goals & non-goals

### 5.1 Goals

- Maintain a continuously accurate, instantly legible picture of the user's
  financial state (balances, cash flow, categories, budgets, recurring items).
- Turn that state into interpretation: insights, risks, recommendations, and
  forward-looking projections the user can act on.
- Embed financial learning in daily use — context-aware, behaviour-triggered,
  progressive — so understanding improves through normal usage.
- Keep user-facing complexity minimal: the user adds money events, views state,
  and receives guidance/learning; all orchestration is hidden (intent §8.3).
- Keep data local-first by default, with any cloud/AI egress gated behind clear,
  explicit, per-feature consent.

### 5.2 Non-goals

These are explicitly **out of scope** for the MVP and are stated so they are not
silently assumed in:

- **Multi-device sync** — out of MVP (locked decision 3; intent §6.2). The product
  is single-device, local-only for the MVP; the architecture is sync-ready but
  sync itself is future work.
- **An investment / brokerage / trading platform** — WiseMoney gives guidance
  and education, not securities transactions, portfolio management, or trade
  execution. Investment *fundamentals* appear only as optional learning content
  (intent §3.3 / Document B §3.3), never as a trading capability.
- **A bank-aggregation / account-linking product** — there is no automated
  connection to financial institutions, no statement import via banking APIs, no
  open-banking integration. Accounts and transactions are user-maintained.

---

## 6. The three pillars (product capabilities)

Three **equal** pillars (intent §3), independent but connected through shared
financial state:

- **6.1 Financial State — the reality layer.** Continuously maintains a clear,
  current view of income, expenses, balances, budgets, categories, and trends.
  This is the primary product anchor; intelligence and learning both depend on it.
- **6.2 Financial Intelligence — the decision layer.** Interprets financial state
  into insights, risk flags, recommendations, projections, and behavioural
  patterns. Answers "what should I do next?".
- **6.3 Financial Literacy — the education & growth layer.** Structured, adaptive
  learning delivered conversationally and tied to the user's own behaviour, so
  understanding improves over time. Answers "why is this happening, and how do I
  get better?".

---

## 7. UX loops & surfaces

### 7.1 The three UX loops (intent §4)

- **Capture** — log income / expense / transfer / recurring quickly. *Goal:* keep
  financial state accurate with minimal effort.
- **Understand** — see current position, category breakdown, trends, and budget
  status. *Goal:* instant clarity.
- **Learn & Act** (dual output) — (A) an *action* output: recommendations,
  warnings, optimisation; and (B) a *learning* output: explanations and guided
  learning tied to real behaviour. *Goal:* improve both behaviour and understanding.

### 7.2 The three surfaces (intent §9, mobile-first)

- **Dashboard** — the financial-state snapshot; clear, glanceable current position.
- **Capture** — fast, minimal-step transaction entry.
- **Assistant** — the chat-based surface combining AI guidance and learning.

The loops and surfaces map directly: Capture loop → Capture surface; Understand
loop → Dashboard surface; Learn & Act loop → Assistant surface (with action and
learning outputs both surfaced to the user).

---

## 8. Use cases / user journeys (core loops)

Illustrative journeys for the three loops. They describe user-observable behaviour
only.

- **8.1 Capture a daily expense (Capture loop).** The user opens the app, enters a
  spend in a few steps (amount, category, optional note), and the financial state
  updates immediately. The journey must succeed even when the device is offline.
- **8.2 Understand current position (Understand loop).** The user opens the
  Dashboard and within seconds sees total balance, income-vs-expense, category
  breakdown, budget status, and monthly position — without manual assembly.
- **8.3 Receive and act on guidance (Learn & Act — action).** The user is alerted
  to a budget anomaly or projected month-end shortfall and is offered a concrete
  recommended action (e.g. a budget adjustment or spending correction) they can
  accept or dismiss.
- **8.4 Learn in context (Learn & Act — learning).** Prompted by their own
  behaviour (e.g. overspending in a category), the user asks the Assistant "why am
  I overspending?" or "how do budgets work?" and receives an explanation tied to
  their real transactions, pitched to their current level.
- **8.5 Grant egress consent for richer AI (cross-cutting).** Before any feature
  sends raw financial detail to an AI provider, the user is shown clearly what will
  be sent and why, and explicitly consents per feature. The user can decline and
  still use the feature in a reduced/redacted form, or revoke later. (See §9.)

---

## 9. Product-level constraints (the four locked decisions)

The four locked initialisation decisions (intent, "Locked initialisation
decisions") are restated here as binding **product** constraints:

- **9.1 Privacy posture — full egress, user-consented.** Raw financial detail MAY
  be sent to AI providers for richer guidance, but only behind clear, explicit,
  **per-feature** consent. **Consent UX is a first-class product requirement**, not
  a checkbox: the user must understand what leaves the device, for which feature,
  and why, and must be able to decline and to revoke. This is a user-facing feature
  with its own design and acceptance bar.
  - **Declined-consent fallback — redacted egress (Y4NN decision, 2026-06-02).**
    When the user declines egress for an AI feature, the feature still functions in
    a **redacted** mode: only aggregated / derived summaries (totals, category
    breakdowns, trends) may be sent — **raw transactions never leave the device**.
    Redacted egress is the default fallback across AI features; full-detail egress
    is the opt-in upgrade.
- **9.2 AI key handling — both modes.** The product supports two coexisting modes,
  chosen by the user: a managed mode where provider keys are held server-side so
  the client never sees them, and a bring-your-own-key mode where the user supplies
  their own keys, stored encrypted on-device. From the user's perspective this is a
  choice about who holds the keys; the capability set is the same.
- **9.3 Persistence & sync — single-device, local-only (MVP).** Data lives in
  encrypted on-device storage; backup and restore are via user-driven file export.
  Multi-device sync is out of MVP scope (see §5.2 and §11).
- **9.4 Init scope — full sequence, gated.** The project runs the full
  specification sequence with a pause at each consequential step. (Process
  constraint; recorded here for completeness.)

---

## 10. Success criteria (observable)

From intent §10, framed so each is observable rather than aspirational. These are
the conditions under which the product is judged successful.

> **Y4NN decision (2026-06-02): success criteria stay qualitative — no KPI gates.**
> WiseMoney is a pragmatic personal-use product, not enterprise guidance
> software. The goal is a product that is genuinely *good to use*; it is judged by
> the qualitative conditions below, not by quantified thresholds, SLAs, or metric
> dashboards. No numeric targets are defined, by intent.

- **Instant comprehension.** A user can state their current financial position
  within seconds of opening the Dashboard, without manual assembly.
- **Daily, frictionless use.** Users open the app and capture activity as a daily
  habit; capture is low-effort enough not to be abandoned.
- **Behaviour improvement.** Over repeated use, users act on guidance and their
  financial behaviour measurably improves (e.g. fewer budget overruns over time).
- **Active learning.** Users engage the Assistant to learn, and learning is
  triggered by and tied to their real behaviour.
- **Clarity becomes automatic.** Maintaining financial clarity shifts from a
  manual chore to an automatic by-product of using the product.

---

## 11. Out-of-scope / future

Capabilities deliberately deferred beyond the MVP. Recorded so they are tracked,
not forgotten, and so the MVP architecture can remain ready for them without
building them now:

- **Sync layer (intent §6.2).** Multi-device sync, conflict resolution, and
  background sync. The MVP is sync-ready by design but ships single-device.
- **Investment-fundamentals expansion (intent §3.3 / Document B §3.3).** Investment
  content is an *optional* future expansion of the learning library, not an MVP
  capability — and remains educational only, never a trading function (see §5.2).

---

## 12. Open questions & risks

- **12.1 Local-first vs full-egress tension (product risk — OWNED by THREAT_MODEL).**
  The product's "local-first" identity and Document B §7.2 ("local-first sensitive
  data handling") are in direct, deliberate tension with locked decision 1 (full,
  consented egress of raw financial detail to AI providers). This tension is **not
  resolved in this PRD.** It is held intentionally and is owned by the THREAT_MODEL
  (Benaiah), whose resolution direction is consent + redaction-by-default options +
  clear data-egress disclosure — explicitly **not** silent reconciliation. Recorded
  here as the headline product risk so it stays visible through the spec sequence.
- **12.2 Personas unvalidated (see §4).** Target users are inferred, not validated.
  *Partially resolved (2026-06-02):* Overwhelmed Tracker fixed as sole MVP primary;
  the inferences themselves remain to be validated with real users.
- **12.3 Success criteria — RESOLVED (2026-06-02).** Kept intentionally qualitative;
  no KPI quantification, by Y4NN decision (see §10). Closed.
- **12.4 Declined-consent fallback — RESOLVED (2026-06-02).** Fallback is **redacted
  egress** (aggregated/derived summaries only; raw transactions never leave the
  device), default across AI features (see §9.1). Per-feature *redaction shape*
  (exactly which summaries each feature sends) is detailed downstream in the SRS.

---

*End of PRD v0.1. Next in sequence: SRS (Nathan). This document is WHAT/WHY only;
the SRS owns requirements detail and the HOW boundary begins there.*
