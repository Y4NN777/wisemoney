# Security Policy — WiseMoney

> Required by MISHKAN standards in every repository. Dated 2026-06-02.
> Authoritative threat analysis: [`docs/THREAT_MODEL.md`](./docs/THREAT_MODEL.md).

## Security posture (summary)

WiseMoney is **local-first**. All financial data lives encrypted on the user's
device (IndexedDB, AES-GCM at rest, INV-PERS-02). The managed Go edge is a thin,
stateless auth + AI-gateway and **never persists financial data** (INV-PROXY-01).
Postgres holds only auth + refresh tokens. **Bring-your-own-key mode** runs fully
client-side with no cloud dependency.

Key controls (see THREAT_MODEL for the full STRIDE analysis):

- **Encryption at rest** — hybrid key management: passphrase → Argon2id master key,
  WebAuthn/biometric daily unlock. Balanced passphrase strength bar (NFR-SEC-05).
- **Consent-gated egress** — raw financial detail leaves the device only under
  explicit, per-feature consent; redacted (aggregate-only) egress is the default and
  the declined-consent fallback (INV-EGR-01).
- **Egress enforcement is mode-split** (INV-EGR-03, amended): managed mode enforces
  at the edge (structural payload cap + signed consent assertion); BYO-key mode is
  client-side, user-as-principal, with explicit disclosure.
- **Auth** — Argon2id password hashing (INV-AUTH-02), server-signed expiring JWTs
  (INV-AUTH-03), per-user isolation (INV-AUTH-04).
- **Secrets** — managed via SOPS/age; never plaintext in version control. `.env` is
  git-ignored; only `.env.example` (placeholders) is committed.
- **No `:latest` Docker tags** — all images pinned.

## Accepted residual risks

- Full-egress (consented) sends raw financial detail to third-party AI providers;
  provider-side retention is outside our control once data egresses. Disclosed to the
  user. **Launch-blocker:** verify provider data-handling/retention/opt-out terms
  (`docs/runbooks/provider-terms-verification.md`).
- Plaintext IndexedDB index keys leak activity *timing/volume* (never amounts/
  merchants) to an adversary with device read access. Accepted for offline-first
  queryability.

## Reporting a vulnerability

This is a personal-scale project (tens–hundreds of users). Report security issues
privately to the maintainer; do not open a public issue for an unpatched flaw.
