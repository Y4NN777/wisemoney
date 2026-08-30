# WiseBot knowledge and tutoring architecture

| Field | Value |
| --- | --- |
| Status | Proposed, deferred until the current product-polish pass is complete |
| Date | 2026-08-30 |
| Scope | Financial-education corpus, retrieval-augmented generation (RAG), web evidence, and the path to agentic actions |
| Decision owner | Project maintainers |

This document records the direction agreed for the next generation of WiseBot. It
does not start that implementation and does not change the current `1.0.0`
release. The immediate product priority remains polishing WiseMoney and resolving
user-facing ambiguities.

The target is not a larger generic chatbot. WiseBot should become a financial
tutor whose answers are grounded in reviewed knowledge, adapted to Burkina Faso
and the UEMOA context, usable in a reduced form offline, and capable of evolving
later into an agent that can propose actions inside WiseMoney.

## 1. Current baseline

WiseMoney already has two distinct AI-facing surfaces:

- **WiseBot product help** uses a bilingual, versioned `ProductTask` catalogue,
  deterministic local retrieval, a safe context contract, and a server gateway
  that reconstructs trusted documentation before calling Gemma 4.
- **Financial Intelligence and Literacy** use the general AI orchestration layer
  and the consent/redaction boundary. They do not yet have a deep, reviewed
  financial-education corpus or a dedicated tutoring policy.

The existing product-help corpus remains useful and should not be merged blindly
with financial education. Product instructions answer “how do I use WiseMoney?”;
financial education answers “how do I reason about and manage money?”. They can
share retrieval infrastructure while retaining separate knowledge domains,
quality rules, and safety policies.

## 2. Goals and non-goals

### Goals

- Establish an editorially controlled, versioned source of truth.
- Represent expert knowledge separately from the way it is taught.
- Retrieve relevant evidence through Pinecone without coupling the application to
  Pinecone-specific response shapes.
- Support French and English first, with a schema that can later accommodate
  Mooré, Dioula, and other languages.
- Ground examples in Burkina Faso and UEMOA realities: XOF, cash, mobile money,
  informal income, family obligations, credit, fraud, and irregular cash flow.
- Use live web evidence when freshness matters and show the user where claims
  come from.
- Preserve the local-first boundary: personal financial records are not embedded
  or stored in the knowledge platform.
- Prepare a safe path from generative tutoring to user-confirmed agent actions.

### Non-goals

- Pinecone is not the authoritative content store.
- Web search is not used on every message and is not a substitute for a reviewed
  corpus.
- Search results never enter the permanent corpus automatically.
- The model does not diagnose a user, promise financial outcomes, execute bank
  operations, or mutate the WiseMoney vault directly.
- The first implementation does not require fine-tuning a model.

## 3. Architectural principles

1. **The repository or an editorial store owns knowledge.** Pinecone contains a
   rebuildable search representation.
2. **Evidence and teaching are different objects.** A source establishes a fact;
   a learning unit determines how to explain and practise it.
3. **Retrieval, generation, and action are separate.** Changing an embedding
   model, language model, or search provider must not rewrite the product domain.
4. **Stable knowledge and fresh evidence follow different trust paths.** Reviewed
   knowledge can be reused; live web evidence is temporary and visibly dated.
5. **Personalisation stays local by default.** Learner progress and financial data
   do not belong in the shared vector database.
6. **The model may propose; the application validates and executes.** This remains
   true when agentic capabilities arrive.

## 4. System shape

```text
Reviewed sources
      |
      v
Source registry -> extraction -> claims -> learning units -> validation
                                                        |
                                                        v
                                               Pinecone index
                                                        |
Question -> intent router -> retrieval -> reranking -> tutoring policy
                 |                                      |
                 |                                      v
                 +-> web evidence when fresh facts are required
                                                        |
                                                        v
                                              generator -> verifier
                                                        |
                                                        v
                                             answer with provenance

On device:
  encrypted financial vault   local learner state   essential offline pack
              |                       |                       |
              +---------- safe, explicit context ------------+

Future actions:
  tutor -> action proposal -> validation -> preview -> confirmation -> domain service
```

The server-side path owns provider credentials, retrieval orchestration, source
policy, and output verification. The browser receives only the evidence and
answer fields required by the user interface.

## 5. Knowledge domains

The platform starts with two routed domains:

| Domain | Purpose | Initial source |
| --- | --- | --- |
| `product-help` | Explain WiseMoney screens, controls, limits, and recovery paths | Existing bilingual `ProductTask` catalogue |
| `financial-education` | Teach concepts, decisions, habits, exercises, and locally relevant scenarios | New reviewed corpus |

