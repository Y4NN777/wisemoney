# Runbook — Incident response

| Field   | Value                                              |
| ------- | -------------------------------------------------- |
| Status  | STUB — procedures not yet defined (Sprint S0)      |
| Date    | 2026-06-02                                          |
| Scope   | Detecting, triaging, and responding to security/operational incidents |
| Source  | THREAT_MODEL (threats, mitigations, residual risks) |

> **TODO: to be completed when the system is operable and incident classes are
> concrete.** No procedure is recorded yet — no steps are fabricated. The scope
> below marks what this runbook will cover, anchored to the documented threats.

## Scope (to be completed)

Incident classes to cover (from THREAT_MODEL), each TODO:

- **Auth incidents** — credential stuffing / brute-force, JWT signing-key
  compromise, account-enumeration abuse, password-reset token attack (THREAT_MODEL §2.2).
- **Cross-tenant isolation breach** on the Go edge (THREAT_MODEL §2.3).
- **Egress / consent incident** — suspected unintended full-egress, consent-flag
  tampering, XSS on the PWA origin (THREAT_MODEL §2.1, §2.4).
- **Postgres breach** — exposure of emails + Argon2id hashes (THREAT_MODEL §2.9).
- **Key/secret exposure** — provider key, BYO key, or DB credential leak
  (THREAT_MODEL §2.5, §2.6, §2.8).

## Detection (to be completed)

- TODO: signals, log sources (metadata-only logging per INV-PROXY-02), alerting.

## Triage & classification (to be completed)

- TODO: severity criteria; what is in scope of operator control vs. residual/accepted
  risk (THREAT_MODEL §7).

## Response & containment (to be completed)

- TODO: per-class containment. Stateful actions (key rotation, credential reset,
  taking the edge offline) are prepared for the engineer to run — not agent-executed.

## Recovery & post-incident (to be completed)

- TODO: recovery steps; post-incident review; link to a postmortem record.
