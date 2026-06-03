# Runbook — AI provider data-handling terms verification

| Field      | Value                                                  |
| ---------- | ------------------------------------------------------ |
| Status     | STUB — verification not yet performed (Sprint S0)      |
| Date       | 2026-06-02                                              |
| Scope      | Verifying & linking AI provider retention / training-opt-out terms before launch |
| Source     | Intake Gate-5 decision 28; THREAT_MODEL §2.1 (I-EGR-01), §8 item 3 |
| Blocker    | **LAUNCH-BLOCKER** — must be completed before ship      |

> **TODO: to be completed by the owner of this verification before MVP launch.** This
> is an ops/legal item, **not** a code item. **No provider terms or specifics may be
> fabricated here** — provider terms change and must be checked against the providers'
> current published terms at verification time, then linked.

## Why this is a launch-blocker

When a user grants full-egress consent, raw financial detail crosses to a third-party
AI provider. Provider-side logging, retention, and model-training are **outside the
operator's control** once egress occurs (THREAT_MODEL §2.1, I-EGR-01 — a residual,
accepted-by-design risk). The product's obligation is to **verify and disclose** each
provider's current terms and surface, in the consent prompt, exactly which provider a
feature routes to. This verification gates ship (Gate-5 decision 28).

## Providers to verify (each TODO)

For each provider, record: data-retention policy, model-training / training-opt-out
terms, the URL of the term, and the date verified.

- **Gemini (Google)** — TODO: retention; training opt-out; source URL; date verified.
- **NVIDIA NIM** — TODO: retention; training opt-out; source URL; date verified.
- **OpenAI** — TODO: retention; training opt-out; source URL; date verified.

## Procedure (to be completed)

- TODO: locate each provider's current data-handling / API data-usage terms.
- TODO: confirm whether API traffic is excluded from model training (and how to opt out
  where required).
- TODO: link verified terms from the consent prompt and onboarding (THREAT_MODEL
  M-EGR-03); name the specific provider per feature in the consent UI.

## Acceptance (to be completed)

- TODO: all three providers verified, dated, and linked; consent prompt names the
  routing provider per feature. Sign-off recorded before launch.

> No fabricated facts: leave each field as TODO until verified against the provider's
> own current terms. State uncertainty explicitly rather than asserting a policy.