A question may retrieve from both domains, but the orchestrator queries them
separately and preserves each result's provenance. A product answer must not be
invented from general financial material, and a financial lesson must not treat
the application help copy as expert evidence.

## 6. Source-of-truth model

### 6.1 Source document

```ts
type SourceDocument = {
  id: string;
  title: string;
  publisher: string;
  sourceUrl: string;
  authorityLevel: "official" | "research" | "expert" | "secondary";
  country: "BF" | "regional" | "global";
  jurisdiction: "Burkina" | "UEMOA" | "none";
  language: string;
  publishedAt: number | null;
  retrievedAt: number;
  reviewedAt: number | null;
  expiresAt: number | null;
  license: string | null;
  contentHash: string;
  status: "candidate" | "reviewed" | "rejected" | "superseded";
};
```

### 6.2 Atomic claim

```ts
type KnowledgeClaim = {
  id: string;
  sourceDocumentId: string;
  statement: string;
  sourceLocator: string;
  validFrom: number | null;
  validUntil: number | null;
  confidence: "verified" | "supported" | "uncertain";
  risk: "low" | "financial-guidance" | "regulatory";
  supersedesClaimId: string | null;
};
```

A claim is small enough to cite and invalidate independently. Rates, thresholds,
fees, dates, and legal rules always carry an effective date or expiry policy.

### 6.3 Learning unit

```ts
type LearningUnit = {
  id: string;
  competencyId: string;
  locale: "fr" | "en";
  level: "beginner" | "intermediate" | "advanced";
  objective: string;
  prerequisites: string[];
  explanation: string;
  localScenario: string;
  misconceptions: string[];
  exercises: string[];
  expectedUnderstanding: string;
  claimIds: string[];
};
```

FR and EN versions share the same stable `id` and `competencyId`. Translations
must preserve meaning, claim links, and risk level rather than merely translating
surface wording.

### 6.4 Search record

The Pinecone record is generated from source objects and can always be rebuilt:

```ts
type KnowledgeSearchRecord = {
  id: string;
  text: string;
  metadata: {
    domain: "product-help" | "financial-education";
    knowledgeVersion: string;
    locale: string;
    country: string;
    jurisdiction: string;
    competencyId: string;
    contentType:
      | "concept"
      | "procedure"
      | "scenario"
      | "exercise"
      | "misconception"
      | "warning"
      | "regulation";
    level: string;
    authorityLevel: string;
    sourceDocumentId: string;
    reviewedAt: number;
    validUntil?: number;
  };
};
```

Pinecone metadata is deliberately flat. Rich relationships remain in the source
store, not in vector metadata.

## 7. Classification system

Every learning unit is classified across stable axes:

- **Domain:** income, spending, budgeting, saving, debt, credit, risk, insurance,
  investing, consumer protection, and digital finance.
- **Competency:** understand, calculate, compare, decide, apply, and verify.
- **Geography:** Burkina Faso, UEMOA/regional, or global.
- **Learner level:** beginner, intermediate, or advanced.
- **Life context:** student, salaried worker, self-employed worker, household, or
  small activity.
- **Money channel:** cash, bank, card, mobile money, formal credit, or informal
  arrangement.
- **Content type:** concept, procedure, scenario, exercise, misconception,
  warning, or regulation.
- **Freshness:** stable, periodically reviewed, or time-sensitive.
- **Risk:** general education, financial guidance, or regulatory information.

The taxonomy is identified by stable codes rather than translated display names.
New axes require a schema decision and retrieval evaluation; they are not added as
free-form tags during ingestion.

## 8. Source policy and collection

### 8.1 Source tiers

1. **Official:** BCEAO, UEMOA institutions, Burkina Faso public authorities,
   regulators, and official terms from a financial-service provider.
2. **Research and standards:** peer-reviewed research, OECD frameworks, World Bank
   datasets and reports, and other attributable institutional work.
3. **Reviewed expert material:** named authors or organisations with a reviewable
   methodology and clear publication date.
4. **Secondary and web material:** useful for discovery or recent context, but not
   sufficient alone for high-risk claims.

Regulatory claims require an official source. General educational claims require
one strong source or corroboration. Conflicting sources remain visible in the
review queue; ingestion does not pick one silently.

### 8.2 Inclusion checks

A source enters the candidate registry only if its authority, origin, date,
licence, geography, extractability, language, and expected review cadence are
recorded. Collection should start from a small allowlist and expand through
deliberate review, not broad crawling.

### 8.3 Initial collection themes

