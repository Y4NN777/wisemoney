# C4 Level 3 — Component

**Source:** ARCHITECTURE v0.1 · THREAT_MODEL v0.1 · CONTRACT v0.1
**Date:** 2026-06-02

This level decomposes the two non-trivial containers: the PWA client and the Go
managed edge. The PWA client contains all financial domain modules and the AI
orchestration path; the Go edge is decomposed into its auth, rate-limiting,
routing, adapter, normalization, and consent-assertion components. Module
dependency rules from ARCHITECTURE §12 are reflected: the Financial State module
has no dependency on AI modules; the UI surfaces depend only on internal
interfaces; only the Consent & Redaction Subsystem touches consent state.

---

## Part A — PWA Client components

```mermaid
C4Component
  title WiseMoney — PWA Client Components

  Container_Boundary(pwa, "PWA Client") {

    Component(event_store, "Event Store", "Dexie / IndexedDB, AES-GCM encrypted", "Append-only log of FinancialEvents. Single source of truth. Never mutated or deleted (INV-EVT-01). Encrypted at rest at all times (INV-PERS-02).")

    Component(fs_engine, "FinancialState Engine", "TypeScript", "Replays the event log into the current snapshot. Maintains a cached snapshot for fast reads. Recomputes balances, cash flow, category totals, budget progress, goal progress, recurring projections. Replay is authoritative over cache (INV-EVT-02).")

    Component(state_pillar, "Financial State Pillar", "TypeScript module", "Accounts, transactions, categories, budgets, goals, recurring items, timeline. The reality layer. Zero dependency on AI modules (NFR-MOD-01). Validates referential integrity at event-append time (INV-EVT-03/04/05).")

    Component(intelligence_pillar, "Financial Intelligence Pillar", "TypeScript module", "Insight engine, recommendation system, predictive engine, behavioural pattern detection. Consumes State; produces guidance via the AI orchestration client. Decoupled — failure degrades gracefully without breaking State (INV-PROXY-04).")

    Component(literacy_pillar, "Financial Literacy Pillar", "TypeScript module", "Conversational learning, contextual learning injection, concept library. Consumes State and the Assistant surface. Talks to AI through the AI orchestration client.")

    Component(ai_context_builder, "AI Context Builder", "TypeScript", "Transforms the State snapshot plus a time-windowed event slice into a structured context for AI submission (FR-DE-06/07). Always routes output through the Consent & Redaction Subsystem before any egress. Has no direct path to a transport.")

    Component(consent_redaction, "Consent & Redaction Subsystem", "TypeScript, localStorage", "Sole owner of per-feature consent state. Given a feature and the requested egress level, returns either a full context (only if per-feature full-egress consent is explicitly granted, INV-EGR-02) or a redacted context capped at the FR-CONSENT-07 / INV-EGR-01 ceiling. No other module may shape an egress payload (NFR-MOD-03). In BYO-key mode, this is the only enforcement point.")

    Component(crypto_km, "Crypto / Key-Management Module", "Web Crypto API, Argon2id (WASM)", "Argon2id KDF for passphrase-derived master key. AES-GCM encrypt/decrypt for IndexedDB store. WebAuthn-wrapped daily unlock. Storage and decryption of BYO provider keys encrypted at rest (INV-KEY-02/03, INV-PERS-02).")

    Component(ai_orch_client, "AI Orchestration Client", "TypeScript", "The only module that knows provider details. In managed mode: attaches JWT, presents consent assertion, sends shaped context to Go edge. In BYO-key mode: decrypts BYO key in-memory, applies same routing + fallback logic client-side, calls provider directly (TB-04). UI surfaces never call this directly — only pillar modules do.")

    Component(export_import, "Export / Import Module", "TypeScript", "JSON export (lossless, restore-capable, INV-PERS-03). CSV + XLSX export (human-readable, not restore formats, INV-PERS-04). Plaintext warning at export time. Optional passphrase-encrypted JSON export (Gate-5 decision 26).")

    Component(dashboard_ui, "Dashboard UI Surface", "React", "Reads the State snapshot from FinancialState Engine. No AI dependency. Fully offline-capable (INV-PERS-01).")

    Component(capture_ui, "Capture UI Surface", "React", "Fast transaction entry, offline-first. Writes to the Event Store via the State module. No AI dependency (INV-PROXY-04).")

    Component(assistant_ui, "Assistant UI Surface", "React", "Chat: guidance (Intelligence) and learning (Literacy). Calls only internal pillar interfaces; never calls provider SDKs directly (NFR-MOD-02).")
  }

  Rel(dashboard_ui, fs_engine, "Reads current snapshot")
  Rel(capture_ui, state_pillar, "Appends FinancialEvents")
  Rel(state_pillar, event_store, "Appends events; never mutates")
  Rel(fs_engine, event_store, "Replays log to derive snapshot")
  Rel(intelligence_pillar, fs_engine, "Reads snapshot and derived metrics")
  Rel(literacy_pillar, fs_engine, "Reads snapshot for learning context")
  Rel(assistant_ui, intelligence_pillar, "Requests guidance")
  Rel(assistant_ui, literacy_pillar, "Requests learning content")
  Rel(intelligence_pillar, ai_context_builder, "Requests AI context")
  Rel(literacy_pillar, ai_context_builder, "Requests AI context")
  Rel(ai_context_builder, consent_redaction, "All egress context routed through consent gate")
  Rel(consent_redaction, ai_orch_client, "Delivers shaped egress context (redacted or full)")
  Rel(ai_orch_client, crypto_km, "Decrypts BYO key in-memory for BYO-key calls")
  Rel(export_import, event_store, "Reads full event log for export; writes on import")
  Rel(crypto_km, event_store, "Encrypts/decrypts the IndexedDB store")
```

