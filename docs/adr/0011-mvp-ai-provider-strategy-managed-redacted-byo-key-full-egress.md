# ADR-0011: MVP AI provider strategy — managed redacted-only via free models; full-egress BYO-key only; NVIDIA hosted dropped

| Field    | Value                                                                                    |
| -------- | ---------------------------------------------------------------------------------------- |
| Status   | Accepted                                                                                 |
| Date     | 2026-06-05                                                                               |
| Diátaxis | Explanation                                                                              |
| Source   | T-S0-02; ARCHITECTURE §9a/§9b; THREAT_MODEL §2.1 (I-EGR-01), §7 residual; CONTRACT §8 MVP-scoping note |
| Binds    | `services/edge` AI router; consent-assertion wire (ARCHITECTURE §10a); INV-EGR-03 (as amended by ADR-0008); ADR-0001, ADR-0002 |

## Context

The WiseMoney edge proxy (ADR-0005) performs AI provider routing and fallback for
managed-mode users. ADR-0001 established the privacy posture (full-egress,
user-consented; redacted-default). ADR-0002 established the dual key-mode split
(managed proxy vs. bring-your-own-key). ADR-0008 amended INV-EGR-03 to formalise
the enforcement mode-split: managed = server-boundary structural payload cap +
signed consent assertion; BYO-key = client-side, user-as-principal.

The MVP provider roster must now be determined. At Sprint S0 the edge is scaffolded
but no live provider is configured. Three decisions are pending:

1. Which providers may be used in **managed mode** at MVP, and under what egress
   constraint.
2. Which providers are available for **BYO-key mode** at MVP.
3. Whether NVIDIA hosted API remains on the roster at all.

## Decision Drivers

- **Zero operator budget for paid AI at MVP.** OpenAI and paid-tier Gemini API are
  cost-prohibitive as operator-funded managed-mode providers.
- **NVIDIA hosted API is contractually incompatible.** NVIDIA API Trial ToS §4.3
  prohibits uploading financial or personal data. §3.3(iv) uses submitted content
  to improve AI models with no opt-out mechanism. These two clauses together make
  any WiseMoney managed-mode use of the hosted NVIDIA API a contract breach and a
  training-data leak — incompatible with the project regardless of budget.
- **Free-model providers require enabling upstream training and logging.** OpenRouter
  free (`:free`) models mandate enabling training/logging as an upstream provider
  requirement. Gemini API free tier trains on submitted content with no opt-out.
  Neither provider may carry raw financial detail in managed mode under these terms.
- **The structural payload cap makes free-model use safe for managed mode.** The
  ARCHITECTURE §10a / INV-EGR-03a enforcement boundary ensures that managed egress
  is structurally capped to aggregate/redacted data — amounts, dates, merchants,
  and notes never cross the wire in managed mode. Under that constraint, upstream
  training on the aggregate/redacted payload is an accepted residual (THREAT_MODEL
  §7), not a privacy breach.
- **Full-egress on raw financial detail requires a paid no-train provider.** No free
  provider offers a no-train guarantee on raw financial data. A paid, no-train,
  zero-data-retention (ZDR) provider (OpenAI ZDR-eligible or Gemini paid+ZDR) would
  satisfy this requirement but is unaffordable as an operator cost at MVP.
- **BYO-key mode shifts provider cost and provider-choice to the user.** Users who
  need full-egress can supply their own paid API key; they own the cost and accept
  the terms of their chosen provider. This satisfies the full-egress use-case without
  operator expenditure and without a training-data contract exposure on the operator.
- **The §10a consent-assertion gate is already the activation mechanism for paid
  managed full-egress.** When a paid provider adapter is added later, the consent
  gate requires no structural change — the adapter is the only addition needed.

## Considered Options

### Option A: Defer all AI, no provider configured at MVP

Ruled out. Financial Intelligence and Financial Literacy pillars are core product
surfaces, not optional. Deferring all AI empties the product of its intelligence
layer at launch.

### Option B: Managed mode using free providers, raw financial egress permitted

Ruled out. Free providers require enabling training/logging; raw financial detail
(amounts, dates, merchants) would feed upstream model training. This breaches the
consent model (users consent to redacted default, not raw training) and conflicts
with THREAT_MODEL I-EGR-01.

### Option C: Managed mode using free providers, REDACTED egress only (chosen)

The structural payload cap (INV-EGR-03a) independently enforces that managed
egress is aggregate/redacted. Free providers may train on that payload; the cap
ensures no raw financial detail is exposed. Training residual is disclosed and
accepted. This is the only option that is both $0 operator cost and consistent with
the privacy posture.

### Option D: NVIDIA hosted as fallback provider in managed mode

Ruled out. NVIDIA API Trial ToS §4.3 explicitly prohibits financial/personal data.
§3.3(iv) allows NVIDIA to use submitted content for model improvement with no
opt-out. Production NVIDIA subscription terms are unverified (T-S0-02 open item).
No configuration of this provider is compatible with managed-mode WiseMoney data.

### Option E: Self-hosted NVIDIA NIM

Not selected for MVP but not ruled out for later. Self-hosted NIM inference stays
entirely on operator infrastructure; telemetry is hardware/version metadata only
and disabled by default (`NIM_TELEMETRY_MODE=0`). No training-on-inference language
is present in the self-hosted model. This is architecturally compatible with full
egress and satisfies the privacy posture. It is deferred because it requires
infrastructure not in scope for MVP.

## Decision