- financial competence and budgeting foundations;
- saving under irregular income;
- debt, borrowing cost, repayment, and informal obligations;
- mobile money usage, fees, mistaken transfers, PIN safety, and fraud;
- consumer rights and complaint paths in the UEMOA context;
- practical household and small-activity scenarios in Burkina Faso;
- WiseMoney workflows that support each competency.

## 9. Editorial and publishing pipeline

```text
1. Register candidate source and hash the original.
2. Extract text while preserving page, section, or paragraph locators.
3. Classify source and detect duplicate or superseded material.
4. Produce atomic claims with exact provenance.
5. Build or update learning units from approved claims.
6. Review bilingual meaning, local relevance, risk, and expiry.
7. Generate semantic chunks without breaking claims or exercises.
8. Embed and upsert into a staging namespace.
9. Run retrieval, answer, citation, safety, and regression evaluations.
10. Publish a new immutable `knowledgeVersion` through configuration.
11. Retain the previous version for rollback, then archive it by policy.
```

Production content is never edited invisibly. A change creates a new corpus
release with a manifest containing source hashes, embedding model, chunking
version, record count, evaluation results, and publication date.

## 10. Pinecone design

### 10.1 Responsibility

Pinecone provides semantic and lexical retrieval, metadata filtering, and
reranking. It does not own editorial state, learner progress, user records,
permissions, or actions.

### 10.2 Abstraction boundary

```ts
type KnowledgeQuery = {
  text: string;
  domains: Array<"product-help" | "financial-education">;
  locale: string;
  country: string;
  competencyIds?: string[];
  level?: string;
  asOf: number;
};

interface KnowledgeRetriever {
  search(query: KnowledgeQuery): Promise<KnowledgeEvidence[]>;
}
```

Only the Pinecone adapter knows index names, namespaces, vector dimensions, and
provider response formats.

### 10.3 Index and version strategy

- Use one index per incompatible embedding/schema generation.
- Use separate namespaces for published knowledge domains and corpus versions.
- Query multiple domains in parallel when necessary and merge results in the
  orchestrator.
- Build new versions in staging and switch application configuration only after
  evaluations pass.
- Keep record IDs stable across rebuilds when the underlying claim is unchanged.
- Store the embedding model and chunking version in the release manifest.
- Never create a namespace per WiseMoney user because no user financial content
  belongs in this index.

Pinecone namespaces cannot be renamed or moved directly, so release switching is
an application-level operation rather than a namespace mutation.

### 10.4 Retrieval pipeline

```text
question
  -> domain and freshness classification
  -> metadata filters: locale, geography, level, validity
  -> multilingual dense retrieval
  -> lexical retrieval for exact terms and named entities
  -> merge and deduplicate
  -> multilingual reranking
  -> 5-8 evidence items
  -> tutoring policy and generation
```

Dense retrieval handles paraphrases and conversational French. Lexical retrieval
protects exact terms such as XOF, BCEAO, named mobile-money services, legal terms,
and error codes. The sparse model or full-text strategy must be validated on
French and local vocabulary; an English-only sparse model is not an acceptable
default.

## 11. Tutoring layer

RAG answers “what evidence is relevant?”. A tutor must also decide what to teach
next and how much help to give.

```ts
interface TutorPolicy {
  decide(input: {
    question: string;
    evidence: KnowledgeEvidence[];
    learnerState: LocalLearnerState;
    conversationTaskIds: string[];
  }): TutorMove;
}
```

Possible moves include explaining, asking a diagnostic question, giving a local
scenario, correcting a misconception, proposing an exercise, checking
understanding, or declining because the evidence is insufficient.

The learner state stays local by default and contains competency progress, recent
learning units, exercise outcomes, and preferences. It does not contain raw
transactions. Any use of financial aggregates follows the existing consent and
redaction architecture.

## 12. Offline-first behavior

Pinecone and generative models require a network. WiseMoney therefore publishes
an essential offline pack from the same reviewed source:

- core beginner learning units;
- locally rendered explanations and exercises;
- product-help tasks;
- stable source names and review dates;
- a compact local lexical index.

The local and online records share IDs. Offline, the app returns reviewed local
content and clearly states that live verification is unavailable. Online, the
retriever can add Pinecone evidence and a generated explanation. A network
failure never blocks financial-state features.

## 13. Live web evidence

### 13.1 Purpose

Web search is a second evidence channel for information whose truth may have
changed: regulation, provider fees, current programmes, service availability, or
an explicit request to verify information today. It is not run merely to make an
answer look more authoritative.

### 13.2 Provider boundary

