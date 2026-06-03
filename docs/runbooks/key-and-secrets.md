# Runbook — Key and secrets management

| Field   | Value                                              |
| ------- | -------------------------------------------------- |
| Status  | STUB — procedures not yet defined (Sprint S0)      |
| Date    | 2026-06-02                                          |
| Scope   | JWT signing key, managed provider keys, DB credentials (SOPS/age) |
| Source  | THREAT_MODEL §2.2, §2.8, §2.9; ARCHITECTURE §8, §11 |

> **TODO: to be completed when the Go edge and its secrets delivery exist.** No
> procedure is recorded yet — no steps are fabricated. Secrets handling is a stateful
> operation: commands are prepared for the engineer to run, never agent-executed.

## Scope (to be completed)

Secrets this runbook will cover, each TODO:

- **JWT signing key** — server-only, never transmitted to a client, never committed
  (INV-AUTH-03; THREAT_MODEL §2.2, S-AUTH-02). Sourced from a secrets manager /
  env-injected secret.
- **Managed provider API keys** — held server-side only (INV-KEY-01); never logged or
  in error payloads (INV-PROXY-02).
- **Postgres credentials** — least-privilege DB user; injected at runtime via SOPS/age
  (THREAT_MODEL §2.9, I-PG-02).

> BYO provider keys are **not** in this runbook's scope: they are user-held, encrypted
> on-device, and never reach the server (INV-KEY-02). They are a client concern.

## Provisioning (to be completed)

- TODO: generate keys; encrypt with SOPS/age; never plaintext in version control.

## Injection / delivery (to be completed)

- TODO: runtime injection into the Go edge container (engineer-run).

## Rotation (to be completed)

- TODO: signing-key rotation (token-invalidation impact), provider-key rotation,
  DB-credential rotation. Stateful — prepared for the engineer.

## Verification (to be completed)

- TODO: confirm no secret is committed; confirm log sanitizer strips Authorization
  and `api_key` fields (THREAT_MODEL M-KEY-04, M-PROXY-03).
