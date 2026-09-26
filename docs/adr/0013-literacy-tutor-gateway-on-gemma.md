# ADR-0013: Literacy tutor on a dedicated Gemma gateway with zero vault egress

| Field    | Value |
| -------- | ----- |
| Status   | Proposed (awaiting Y4NN's approval before `api/learn` is built) |
| Date     | 2026-09-26 |
| Diátaxis | Explanation |
| Source   | Y4NN 2026-09-26 ("wire the learning AI to also gemma with another api key … knowledge related more to international and local financial literacy"); research log `docs/research/2026-09-26-literacy-gemma.md`; plan `docs/plans/first-session-wisebot-literacy.md` Track 3; `docs/WISEBOT_KNOWLEDGE_ARCHITECTURE.md` (2026-08-30, deferred); ADR-0001, ADR-0002, ADR-0011; CONTRACT INV-EGR-01/02/03 |
| Binds    | `apps/web/api/learn/*` (new gateway); `apps/web/src/pillars/literacy`; `apps/web/src/consent/consentStore.ts` (new feature key); literacy corpus v0 (`docs/literacy/corpus-v0.md`); Vercel env `LITERACY_GEMINI_API_KEY` |

## Context

The help chat (WiseBot) already runs on Gemma through the Gemini API with a
server-held key and a trusted product-help corpus (`api/help/_helpGateway.ts`).
The literacy pillar (`pillars/literacy`) still routes "teaching" through the
general orchestration layer, so without a BYO provider key it is unavailable, and
its concept library is three placeholder entries. Y4NN wants the tutor on Gemma
too, with its own key, and grounded in international and Burkina/UEMOA financial
literacy rather than generic content.

The research log establishes the constraint that shapes this decision: on the
Gemini API, Gemma is served on the free tier only, and free-tier traffic is
"Unpaid Services" data — Google may use it to improve products and human
reviewers may read it, whatever the billing state of the project [S6][S8]. The
help gateway already discloses this and never carries vault data. A tutor that
sent even FR-CONSENT-07 aggregates (period totals, budget percentages) to that
endpoint would put financial data under training and human-review terms, which
ADR-0011 explicitly avoided for managed mode ("no paid no-train provider is
configured").

## Decision

1. **A second gateway, `api/learn`, mirrors the help gateway** (same-origin
   check, payload caps, model allow-list, streaming, local admission quota) and
   uses its own key, `LITERACY_GEMINI_API_KEY`, from a separate Google Cloud
   project. The model is pinned server-side to `gemma-4-26b-a4b-it`; the key
   never reaches the client (INV-KEY-01).
2. **Zero vault egress on the managed tutor.** The request carries only: the
   typed question, the locale, up to eight prior turns, the ids of the grounding
   units, and the safe context shape already used by help (surface, entry
   point). No amounts, balances, merchants, categories, budget or goal figures,
   no aggregates, no images. This is structural: the gateway schema rejects any
   other field, so it holds independently of client consent state (INV-EGR-03(a)).
3. **Two question classes, two paths.** "General" teaching (what a tontine is,
   how mobile-money fees work) goes to `api/learn` when it is configured.
   "Personal" teaching that must reference the user's own data (FR-LRN-02,
   "why am I overspending?") stays on the user's BYO provider under the existing
   consent and redaction rules (ADR-0011). The tutor states which path answered.
   When `api/learn` is not configured, the whole pillar keeps today's BYO-only
   behaviour.
4. **Grounding is corpus v0, in the bundle.** Thirty-two bilingual units
   (`docs/literacy/corpus-v0.md`) ship as data next to the help corpus, retrieved
   lexically like product-help tasks, sent to the model as trusted context, and
   readable offline. Pinecone and the full architecture in
   `WISEBOT_KNOWLEDGE_ARCHITECTURE.md` stay deferred until the corpus outgrows
   lexical retrieval, per that document's own boundary.
5. **Its own consent and disclosure.** A separate per-feature consent key
   (INV-EGR-02) with the same one-line pattern as help ("Questions go to Google.
   Nothing from your vault."), plus a permanent "education, not advice" line in
   the tutor surface. Regulatory figures and fees in answers carry the unit's
   "as of" date.

## Consequences

- The managed tutor is usable with no account and no BYO key, at the price of
  answering only from the question and the corpus: it cannot personalise. That
  is the same trade-off the help chat already makes, and it keeps ADR-0011's
  managed-mode posture intact.
- A second Google project isolates quota and key rotation from help, and lets
  the literacy key be revoked without touching WiseBot.
- If a no-training guarantee becomes a product requirement, the durable upgrade
  is Vertex AI MaaS with the same model id; the gateway boundary is the only
  thing that changes. Not needed for MVP.
- Corpus quality is now a product surface: units citing BCEAO texts, operator
  fee grids or FEWS NET seasons need a review cadence (proposed: quarterly, and
  on every regulatory change). Gaps that need original writing and local expert
  review are listed in the research log §B.
- Residual: free-tier rate limits are unverified; the local admission quota
  bounds abuse per device but a global cap must be watched after launch.

## Alternatives considered

- **Reuse the help key and gateway.** Rejected: one quota for two products, one
  revocation blast radius, and a consent line that would have to cover both.
- **Route teaching through the Go edge (managed redacted).** Rejected for MVP:
  the edge is not deployed, and the destination would still be free-tier Gemma
  under training terms, so aggregates could not be sent anyway.
- **OpenRouter Gemma with the no-training account setting.** Rejected: a third
  party in the trust story for no functional gain; per-token cost.
- **Pinecone RAG now.** Rejected: thirty-two units do not need a vector index;
  the architecture document reserves it for a larger corpus.