```ts
type SafeWebQuery = {
  query: string;
  locale: string;
  country: string;
  allowedSourceTiers: string[];
  reason: "freshness" | "explicit-verification" | "corpus-gap";
};

interface WebEvidenceProvider {
  search(query: SafeWebQuery): Promise<WebEvidence[]>;
}
```

The current WiseBot gateway calls `gemma-4-26b-a4b-it`. Google documents Search
Grounding for Gemini models, not this Gemma model. The first practical adapter can
therefore use a supported Gemini model only as a web-evidence provider while
retaining Gemma or another model as the tutor. The abstraction must also permit a
future independent search provider.

### 13.3 Routing rules

Use web evidence when:

- the user explicitly asks for current or verified information;
- the question contains a time-sensitive fact;
- the corpus marks a claim as expired or due for review;
- retrieval identifies a genuine corpus gap that web evidence can safely answer.

Do not use it when:

- the reviewed corpus already answers a stable concept;
- the query would disclose a private financial detail;
- the request asks for an unsupported personalised recommendation;
- authoritative sources cannot be distinguished from promotional content.

The server builds a sanitised search query. Names, balances, transactions, notes,
contacts, account identifiers, passphrases, screenshots, and vault content are
forbidden in that query.

### 13.4 Evidence handling

- Prefer allowlisted official domains for regulatory or provider-specific facts.
- Preserve the source URL, title, publisher, retrieval time, and cited passage.
- Mark web evidence as temporary and give it a short cache lifetime.
- Detect contradictory sources and state uncertainty instead of merging them.
- Never promote a result to Pinecone automatically.
- Promotion requires source registration, claim extraction, review, evaluation,
  and a new `knowledgeVersion`.

Google Search Grounding returns citations and search-attribution material. Its
current terms require the associated grounded results and search suggestions to
be shown to the user who made the request. The UI and provider adapter must retain
those fields rather than reducing the response to plain text.

### 13.5 User trust

Every answer identifies its evidence mode:

- **Guide WiseMoney vérifié** for reviewed corpus content;
- **Vérifié sur le web aujourd’hui** when live search ran;
- **Disponible hors ligne** for the essential local pack;
- **Je ne peux pas confirmer** when evidence is missing or contradictory.

The answer surface provides “Voir les sources” and shows publisher plus review or
retrieval date. The interface must never claim that a web search occurred when it
did not.

## 14. Privacy and threat boundaries

- Pinecone and web providers receive knowledge queries, not vault contents.
- Provider keys remain server-side except in the existing explicit BYO-key mode.
- Retrieved text and user prompts are untrusted input and cannot override system,
  safety, source, consent, or tool policies.
- Citations must resolve to retrieved evidence; the model cannot invent arbitrary
  external links.
- Images and files remain opt-in and pass through a separate consent path.
- Logs use request IDs, timings, result IDs, and fault codes, never raw financial
  content.
- Corpus ingestion treats remote documents as data, not executable instructions.
- High-risk financial or regulatory answers require stronger evidence and an
  explicit educational, non-guarantee boundary.

## 15. Path to agentic actions

Knowledge retrieval and tool execution remain separate:

```text
tutor response
    -> typed ActionProposal
    -> allowlisted ToolBroker schema validation
    -> local preview of exact effect
    -> explicit user confirmation
    -> existing WiseMoney domain service
    -> idempotency and local audit result
```

Pinecone may explain what a WiseMoney action does, but it never grants permission
or executes it. The model cannot bypass the domain service, event validation,
consent, or user confirmation. Early tools should be reversible navigation and
drafting actions before any financial-state mutation is considered.

## 16. Evaluation gates

### Corpus

- FR/EN ID and claim parity.
- Valid source locators and no orphan claims.
- Expired claims excluded from normal retrieval.
- Regulatory content backed by an official source.
- Local scenarios reviewed for Burkina Faso relevance and respectful language.

### Retrieval

- A labelled FR/EN and Burkina/UEMOA question set.
- Recall@k, mean reciprocal rank, and nDCG tracked per corpus release.
- Exact-term tests for XOF, institutions, mobile money, and regulatory vocabulary.
- Correct abstention when the corpus has no answer.
- Regression comparison before changing embeddings, chunking, or reranking.

### Answers and tutoring

- Claim-level groundedness and citation correctness.
- Completeness without unsupported additions.
- Pedagogical appropriateness for the selected level.
- Correct handling of misconceptions and follow-up questions.
- No personalised promise, invented product action, or hidden source.

### Web evidence