---

## Part B — Go Managed Edge components

```mermaid
C4Component
  title WiseMoney — Go Managed Edge Components

  Container_Boundary(go_edge, "Go Managed Edge") {

    Component(auth_service, "Auth Service", "Go, x/crypto/argon2, golang-jwt", "Email + password registration and login. Argon2id password hashing (memory >= 64 MiB, 3+ iterations, INV-AUTH-02). JWT issuance (15-min access token) and rotating refresh token. Password reset (128-bit random token, single-use, 15-min TTL). All routing decisions keyed on JWT sub claim only (M-AUTH-06).")

    Component(consent_assertion, "Consent-Assertion Issuer", "Go", "Issues short-lived server-signed consent assertions when a managed-mode user grants per-feature full-egress consent. The signed assertion is presented by the client on subsequent full-egress AI requests. Absent assertion => request treated as redacted (fail-safe default). Resolves AQ-01 / Gate-5 decision 24.")

    Component(rate_limiter, "Rate-Limiter", "Go, sync.Map / mutex-guarded", "Per-user token-bucket keyed exclusively on JWT sub claim. In-memory at current scale (tens-hundreds of users). Enforces per-user isolation (INV-AUTH-04). Redis is the documented scale-out path when per-instance state must be shared.")

    Component(request_router, "Request Router", "Go, chi", "Authenticates (validates JWT signature and expiry, INV-AUTH-03) -> rate-limits -> selects provider and model for the task type via operator-configurable routing config -> dispatches. Owns concurrent fan-out and cross-provider fallback ordering. No client-supplied user ID trusted.")

    Component(payload_cap, "Structural Payload Cap", "Go, JSON schema validation", "Applied to every incoming AI request before dispatch. For redacted-egress requests: validates payload against aggregate-only JSON schema; rejects any field that can only appear in full-egress contexts with HTTP 400 (T-EGR-01 mitigation). For full-egress requests: requires valid consent assertion before forwarding. Implements INV-EGR-03(a) / AQ-01 resolution (THREAT_MODEL §3, Option C + B). No financial domain logic on the edge.")

    Component(provider_adapters, "Provider-Adapter Layer", "Go", "One adapter per provider: Gemini, NVIDIA NIM, OpenAI. Each translates the internal request format into the provider's API and maps the response back. Adding a provider is adding an adapter + routing config entry with no cross-cutting change (FR-AIORCH-01, INV-PROXY-03). Endpoint URLs are hardcoded (no user-configurable URLs, M-PROXY-01 / SSRF prevention).")

    Component(response_normalizer, "Response Normalizer", "Go", "Collapses every provider response into one internal shape before it returns to the client (INV-PROXY-03). No feature depends on a provider-specific format. No request or response payload is logged — only method, path, status, latency, and user ID (INV-PROXY-02, M-PROXY-03).")

    Component(log_sanitizer, "Log Sanitizer Middleware", "Go middleware", "Strips Authorization headers and any api_key body fields from all log writes before they are emitted. The only logging path for the edge. Prevents key material and financial context from appearing in logs (INV-PROXY-02, M-KEY-04).")
  }

  SystemDb_Ext(postgres, "Postgres", "Auth hashes and rate-limit metadata only.")
  System_Ext(ai_providers, "AI Providers", "Gemini / NVIDIA NIM / OpenAI.")
  Person_Ext(pwa_client, "PWA Client", "Sends JWT-authenticated AI requests.")

  Rel(pwa_client, auth_service, "Register / login / password-reset / refresh-token rotation", "HTTPS TB-02")
  Rel(pwa_client, consent_assertion, "Request consent assertion when granting full-egress", "HTTPS TB-02")
  Rel(pwa_client, request_router, "JWT-authenticated AI request with egress-level header", "HTTPS TB-02")
  Rel(auth_service, postgres, "Read/write auth rows (Argon2id hashes, refresh tokens)", "TB-05")
  Rel(request_router, rate_limiter, "Check and debit per-user token bucket (keyed on JWT sub)")
  Rel(request_router, payload_cap, "All AI requests pass through payload cap before dispatch")
  Rel(payload_cap, provider_adapters, "Dispatch validated/gated request to provider adapter")
  Rel(provider_adapters, ai_providers, "Call provider API using server-held API key", "HTTPS TB-03")
  Rel(provider_adapters, response_normalizer, "Raw provider response -> normalized internal shape")
  Rel(rate_limiter, postgres, "Read/write rate-limit counters", "TB-05")
  Rel(log_sanitizer, request_router, "Intercepts all log output; strips sensitive fields")
```

---

## Legend

| Trust boundary | Financial data present? | Notes |
|---|---|---|
| Device (PWA client) | Yes — encrypted at rest | All domain logic and data here |
| Go edge — in-flight | Only in managed full-egress requests, consent-gated | Payload cap enforces this at the boundary |
| Go edge — persisted | Never | INV-PROXY-01: edge retains nothing financial after a request cycle |
| Postgres | Never | No financial schema; auth and rate-limit metadata only |
| AI providers | Yes, if and only if per-feature consent granted | Provider-side retention is a residual disclosed risk |

**Module dependency rules enforced (ARCHITECTURE §12):**
- Financial State Pillar has zero compile-time or runtime dependency on Intelligence, Literacy, or the AI Orchestration Client.
- UI surfaces call only internal pillar interfaces; they never call provider SDKs.
- Only the Consent & Redaction Subsystem reads or writes consent state (localStorage).
- The Go edge holds no domain or financial logic.
