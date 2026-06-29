# Runbook — Incident response

| Field   | Value                                              |
| ------- | -------------------------------------------------- |
| Status  | Outline; production alerting and contacts pending   |
| Date    | 2026-06-29                                          |
| Scope   | Detecting, triaging, and responding to security/operational incidents |
| Source  | THREAT_MODEL (threats, mitigations, residual risks) |

> The main incident classes are concrete. Deployment-specific alerting, contacts,
> and escalation paths still need to be filled in before production launch.

## Scope

Incident classes to cover (from THREAT_MODEL):

- **Auth incidents** — credential stuffing / brute-force, JWT signing-key
  compromise, account-enumeration abuse, password-reset token attack (THREAT_MODEL §2.2).
- **Cross-tenant isolation breach** on the Go edge (THREAT_MODEL §2.3).
- **Egress / consent incident** — suspected unintended full-egress, consent-flag
  tampering, XSS on the PWA origin (THREAT_MODEL §2.1, §2.4).
- **Postgres breach** — exposure of emails + Argon2id hashes (THREAT_MODEL §2.9).
- **Key/secret exposure** — provider key, BYO key, or DB credential leak
  (THREAT_MODEL §2.5, §2.6, §2.8).

## Detection

- Edge logs should remain metadata-only per INV-PROXY-02.
- Watch for authentication spikes, repeated refresh-token reuse detection, provider
  routing failures, unexpected full-egress attempts, and database connectivity
  failures.
- Production alerting and log sinks are still pending deployment design.

## Triage & classification

- Classify whether the incident affects local-only financial data, edge auth data,
  provider keys, consent assertions, or third-party AI egress.
- Separate operator-controlled failures from accepted residual risks documented in
  THREAT_MODEL §7.

## Response & containment

- For suspected JWT signing-key compromise, rotate `JWT_SIGNING_KEY` and force
  active sessions to reauthenticate.
- For suspected consent signing-key compromise, rotate `CONSENT_SIGNING_KEY`; active
  assertions expire quickly but should still be invalidated by rotation.
- For provider-key exposure, revoke the provider key upstream, replace the local
  secret, and redeploy/restart the edge.
- For unintended full-egress, disable the affected managed provider route and review
  consent/assertion logs without exposing payloads.

## Recovery & post-incident

- Restore service only after keys/configuration are rotated and logs show normal
  auth and proxy behavior.
- Record timeline, affected data classes, mitigations, and follow-up tasks in a
  postmortem.