**1. Managed mode — redacted egress only, free providers, MVP.**
Managed-mode AI routing targets OpenRouter free (primary aggregator) and Gemini
API free tier (eligible). Egress from managed mode is structurally capped to
aggregate/redacted payloads by the ARCHITECTURE §10a enforcement boundary
(INV-EGR-03a). No raw financial detail — amounts, dates, merchants, notes — is
permitted to egress in managed mode regardless of user consent level. Free
providers may train on aggregate/redacted payloads; this is an accepted residual
(THREAT_MODEL §7) and must be disclosed in the consent UI and onboarding. No paid
provider is configured as an operator-funded managed-mode backend at MVP.

**2. Full-egress — BYO-key mode only, MVP.**
Full-egress of raw financial detail is available exclusively in BYO-key mode, where
the user supplies their own API key, owns the provider relationship, and accepts
that provider's terms. The operator incurs no provider cost for full-egress traffic.
INV-EGR-03 (as amended by ADR-0008) remains in force: in BYO-key mode the user is
the principal and enforcement is client-side.

**3. NVIDIA hosted API — permanently removed from the roster.**
NVIDIA hosted API is removed from the provider roster before any code references
it. It is not configured, not stubbed, and not treated as a future fallback in
managed mode. Reconsideration is limited to self-hosted NVIDIA NIM, which is
architecturally compatible and deferred to a post-MVP infrastructure phase.

**4. Paid managed full-egress — deferred.**
Paid managed full-egress (OpenAI ZDR-eligible, Gemini paid+ZDR, or
OpenRouter `data_collection:deny` + paid) is deferred until operator budget is
available. When added, the §10a consent-assertion gate is already the activation
mechanism; adding a paid no-train provider adapter is the only implementation
change required.

## Consequences

### Positive

- **$0 operator provider cost at MVP.** Free-tier providers carry the managed
  intelligence load at launch.
- **The structural payload cap (INV-EGR-03a) is independently valuable.** It is
  the enforcement boundary for the privacy posture — not merely a workaround for
  free-provider training terms. It should be documented and disclosed as such.
- **Full-egress is available now.** BYO-key users can perform raw financial egress
  immediately at launch, at no operator cost and with no provider contract exposure
  on the operator.
- **Provider extensibility is unchanged.** The router is designed for multi-provider
  fan-out and fallback (INV-PROXY-04). Adding a paid adapter later does not require
  structural change; only the adapter and a consent-gate activation are needed.
- **NVIDIA removal eliminates a legal risk pre-code.** Removing an incompatible
  provider before any code is written to support it avoids a future refactor and
  removes a compliance exposure entirely.

### Negative

- **Managed-mode users cannot perform full-egress at MVP.** A user who wants
  full-egress raw financial AI analysis must use BYO-key mode, accepting the
  associated provider cost and key-management responsibility.
- **Free providers train on aggregate/redacted managed payloads.** This is an
  accepted residual, but it is a real constraint that must be disclosed clearly in
  the consent prompt and onboarding (THREAT_MODEL M-EGR-03).
- **Managed fallback depth is shallow.** At MVP the managed AI roster has two
  sources (OpenRouter free, Gemini free). If both are unavailable, managed AI
  features degrade entirely. No paid fallback exists.

### Risks

- **Free-model quality and availability.** Free provider tiers offer lower
  reliability and model capability than paid tiers. Mitigation: the structural
  payload cap limits managed egress to aggregate/redacted context, which is
  within the capability range of available free models; INV-PROXY-04 governs
  fallback behaviour; a single paid-adapter addition is the upgrade path.
- **Provider terms change.** The training and retention policies verified in
  T-S0-02 may change without notice. Mitigation: T-S0-02 schedules periodic
  re-verification; the consent UI must name the routing provider per feature so
  users can review current terms independently.
- **Product-UX risk: managed feels feature-limited.** Users who want full-egress
  and discover they must switch to BYO-key mode may experience the product as
  incomplete. Mitigation: clear onboarding communication about the mode-split
  rationale; clear upgrade path once paid managed full-egress is funded.
- **OpenAI ZDR financial eligibility unverified.** T-S0-02 notes that OpenAI ZDR
  eligibility for financial/non-HIPAA use is unverified. This does not affect the
  MVP decision (no paid managed provider at MVP) but must be resolved before any
  future paid managed full-egress implementation.

## References

- ARCHITECTURE §9a (managed-mode routing), §9b (BYO-key routing), §10a
  (consent-assertion wire; structural payload cap)
- THREAT_MODEL §2.1 (I-EGR-01 — provider-side retention residual), §7 (accepted
  residuals), M-EGR-03 (consent UI must name routing provider per feature)
- CONTRACT §8 (MVP-scoping note on provider posture)
- ADR-0001 (full-egress, user-consented privacy posture)
- ADR-0002 (dual AI key modes)
- ADR-0008 (egress-enforcement mode-split; INV-EGR-03 amendment)
- T-S0-02 (provider terms verification — launch-blocker; see
  `docs/runbooks/provider-terms-verification.md`)
- NVIDIA API Trial ToS v2025-09-19 — §3.3(iv), §4.3
  https://assets.ngc.nvidia.com/products/api-catalog/legal/NVIDIA%20API%20Trial%20Terms%20of%20Service.pdf
- OpenRouter privacy docs — https://openrouter.ai/docs/guides/privacy/provider-logging
- Gemini API terms — https://ai.google.dev/gemini-api/terms
