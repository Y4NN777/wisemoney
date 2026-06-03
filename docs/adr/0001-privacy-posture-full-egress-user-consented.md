# ADR-0001: Full-egress, user-consented privacy posture with redacted-egress default

| Field   | Value                                                    |
| ------- | -------------------------------------------------------- |
| Status  | Accepted                                                 |
| Date    | 2026-06-02                                               |
| Source  | Intake locked decision 1; Gate-1 decision 6             |
| Binds   | INV-EGR-01, INV-EGR-02; PRD §9.1; FR-CONSENT-07         |

## Context

WiseMoney's value depends on sending financial detail to third-party AI
providers (Gemini, NVIDIA NIM, OpenAI, others) for richer guidance. This is in
direct, deliberate tension with the product's "local-first" identity and Document B
§7.2 ("local-first sensitive data handling"). The tension cannot be silently
reconciled: a decision was required on what may leave the device and under what
condition.

## Decision

Raw financial detail **may** be sent to AI providers, but only behind **clear,
explicit, per-feature user consent**. Consent UX is a first-class functional
requirement, not a checkbox — the user must understand what leaves the device, for
which feature, and why, and must be able to decline and to revoke.

When a user **declines** egress for an AI feature, the feature still functions in a
**redacted** mode (Gate-1 decision 6): only aggregated / derived summaries (period
totals per category, income/expense totals, net cash flow, budget status as a
percentage, goal progress as a percentage, trend direction — the FR-CONSENT-07
minimum set) may be sent. **Raw transactions never leave the device** in this mode.
Redacted egress is the **default** across AI features; full-detail egress is the
opt-in upgrade.

## Consequences

- Consent is an isolated subsystem and the single producer of any egress-shaped
  context (ARCHITECTURE §2.1, NFR-MOD-03). No feature module shapes its own egress.
- The redacted-egress ceiling (INV-EGR-01) and the per-feature full-egress gate
  (INV-EGR-02) become binding invariants; consent for one feature never extends to
  another.
- A residual, irreducible risk is accepted: once full-egress data crosses to a
  provider, provider-side retention and model-training are outside operator control
  (THREAT_MODEL §2.1, I-EGR-01). This is disclosed to the user, not engineered away.
- Provider data-handling terms must be verified and linked before launch (see
  ADR-0008 context and intake decision 28; tracked in Sprint S0).

## Alternatives considered

- **Local-only, no egress.** Rejected — it removes the AI-guidance and learning
  pillars that define the product (intent §3.2, §3.3).
- **Blanket / one-time consent.** Rejected — per-feature consent is the locked
  decision; blanket consent would make the consent model meaningless (INV-EGR-02).
- **Hard-fail when consent is declined.** Rejected — Gate-1 decision 6 chose a
  graceful redacted fallback so declining never breaks a feature.
