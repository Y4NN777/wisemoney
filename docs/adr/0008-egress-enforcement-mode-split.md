# ADR-0008: Egress-enforcement mode-split and the INV-EGR-03 amendment

| Field   | Value                                                       |
| ------- | ----------------------------------------------------------- |
| Status  | Accepted                                                    |
| Date    | 2026-06-02                                                  |
| Source  | Intake Gate-5 decisions 23, 24, 25                         |
| Binds   | INV-EGR-03 (amended); THREAT_MODEL §3, §4, §5; ARCHITECTURE §10 |

## Context

INV-EGR-03 originally required egress enforcement to be a server/boundary guarantee
and not rely solely on the client's consent flag. That is satisfiable in managed mode
(the Go edge is in the path) but **structurally unsatisfiable** in BYO-key mode, which
by design has no server boundary (INV-AUTH-05). Forcing a server boundary into BYO
mode would destroy the local-first, no-cloud-dependency property that defines it. The
THREAT_MODEL (§5) called the invariant for amendment; the enforcement mechanism for
managed mode (AQ-01) and the residual BYO client-trust (AQ-02) needed resolution.

## Decision

**Amend INV-EGR-03 to a mode-split (Gate-5 decision 23):**

- **(a) Managed mode** — egress enforcement is a **server/boundary guarantee** at the
  Go edge. Client-side consent state (localStorage) is advisory UI context, never the
  enforcement mechanism. The edge enforces egress shape structurally, independent of
  the client's claimed consent level.
- **(b) BYO-key mode** — the user is simultaneously the data subject, the key-holder,
  and the sole operator. No server boundary exists by design. Egress enforcement is
  **client-side only** and is the user's own responsibility as principal. The BYO
  consent UI **must** state plainly that no server-side enforcement exists
  (Gate-5 decision 25, the hard condition).

**Managed-mode enforcement mechanism (Gate-5 decision 24, THREAT_MODEL §3):** a
**structural payload cap plus a signed consent assertion**. Every AI request carries
a mode header. For `redacted` requests, the edge validates the body against an
aggregate-only JSON schema (the INV-EGR-01 ceiling) and **rejects (400)** any body
containing full-egress-only fields (individual amounts, dates, merchants, notes) —
the client's claimed level is not trusted. For `full` requests, the edge requires a
valid, server-signed, short-lived **consent assertion** for that specific feature;
absent it, the request is treated as `redacted` (fail-safe default). This adds a
**consent-assertion issuance endpoint** to the Go edge, confirmed in scope.

## Consequences

- CONTRACT §3 INV-EGR-03 is replaced with the amended mode-split text (already applied
  by Zadok, CONTRACT Rev 2026-06-02). The mode-split enforcement principle is in the
  "must not change" set.
- The edge enforces payload **shape**, not financial **meaning** — consistent with the
  no-domain-logic rule (ADR-0005); no understanding of the data's semantics is
  required, only schema conformance.
- BYO-key client-only enforcement is an **accepted residual risk** (Gate-5 decision 25,
  THREAT_MODEL §4, §7): the user is the sole principal; server enforcement would
  eliminate the mode. A compromised client bundle could bypass it — mitigated by
  supply-chain integrity (SRI, pinned deps, strict CSP, trustworthy origin).
- The redacted-egress aggregate schema becomes a versioned contract between client and
  edge; schema additions require an edge deployment (THREAT_MODEL §3).

## Alternatives considered

- **Edge re-derives shape from a server-side consent record (Option A).** Rejected —
  evaluating what "raw transaction data" means is domain logic the edge must not hold
  (INV-PROXY-01), and a server-side consent record adds state and a sync problem.
- **Signed consent assertion alone (Option B).** Insufficient for redacted requests —
  it proves consent was granted, not that the payload is correctly shaped; combined
  with structural caps it gates full-egress only.
- **Keep INV-EGR-03 uniform across both modes.** Rejected — structurally unsatisfiable
  in BYO mode without destroying the mode (THREAT_MODEL §5).
- **Require a server boundary for all egress including BYO.** Rejected — eliminates
  BYO's defining local-first, no-cloud property (INV-AUTH-05).
