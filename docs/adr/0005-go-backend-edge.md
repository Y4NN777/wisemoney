# ADR-0005: Go for the backend edge (deviation from FastAPI baseline; client-heavy logic)

| Field   | Value                                                       |
| ------- | ----------------------------------------------------------- |
| Status  | Accepted                                                    |
| Date    | 2026-06-02                                                  |
| Source  | Intake Gate-4 decisions 16, 17                             |
| Binds   | ARCHITECTURE §1, §2.2, §11, §12; INV-PROXY-01..04          |

## Context

A decision was required on (a) where the business logic lives, and (b) what
technology implements the backend. The MISHKAN default backend baseline is FastAPI
(Python). The backend's only job in this product is auth, rate-limiting, and AI
proxying — it holds no financial or domain logic.

## Decision

**Logic placement — client-heavy (Gate-4 decision 16).** Essentially all
financial/domain business logic lives in the **client**: event-sourcing, snapshot
derivation, balances, budgets, goals, recurring projections, FX conversion,
consent/redaction, encryption, AI context building, and export/import. The backend
has **no financial business logic**.

**Backend — Go (Gate-4 decision 17).** The managed proxy is a thin, stateless,
multi-tenant auth + AI-gateway edge in Go (`net/http` + chi, golang-jwt,
`x/crypto/argon2`). Its job: authenticate → rate-limit → route to provider →
normalize response, with concurrent fan-out and cross-provider fallback. It ships as
a single static binary in a distroless, version-pinned Docker image.

This **deviates from the MISHKAN FastAPI baseline** — an engineer override, justified
because the backend does no domain logic and the likely Post-MVP growth
(services/sync) stays in Go. A **polyglot escape hatch is documented, not built**:
if AI/ML compute ever lands Post-MVP, a Python worker is added **behind** the Go edge
as a third internal unit — never a rewrite of the edge.

## Consequences

- The Financial State pillar runs entirely on-device, preserving the local-first and
  offline guarantees (INV-PERS-01, INV-PERS-05); the server exists only to hold
  provider keys the user chose not to hold (ARCHITECTURE §1).
- The edge holds no domain logic (ARCHITECTURE §12, rule 4): any code that computes a
  balance, budget, projection, or conversion belongs on the client and may not appear
  on the edge. This also shapes how egress is enforced at the edge (ADR-0008): the
  edge enforces payload **shape**, not financial **meaning**.
- The proxy is stateless w.r.t. financial data and normalizes provider responses to
  one internal shape (INV-PROXY-01, INV-PROXY-03); adding a provider is adding an
  adapter + routing config, not a cross-cutting change.
- The Go choice is recorded as a deliberate baseline deviation; SRS CON-04 (which had
  described a "thin FastAPI service") was reconciled to Go (ARCHITECTURE AQ-04).

## Alternatives considered

- **FastAPI (MISHKAN baseline).** Not selected — the backend does no domain logic,
  so the baseline's strengths (rich Python domain modelling) do not apply; Go's
  single static binary, concurrency model, and distroless footprint fit a thin edge.
- **Backend-heavy logic placement.** Rejected — would put financial logic on a server
  in the egress path, breaking the local-first promise and coupling Financial State
  availability to the server.
- **Rewrite to add ML later.** Rejected in advance — the Python-worker-behind-the-edge
  escape hatch avoids a rewrite if ML compute ever lands.
