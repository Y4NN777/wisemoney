# ADR-0002: Both AI key modes — managed proxy and bring-your-own-key

| Field   | Value                                                    |
| ------- | -------------------------------------------------------- |
| Status  | Accepted                                                 |
| Date    | 2026-06-02                                               |
| Source  | Intake locked decision 2                                |
| Binds   | INV-KEY-01..04, INV-AUTH-05; PRD §9.2; ARCHITECTURE §3  |

## Context

AI features require provider API keys. Two user populations exist: those who want a
turnkey experience without handling keys, and those who want full local control with
their own keys and no cloud dependency. A single key-handling model would force one
group out.

## Decision

Support **both** modes, coexisting, with the user choosing:

- **(a) Managed mode** — a thin, stateless proxy holds provider keys server-side so
  the client never sees them (INV-KEY-01).
- **(b) Bring-your-own-key (BYO) mode** — the user supplies their own provider keys,
  stored encrypted on-device (INV-KEY-02, INV-KEY-03), transmitted only to the
  intended provider, never to the proxy.

From the user's perspective this is a choice about who holds the keys; the
capability set is the same. A mode switch must not cause data loss (INV-KEY-04).

## Consequences

- Managed mode is cloud-dependent and requires authentication (see ADR-0004); BYO
  mode is fully local with zero cloud contact (INV-AUTH-05).
- The two modes have structurally different trust boundaries and egress-enforcement
  properties — managed has a server boundary, BYO does not. That difference is
  resolved in ADR-0008 (egress mode-split).
- The AI orchestration client hides the transport difference (managed proxy vs BYO
  direct) behind one internal interface (ARCHITECTURE §2.1, NFR-MOD-02).
- BYO keys must never be logged or included in error payloads / telemetry
  (INV-KEY-02, INV-PROXY-02).

## Alternatives considered

- **Managed only.** Rejected — eliminates the local-first, no-cloud path that part
  of the audience wants (would also covertly remove BYO's defining property).
- **BYO only.** Rejected — forces every user to obtain and manage provider keys, a
  barrier for the primary "Overwhelmed Tracker" persona.