- Freshness routing precision.
- Authoritative-domain rate for high-risk questions.
- Citation-to-passage integrity.
- Conflict and provider-failure behavior.
- No private fields in generated search queries.
- Search attribution rendered according to provider requirements.

### Offline and operations

- Essential lessons and product help remain available without a network.
- Provider or Pinecone failure does not affect the financial vault.
- Corpus release rollback is tested.
- Cost, latency, and search-call rate are measured before default enablement.

## 17. Delivery phases

### Phase 0: design and corpus foundation

- Freeze the taxonomy and source-policy vocabulary.
- Create `sources.registry`, claim, learning-unit, and release-manifest schemas.
- Select the first official and research sources.
- Produce the initial benchmark before tuning retrieval.

Exit gate: sample records can be reviewed, traced to sources, translated, and
evaluated without Pinecone.

### Phase 1: useful tutoring slice

- Build a first Burkina/UEMOA corpus around budgeting, irregular income, saving,
  debt, and mobile-money safety.
- Publish the essential offline pack.
- Add the provider-neutral retriever and Pinecone staging/production pipeline.
- Implement dense multilingual retrieval, metadata filters, and reranking.
- Add citations and a small deterministic tutoring policy.

Exit gate: the benchmark passes, answers remain useful offline, and no financial
records enter the remote knowledge path.

### Phase 2: controlled live evidence

- Add freshness classification and `WebEvidenceProvider`.
- Start with Google Search Grounding behind the provider boundary.
- Add source attribution, caching, contradictions, and explicit verification UX.
- Measure search usefulness, latency, and cost before expanding triggers.

Exit gate: live evidence improves time-sensitive answers without contaminating
the permanent corpus or leaking private context.

### Phase 3: adaptive tutor

- Add a local competency graph and learner progress.
- Introduce diagnostic questions, exercises, misconception correction, and spaced
  review.
- Expand languages and locally reviewed scenarios.

Exit gate: learning evaluations show improvement beyond question answering.

### Phase 4: confirmed agent actions

- Define typed tools and a strict ToolBroker.
- Start with navigation and drafts.
- Add previews, explicit confirmation, idempotency, and local audit trails.
- Permit state-changing actions only after separate security and UX review.

Exit gate: the model cannot execute or mutate state outside the validated,
confirmed domain-service path.

## 18. Decisions recorded and questions left open

### Direction recorded

- Use Pinecone Database through a WiseMoney-owned retriever, not Pinecone
  Assistant as the core architecture.
- Keep the corpus as a versioned editorial source of truth outside Pinecone.
- Separate product help, financial education, learner state, and financial data.
- Support a local essential pack alongside online RAG.
- Treat web search as temporary evidence with visible provenance.
- Prepare typed, user-confirmed tools without coupling them to retrieval.

### Open before implementation

- Exact authoring format and editorial review workflow.
- Initial source allowlist and content-licensing review.
- Embedding model and French lexical-search strategy.
- Pinecone plan, region, retention, and backup policy.
- Gemini Search Grounding versus another first web provider.
- Search cache lifetimes by evidence type.
- Who may approve regulatory and high-risk claims.
- Quantitative retrieval and tutoring thresholds for the first corpus release.

## 19. Primary technical references

- [Pinecone indexing and data modelling](https://docs.pinecone.io/guides/index-data/indexing-overview)
- [Pinecone hybrid search](https://docs.pinecone.io/guides/search/hybrid-search)
- [Pinecone reranking](https://docs.pinecone.io/guides/search/rerank-results)
- [Pinecone namespaces](https://docs.pinecone.io/guides/manage-data/manage-namespaces)
- [Pinecone security overview](https://docs.pinecone.io/guides/production/security-overview)
- [Gemini Grounding with Google Search](https://ai.google.dev/gemini-api/docs/google-search)
- [Gemini URL Context](https://ai.google.dev/gemini-api/docs/url-context)
- [Gemini tool combinations](https://ai.google.dev/gemini-api/docs/tool-combination)
- [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini API additional terms](https://ai.google.dev/gemini-api/terms_preview)

These links document vendor capabilities observed on 2026-08-30. Provider
features, model support, prices, terms, and regions must be rechecked before
implementation.

## Related WiseMoney documentation

- [Architecture](./ARCHITECTURE.md)
- [Privacy posture ADR](./adr/0001-privacy-posture-full-egress-user-consented.md)
- [AI key modes ADR](./adr/0002-dual-ai-key-modes.md)
- [AI provider strategy ADR](./adr/0011-mvp-ai-provider-strategy-managed-redacted-byo-key-full-egress.md)
- [Threat model](./THREAT_MODEL.md)
