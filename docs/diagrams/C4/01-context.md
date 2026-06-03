# C4 Level 1 — System Context

**Source:** ARCHITECTURE v0.1 · THREAT_MODEL v0.1 · CONTRACT v0.1
**Date:** 2026-06-02

WiseMoney is a local-first personal finance PWA. The user interacts with a
single browser-resident application that handles all domain and financial logic
on-device. Two AI-request paths exist and are structurally distinct: in managed
mode every AI request crosses the Go edge before reaching a provider; in BYO-key
mode the client talks to a provider directly, with no edge or cloud dependency.
The Go edge and Postgres are absent from the BYO-key path entirely. Trust
boundaries are drawn at the device, the Go edge process, the Postgres store, and
each external AI provider.

```mermaid
C4Context
  title WiseMoney — System Context

  Person(user, "Overwhelmed Tracker", "Primary persona. Uses the app on a single device to capture and understand personal finances.")

  System_Boundary(device, "Device Trust Boundary") {
    System(pwa, "WiseMoney PWA", "React/TypeScript progressive web app. Holds all financial domain logic, encrypted IndexedDB store, consent & redaction, and AI orchestration client.")
  }

  System_Boundary(edge_boundary, "Edge Trust Boundary (managed mode only)") {
    System(go_edge, "Go Managed Edge", "Thin, stateless Go proxy. Authenticates managed-mode users, enforces rate limits, issues consent assertions, applies structural payload caps, and routes AI requests to providers.")
    SystemDb(postgres, "Postgres", "Stores auth credentials (Argon2id hashes) and rate-limit metadata only. Never holds financial data.")
  }

  System_Ext(gemini, "Gemini (Google)", "External AI provider. Receives AI context payloads from the edge (managed) or directly from the client (BYO).")
  System_Ext(nvidia_nim, "NVIDIA NIM", "External AI provider. Same routing as Gemini.")
  System_Ext(openai, "OpenAI", "External AI provider. Same routing as Gemini.")

  Rel(user, pwa, "Captures transactions, views dashboard, chats with assistant", "HTTPS / browser")

  Rel(pwa, go_edge, "Managed mode: AI requests + JWT auth. Consent assertion requests.", "HTTPS TB-02")
  Rel(go_edge, gemini, "Managed mode: routes AI context to provider", "HTTPS TB-03")
  Rel(go_edge, nvidia_nim, "Managed mode: routes AI context to provider", "HTTPS TB-03")
  Rel(go_edge, openai, "Managed mode: routes AI context to provider", "HTTPS TB-03")
  Rel(go_edge, postgres, "Reads/writes auth and rate-limit metadata", "TCP/TLS TB-05")

  Rel(pwa, gemini, "BYO-key mode: direct AI request, bypassing edge entirely", "HTTPS TB-04")
  Rel(pwa, nvidia_nim, "BYO-key mode: direct AI request, bypassing edge entirely", "HTTPS TB-04")
  Rel(pwa, openai, "BYO-key mode: direct AI request, bypassing edge entirely", "HTTPS TB-04")
```

## Legend

| Trust boundary | Contents |
|---|---|
| Device | PWA, IndexedDB (encrypted), BYO key material (encrypted), consent state (localStorage) |
| Edge | Go process, JWT signing key, managed provider API keys — never financial data |
| Postgres | Auth hashes, rate-limit metadata — never financial data |
| AI providers | External; outside operator control once a request is sent |

**Financial data** (event log, transactions, balances) never crosses the device
boundary except through explicit user consent via the AI egress path or an
explicit export action. The Go edge and Postgres hold **no financial data** at any
time (INV-PROXY-01, Gate-4 decision 20).

In BYO-key mode the Go edge, Postgres, and all cloud dependencies are **absent
from every request path**. No authentication is required (INV-AUTH-05).
