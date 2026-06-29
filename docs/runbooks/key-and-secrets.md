# Runbook — Key and secrets management

| Field   | Value                                              |
| ------- | -------------------------------------------------- |
| Status  | Active local template; production SOPS/age process pending |
| Date    | 2026-06-29                                          |
| Scope   | JWT signing key, consent signing key, managed provider keys, DB credentials |
| Source  | THREAT_MODEL §2.2, §2.8, §2.9; ARCHITECTURE §8, §11 |

> `.env.example` documents the local/dev shape. Production must inject equivalent
> values from a secrets manager or SOPS/age-encrypted file; plaintext `.env` files
> are for local development only and must never be committed.

## Scope

Secrets this runbook covers:

- **JWT signing key** — server-only, never transmitted to a client, never committed
  (INV-AUTH-03; THREAT_MODEL §2.2, S-AUTH-02). Sourced from a secrets manager /
  env-injected secret.
- **Consent signing key** — dedicated HMAC key for consent assertions. It must be
  different from `JWT_SIGNING_KEY`; `config.Load` enforces this at startup.
- **Managed provider API keys** — held server-side only (INV-KEY-01); never logged or
  in error payloads (INV-PROXY-02).
- **Postgres credentials** — least-privilege DB user; injected at runtime via SOPS/age
  (THREAT_MODEL §2.9, I-PG-02).

> BYO provider keys are **not** in this runbook's scope: they are user-held, encrypted
> on-device, and never reach the server (INV-KEY-02). They are a client concern.

## Local provisioning

```bash
cp .env.example .env
```

Fill at least:

- `POSTGRES_PASSWORD`
- `DATABASE_URL`
- `JWT_SIGNING_KEY`
- `CONSENT_SIGNING_KEY`
- provider keys needed by the managed provider router

Use independent high-entropy values for `JWT_SIGNING_KEY` and
`CONSENT_SIGNING_KEY`; do not reuse placeholders from `.env.example`.

## Injection / delivery

- Local/dev Compose reads `.env` through `env_file: .env`.
- Vite reads `VITE_EDGE_BASE_URL` from the same local environment for managed mode.
- Production should inject secrets through the deployment platform; do not bake
  secrets into images.

## Rotation

- Rotating `JWT_SIGNING_KEY` invalidates active access JWTs.
- Rotating `CONSENT_SIGNING_KEY` invalidates active consent assertions.
- Rotating provider keys should require only an edge restart/redeploy with updated
  environment.
- Rotating DB credentials requires updating Postgres credentials and `DATABASE_URL`
  together.

## Verification

- `git status --short` must not show `.env`.
- Edge startup must fail if `JWT_SIGNING_KEY` and `CONSENT_SIGNING_KEY` match.
- Confirm logs do not contain `Authorization`, `api_key`, provider keys, JWTs, or
  consent assertions.
