# Runbook — Go edge proxy deployment (Docker Compose)

| Field   | Value                                              |
| ------- | -------------------------------------------------- |
| Status  | STUB — system does not yet exist (Sprint S0)       |
| Date    | 2026-06-02                                          |
| Scope   | Deploying the Go edge proxy + Postgres via Docker Compose |
| Source  | ARCHITECTURE §11 (deployment topology)             |

> **TODO: to be completed when the Go edge proxy and its Docker Compose deployment
> exist.** No procedure is recorded yet — no steps are fabricated. The scope below
> marks what this runbook will cover. Detailed hosting/ops is deferred to the Migdal
> infra phase (ARCHITECTURE §11).

## Scope (to be completed)

- **Topology.** Two units + datastore: PWA static host, Go proxy (edge), Postgres —
  orchestrated by Docker Compose (ARCHITECTURE §11). BYO-key mode bypasses the proxy
  entirely.
- **Images.** Distroless, version-pinned Go image; no `:latest` tags anywhere.

## Preconditions (to be completed)

- TODO: required environment, pinned image versions, network layout, secrets present.

## Deployment steps (to be completed)

- TODO: Compose bring-up sequence (engineer-run — agents do not execute deploys).

## Verification (to be completed)

- TODO: health checks; confirm Postgres reachable only from the edge on the Docker
  network (no public port binding); confirm auth path rejects unauthenticated requests.

## Rollback (to be completed)

- TODO: rollback to previous pinned image; data-safety notes.

## Notes

- Postgres holds auth + rate-limit metadata only — never financial data.
- The hardening overlay is re-applied on every container recreate (not one-time).
