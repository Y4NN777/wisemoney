# Runbook — AI provider data-handling terms verification

| Field   | Value                                                                              |
| ------- | ---------------------------------------------------------------------------------- |
| Status  | Verified 2026-06-03 — pending legal sign-off + consent-UI provider naming          |
| Date    | 2026-06-03 (original stub: 2026-06-02)                                             |
| Scope   | Per-provider retention / training / opt-out verification before launch             |
| Source  | Intake Gate-5 decision 28; THREAT_MODEL §2.1 (I-EGR-01), §7 residual, §8 item 3; ADR-0011 |
| Blocker | **LAUNCH-BLOCKER** — must be completed before ship                                 |

> **No fabricated facts.** Every field in this document is sourced from the
> provider's published terms at the URL cited, verified on the date shown. Where a
> field is marked **UNVERIFIED**, the fact was not confirmed at verification time and
> must be chased before launch (see Acceptance actions). State uncertainty; do not
> assert a policy that has not been read.

---

## Why this is a launch-blocker

When a user grants full-egress consent, raw financial detail crosses to a
third-party AI provider. Provider-side logging, retention, and model-training are
outside the operator's control once egress occurs — this is the accepted residual
I-EGR-01 (THREAT_MODEL §2.1). The product's obligation is to verify and disclose
each provider's current terms, and to surface in the consent prompt exactly which
provider a given feature routes to (THREAT_MODEL M-EGR-03). This verification gates
ship (Gate-5 decision 28).

---

## Provider verification record

### OpenAI — API (platform)

| Field                        | Finding                                                                                       |
| ---------------------------- | --------------------------------------------------------------------------------------------- |
| Training on API traffic      | **No** — opt-in only, since 2023-03-01. "Data sent to the OpenAI API is not used to train or improve OpenAI models (unless you explicitly opt in)." |
| Retention                    | Up to **30 days** (abuse monitoring); then deleted.                                           |
| Training opt-out             | Default is already opted out; no action required.                                             |
| ZDR / enhanced data controls | Available — but approval-gated. Eligibility for **financial / non-HIPAA use: UNVERIFIED.**   |
| Certifications               | SOC 2 Type 2; HIPAA BAA available. PCI / GLBA applicability: **UNVERIFIED.**                 |
| Source URL                   | https://developers.openai.com/api/docs/guides/your-data                                       |
| Date verified                | 2026-06-03                                                                                    |
| Notes                        | `openai.com/enterprise-privacy` returned HTTP 403 at verification time — content **UNVERIFIED.** |

**Summary for ADR-0011 / managed mode:** OpenAI API does not train on API traffic by
default. If OpenAI is adopted as a future paid managed full-egress provider, ZDR
eligibility for financial use must be confirmed before activation.

---

### Gemini API — PAID tier (Google)

| Field               | Finding                                                                                                           |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Training on prompts | **No** (structural, paid tier). "Google doesn't use your prompts or responses to improve our products."          |
| Retention           | **55 days** (abuse-monitoring retention).                                                                         |
| Training opt-out    | Not required — training exclusion is structural on paid tier.                                                     |
| ZDR                 | Available via per-project application (see ZDR doc).                                                              |
| Vertex AI           | Stronger guarantee: "won't use your data to train generative AI models without your prior permission."            |
| Source URLs         | https://ai.google.dev/gemini-api/terms · https://ai.google.dev/gemini-api/docs/usage-policies · https://ai.google.dev/gemini-api/docs/zdr · https://docs.cloud.google.com/vertex-ai/generative-ai/docs/data-governance |
| Date verified       | 2026-06-03                                                                                                        |

**Summary for ADR-0011 / managed mode:** Gemini paid tier is compatible with a
future paid managed full-egress configuration. ZDR application is the activation
step. Vertex AI offers the strongest contractual data-governance guarantee.

---

### Gemini API — FREE tier (Google)

