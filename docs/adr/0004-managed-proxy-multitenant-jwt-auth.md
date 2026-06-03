# ADR-0004: Multi-tenant hosted managed proxy with self-managed email/password JWT auth

| Field   | Value                                                       |
| ------- | ----------------------------------------------------------- |
| Status  | Accepted                                                    |
| Date    | 2026-06-02                                                  |
| Source  | Intake Gate-2 decision 8; Gate-3 decision 13               |
| Binds   | INV-AUTH-01..05, INV-PROXY-01; ARCHITECTURE §8; FR-AUTH    |

## Context

Managed mode (ADR-0002) holds provider keys server-side and serves multiple users.
This requires a way to isolate users from one another and to attribute requests and
rate budgets correctly. A decision was required on tenancy model and on how
authentication is provided.

## Decision

The managed proxy is **multi-tenant and hosted**, serving multiple users with
**per-user isolation** and per-user rate-limiting. This introduces a user identity +
authentication subsystem (new requirement area **FR-AUTH**, managed-mode only).

Authentication is **self-managed email + password with self-issued JWTs**
(Gate-3 decision 13): the proxy owns credential storage (password hashing with a
strong adaptive hash, INV-AUTH-02), password reset, JWT issuance/rotation/validation
(INV-AUTH-03), and brute-force defence. Every request to the proxy must carry a
valid, unexpired, server-signed JWT (INV-AUTH-01) — there is no unauthenticated
path. **BYO-key mode remains fully local and requires no authentication**
(INV-AUTH-05).

## Consequences

- Per-user isolation is absolute (INV-AUTH-04): no user's provider keys, financial
  context, or rate budget is accessible to or inferable by another. Isolation holds
  at routing and rate-limiting.
- The proxy is stateless with respect to financial data (INV-PROXY-01); it persists
  only auth + rate-limit state.
- The THREAT_MODEL scope widens to cover self-managed auth: credential stuffing,
  JWT forgery/replay, account enumeration, password-reset token attacks, and
  cross-tenant routing (THREAT_MODEL §2.2, §2.3). Mitigations include short-lived
  access JWTs with rotating refresh tokens, login rate-limiting/lockout,
  constant-time comparison, and routing keyed only on the JWT `sub` claim.
- Local-first survives as a user choice, not the only path — BYO mode bypasses all
  of this (ADR-0002).

## Alternatives considered

- **Single-tenant / no auth.** Rejected — a multi-user hosted proxy without auth
  collapses every user's provider budget and isolation into a shared anonymous pool.
- **Third-party / federated identity (OAuth provider).** Not selected — Gate-3
  decision 13 chose self-managed email + password JWT; the proxy owns the full
  credential lifecycle.
