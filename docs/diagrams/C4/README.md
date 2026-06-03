# C4 Diagrams — WiseMoney

**Date:** 2026-06-02
**Source:** ARCHITECTURE v0.1 · THREAT_MODEL v0.1 · CONTRACT v0.1
**Author:** Meshullam (MISHKAN Migdal — infrastructure design)

---

## Diagram index

| File | Level | Scope |
|---|---|---|
| `01-context.md` | C4 Context | System actors, external systems, and the two AI-request paths (managed vs BYO-key). Trust boundaries marked. |
| `02-container.md` | C4 Container | Three deployment units (PWA client, Go managed edge, Postgres) plus the BYO-key bypass. Data-flow constraints tabulated. |
| `03-component.md` | C4 Component | (A) PWA client decomposed into 12 modules. (B) Go edge decomposed into 8 components including the Consent-Assertion Issuer and Structural Payload Cap (Gate-5 / AQ-01). |

## Key architectural facts reflected in all diagrams

- Financial data (event log, transactions, balances) is **client-side only**. The Go edge and Postgres hold no financial data at any time (INV-PROXY-01, Gate-4 decision 20).
- Two distinct modes exist: **managed mode** (client -> Go edge -> provider, JWT auth, server-enforced egress caps) and **BYO-key mode** (client -> provider directly, no edge, no cloud dependency, client-side consent enforcement only).
- The Go edge is the egress enforcement boundary in managed mode (INV-EGR-03a, AQ-01 resolution: structural payload cap + signed consent assertion).
- BYO-key egress enforcement is client-side only and accepted by design (AQ-02, INV-EGR-03b, Gate-5 decision 25).

## Rendering

All diagrams use Mermaid C4 syntax and render in any Markdown viewer with Mermaid support (GitHub, GitLab, VS Code with the Mermaid extension, etc.).