| Field               | Finding                                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Training on prompts | **Yes** — "Google uses the content you submit ... to ... improve ... and machine learning technologies."                             |
| Human review        | Permitted on free tier.                                                                                                              |
| Training opt-out    | **None available** on free tier.                                                                                                     |
| Managed-mode status | **BANNED for financial data.** Cannot carry raw financial detail regardless of consent.                                              |
| Source URL          | https://ai.google.dev/gemini-api/terms                                                                                               |
| Date verified       | 2026-06-03                                                                                                                           |
| Notes               | Free-tier retention duration (beyond the training use): **UNVERIFIED** — the terms state training use but do not specify a separate deletion period for API input. |

**Summary for ADR-0011:** Gemini free tier trains on submitted content with no
opt-out. It may only be used in managed mode when the structural payload cap
(INV-EGR-03a) ensures no raw financial detail (amounts, dates, merchants, notes)
is included in the egress payload. The cap is the enforcement boundary; Gemini free
must never receive raw financial data in any routing path.

---

### NVIDIA hosted API (Trial)

| Field                   | Finding                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Session retention       | §2.3: no retention beyond the session **except** security/abuse logging (§3.3) and a fine-tuning carve-out (inputs retained up to 30 days / outputs up to 90 days). |
| Training on content     | §3.3(iv): NVIDIA **uses submitted content to improve AI models with no opt-out mechanism.**                                                      |
| Financial/personal data | §4.3: **PROHIBITED.** "You shall not upload ... financial information ... personal information."                                                  |
| Managed-mode status     | **INCOMPATIBLE — contract breach.** WiseMoney financial data is prohibited by §4.3 and would feed model training under §3.3(iv). Removed from roster. |
| Trial vs. production    | These terms apply to the Trial tier. Production subscription terms are **UNVERIFIED** (a separate agreement). No production terms reviewed.       |
| Source URL              | NVIDIA API Trial ToS v2025-09-19 — https://assets.ngc.nvidia.com/products/api-catalog/legal/NVIDIA%20API%20Trial%20Terms%20of%20Service.pdf      |
| Date verified           | 2026-06-03                                                                                                                                       |

**Summary for ADR-0011:** NVIDIA hosted API is permanently removed from the
WiseMoney provider roster. §4.3 prohibition on financial data and §3.3(iv) training
with no opt-out are individually each sufficient to disqualify it. Combined, they
constitute both contract breach and a training-data exposure. No amount of consent
architecture resolves a contractual prohibition on the data type.

---

### NVIDIA self-hosted NIM

| Field               | Finding                                                                                                                                                     |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inference location  | Stays entirely on operator infrastructure. No data leaves the operator's environment.                                                                       |
| Telemetry           | Hardware and version metadata only. Disabled by default (`NIM_TELEMETRY_MODE=0`).                                                                           |
| Training on content | No training-on-inference language in the self-hosted model documentation reviewed.                                                                          |
| Managed-mode status | Architecturally compatible with any egress level (including full-egress). Deferred to a post-MVP infrastructure phase — not in scope for MVP launch.         |
| Source URL          | https://docs.nvidia.com/nim/large-language-models/1.15.0/introduction.html                                                                                  |
| Date verified       | 2026-06-03                                                                                                                                                   |

**Summary for ADR-0011:** Self-hosted NIM is noted as a viable future path for
full-egress managed mode. No action required at MVP; no router entry needed at
launch.

---

### OpenRouter

| Field                                    | Finding                                                                                                                                                                                       |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OpenRouter itself — training/retention   | OpenRouter **does not train on or retain request/response content.** Metadata only (routing, rate-limit accounting).                                                                           |
| Free (`:free`) models — training mandate | Free `:free` models **require enabling upstream training and logging** as a condition of access (upstream provider mandate). Cannot carry raw financial data regardless of structural cap.     |
| `data_collection:"deny"` / ZDR           | Setting `data_collection:"deny"` or using ZDR excludes providers that train on data — but this **makes free models unreachable** (they require training enabled). ZDR + paid only.            |
| Paid + ZDR                               | Safe for full-egress: routes only to providers with no-train guarantees. Operator cost applies.                                                                                               |
| Managed-mode status (MVP)                | Free `:free` models used as managed-mode primary aggregator. Egress is structurally capped to aggregate/redacted by INV-EGR-03a. Training on redacted payload is the accepted residual.      |
| UNVERIFIED items                         | (1) Exact free-model training-toggle label in the OpenRouter UI. (2) Which specific `:free` endpoints are ZDR-eligible (if any). Chase via: authenticated account + `GET https://openrouter.ai/api/v1/endpoints/zdr`. |
| Source URLs                              | https://openrouter.ai/docs/guides/privacy/provider-logging · https://openrouter.ai/docs/guides/features/zdr · https://openrouter.ai/docs/guides/privacy/data-collection · https://openrouter.ai/privacy |
| Date verified                            | 2026-06-03                                                                                                                                                                                    |

