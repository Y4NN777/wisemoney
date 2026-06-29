# Runbooks — WiseMoney

| Field   | Value                                          |
| ------- | ---------------------------------------------- |
| Owner   | Project maintainers                              |
| Status  | Mixed: live Vercel PWA + local managed-service runbooks + pre-production outlines |
| Date    | 2026-06-29                                      |

> Runbooks are operational procedures for running and recovering the system. The
> web app is live at `https://wisemoney.y7labs.studio/` on Vercel. The managed
> WiseMoney service and Postgres stack are not deployed yet; their concrete
> procedure is local/dev Docker Compose until a hosting target is chosen.
> Incident-response and production secrets guidance remain pre-production
> outlines until deployment topology and alerting are chosen.

---

## Index

| Runbook | Scope | Status |
| ------- | ----- | ------ |
| [proxy-deployment.md](./proxy-deployment.md) | Running the managed Go service + Postgres via Docker Compose. | Local/dev only; managed service not deployed yet |
| [incident-response.md](./incident-response.md) | Detecting, triaging, and responding to security/operational incidents. | Outline; production signals pending |
| [key-and-secrets.md](./key-and-secrets.md) | Managing the JWT signing key, consent signing key, provider keys, and DB credentials. | Active local template; production SOPS/age process pending |
| [provider-terms-verification.md](./provider-terms-verification.md) | Launch-blocker verification of AI provider data-handling terms. | Verified 2026-06-05 — pending legal sign-off + consent-UI naming |
| [dependency-scanning.md](./dependency-scanning.md) | Installing osv-scanner; manifest and binary scanning; reading results; toolchain pitfalls. | Active |

---

## Conventions

- Each runbook states **preconditions**, **steps**, **verification**, and
  **rollback** where applicable.
- No `:latest` Docker tags; all images pinned (harness primitive).
- Secrets via SOPS/age; never plaintext in version control.

---

*Historical S0 runbook drafts remain dated in their files where they preserve
original scope. Live operational steps are updated as the implementation changes.*
