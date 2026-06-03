# Runbooks — WiseMoney

| Field   | Value                                          |
| ------- | ---------------------------------------------- |
| Owner   | Sefer (Jehoshaphat) — index; per-runbook owners TBD |
| Status  | Stubs (Sprint S0) — completed as systems exist |
| Date    | 2026-06-02                                      |

> Runbooks are operational procedures for running and recovering the system. At
> Sprint S0 the systems they describe do not yet exist, so these are **stubs**:
> clear headings marking the scope of each runbook, with no fabricated steps. Each
> is completed when the relevant system is built and operable. Stateful operations
> (deploys, secrets handling, DB work) are prepared here for the engineer to run —
> never executed by an agent.

---

## Index

| Runbook | Scope | Status |
| ------- | ----- | ------ |
| [proxy-deployment.md](./proxy-deployment.md) | Deploying the Go edge proxy + Postgres via Docker Compose. | Stub |
| [incident-response.md](./incident-response.md) | Detecting, triaging, and responding to security/operational incidents. | Stub |
| [key-and-secrets.md](./key-and-secrets.md) | Managing the JWT signing key, provider keys, and DB credentials (SOPS/age). | Stub |
| [provider-terms-verification.md](./provider-terms-verification.md) | Launch-blocker verification of AI provider data-handling terms (S0). | Stub |

---

## Conventions (to apply when these are completed)

- Each runbook states **preconditions**, **steps**, **verification**, and
  **rollback** where applicable.
- Stateful commands are written out for the engineer to run; no agent executes them.
- No `:latest` Docker tags; all images pinned (harness primitive).
- Secrets via SOPS/age; never plaintext in version control.

---

*Maintained by Sefer (Jehoshaphat). Stubs are filled in as the corresponding systems
become operable, sourced from ARCHITECTURE, THREAT_MODEL, and the Migdal infra phase.*
