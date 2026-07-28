# C4 Level 2 — Container

**Source:** ARCHITECTURE v0.1 · THREAT_MODEL v0.1 · CONTRACT v0.1
**Date:** 2026-06-02

There are three deployment units: the PWA static host (React/TypeScript,
served as a progressive web app), the Go managed edge (single static binary in a
distroless container), and Postgres. The PWA client holds all financial domain
logic and the entire user data store; the Go edge is strictly an auth + proxy
layer with no domain logic. The BYO-key bypass is shown explicitly: in that mode
the client calls the AI provider directly and none of the three deployment units
on the managed path are contacted. Postgres is accessible only from the Go edge
container on the internal Docker network.

```mermaid
C4Container
  title WiseMoney — Container

  Person(user, "Overwhelmed Tracker", "Single primary persona.")

  System_Boundary(device, "Device Trust Boundary") {
    Container(pwa_client, "PWA Client", "React / TypeScript, Vite, service worker, Dexie/IndexedDB, Web Crypto", "Holds all financial domain and business logic. Stores the complete event log and derived state in AES-GCM encrypted IndexedDB. Manages BYO provider keys encrypted at rest. Runs consent & redaction subsystem. Assembles AI context and routes it either to the Go edge (managed) or directly to a provider (BYO).")
  }

  System_Boundary(edge_boundary, "Edge Trust Boundary (managed mode only)") {
    Container(go_edge, "Go Managed Edge", "Go, net/http + chi, golang-jwt, x/crypto/argon2, distroless Docker image", "Stateless. Authenticates managed-mode users (Argon2id, JWT). Enforces per-user rate limits (in-memory token bucket). Applies an aggregate-only payload cap to every managed request (rejects full-egress fields, 400). Routes AI requests to provider adapters. Holds managed provider API keys — never persists financial data.")
    ContainerDb(postgres, "Postgres", "PostgreSQL (pgx driver)", "Auth data only: Argon2id password hashes, email addresses, and refresh-token records. Financial data and rate-limit state are structurally absent.")
  }

  System_Ext(ai_providers, "Managed AI Providers", "OpenRouter Free / Gemini 3.6 Flash / optional DeepSeek V4 Flash.")

  Rel(user, pwa_client, "Captures transactions, views state, chats with assistant", "HTTPS / browser TB-01")

  Rel(pwa_client, go_edge, "Managed mode: JWT-authenticated aggregate-only AI request", "HTTPS TB-02 — redacted context plus optional user prompt.")
  Rel(go_edge, ai_providers, "Managed mode: routes normalised AI request to provider using server-held API key", "HTTPS TB-03 — no financial data retained by edge after response.")
  Rel(go_edge, postgres, "Reads/writes users and refresh-token records", "TCP/TLS or Unix socket TB-05 — no financial data.")

  Rel(pwa_client, ai_providers, "BYO-key mode: direct provider call, edge entirely bypassed", "HTTPS TB-04 — user's own API key, decrypted in-memory. Edge and Postgres not contacted.")
```

## Data-flow constraints

| Flow | Carries financial data? | Notes |
|---|---|---|
| PWA client → Go edge (managed) | No | Managed requests contain aggregates only (INV-EGR-01). The edge rejects full-only fields regardless of client claims. |
| Go edge → AI provider (managed) | Same condition as above | Edge never retains payload after response cycle (INV-PROXY-01). |
| PWA client → AI provider (BYO) | Conditionally — client-side consent enforcement only | No server boundary; client consent subsystem is the sole gate (INV-EGR-03b, AQ-02 accepted). |
| Go edge → Postgres | Never | Postgres schema has no financial data columns. |
| Any → Postgres | Never | Hard architectural invariant (Gate-4 decision 20). |

## Legend

| Trust boundary | Financial data present? |
|---|---|
| Device (PWA client + IndexedDB) | Yes — encrypted at rest (INV-PERS-02) |
| Go edge process | Never persisted; only in-flight in managed-mode AI request if consent granted |
| Postgres | Never |
| AI providers | Yes, if and only if consent granted for the specific feature |

BYO-key mode: the Go edge container and Postgres are **not in any request path**.
The user operates with zero cloud dependency (INV-AUTH-05).