**Summary for ADR-0011:** OpenRouter free is the managed-mode primary aggregator at
MVP. It may only be used under the structural payload cap (INV-EGR-03a) which
ensures no raw financial detail egresses in managed mode. The free-model training
requirement is an accepted residual on redacted payloads, must be disclosed in the
consent UI, and does not require operator action to "opt out" because the cap makes
raw detail structurally unavailable to the provider.

---

## The decision (ADR-0011)

Resolved on 2026-06-03. Full record in `docs/adr/0011-mvp-ai-provider-strategy-managed-redacted-byo-key-full-egress.md`.

**Managed mode (MVP):** Redacted egress only, routed to OpenRouter free (primary)
and Gemini free (eligible), under the structural payload cap (INV-EGR-03a). No paid
provider configured. Free-model training on aggregate/redacted payloads is the
accepted residual; must be disclosed.

**Full-egress mode (MVP):** BYO-key only. User supplies their own API key, owns the
provider relationship and its terms, accepts the associated cost.

**NVIDIA hosted API:** Permanently removed from the roster. §4.3 financial data
prohibition and §3.3(iv) no-opt-out training are each independently sufficient to
disqualify it.

**Paid managed full-egress:** Deferred until operator budget is available. The
§10a consent-assertion gate is already the activation mechanism; a paid no-train
provider adapter is the only implementation change required when funded.

---

## Acceptance — remaining actions (Y4NN / ops)

The following actions must be completed before launch. None may be completed by an
agent; all are stateful or legal decisions.

**(a) Legal sign-off.**
Record legal sign-off on the provider posture documented here before launch. The
sign-off must acknowledge: (1) free-model training on redacted managed payloads as
accepted residual; (2) full-egress available only in BYO-key mode at MVP; (3) the
UNVERIFIED items below are chased and resolved or explicitly accepted as residuals.

**(b) Consent UI — provider naming.**
The consent prompt and onboarding must name the routing provider per feature
(THREAT_MODEL M-EGR-03): the free provider (OpenRouter / Gemini free) for managed
redacted features; the user's own BYO-key provider for full-egress features. Link
verified terms from the consent prompt. This is a UI implementation task.

**(c) Terms links in consent and onboarding.**
Embed the source URLs from this document into the consent prompt and onboarding
screens so users can review current provider terms independently. URLs must resolve
at ship time; re-check if provider publishes a new version.

**(d) Chase UNVERIFIED items before launch.**

| Item | Method | Owner |
| ---- | ------ | ----- |
| OpenAI ZDR — financial / non-HIPAA eligibility | Contact OpenAI enterprise; review ZDR agreement | Y4NN / legal |
| NVIDIA production subscription terms | Review production subscription agreement (separate from Trial ToS) | Y4NN / legal |
| OpenRouter free-model toggle label (UI) | Log in with authed account; locate training-enable toggle; record exact label | Y4NN |
| OpenRouter ZDR-eligible free endpoints | `GET https://openrouter.ai/api/v1/endpoints/zdr` (authed); record which `:free` model IDs are listed | Y4NN |
| Region / GDPR addenda | Review GDPR data-processing addenda for OpenAI, Google, OpenRouter where applicable | Y4NN / legal |
| Gemini free-tier retention duration | Re-read Gemini API terms; locate specific deletion/retention period for API input on free tier | Y4NN |

**(e) Periodic re-verification.**
Provider terms change without notice. Schedule re-verification of this document at
each milestone and before any provider-roster change. Date each re-verification in
this document and update the status header.

---

*Maintained by Sefer (Jehoshaphat). Stateful verification steps (legal review,
account-authenticated API calls, sign-off recording) are prepared here for Y4NN to
execute — not executed by an agent.*
