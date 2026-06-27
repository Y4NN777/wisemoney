# Security Policy — WiseMoney

## Philosophy

WiseMoney is a **local-first** personal finance app. Your financial data is
encrypted and stored on **your device** — not on our servers. The app works fully
offline; no cloud dependency is required. When you choose to use AI features, you
control what data leaves your device and which AI provider processes it.

## How your data is protected

### Data at rest (on your device)

| Layer | Mechanism |
|---|---|
| Storage | IndexedDB (your browser's built-in database) |
| Encryption | AES-256-GCM, the same standard banks use |
| Key derivation | Argon2id (your passphrase → encryption key) |
| Daily unlock | WebAuthn / biometrics (fingerprint, Face ID) |

Your passphrase never leaves your device. The encryption key exists only in memory
and is zeroed when you lock the app.

### Data in transit (to the managed edge)

- All API calls use **TLS 1.3** (HTTPS).
- Auth tokens are **short-lived JWTs** stored in memory only (never persisted).

### AI egress (what leaves for AI features)

You choose what to share, per feature:

| Level | What is sent | When |
|---|---|---|
| **Redacted** (default) | Aggregated summaries only — no amounts, no merchant names, no account details | Always safe; no financial PII leaves |
| **Full** | Actual transaction data (amounts, merchants, descriptions) | Only after **your explicit consent**, refreshed periodically |

In **managed mode**, the edge enforces a structural payload cap — it's impossible
for the app to send full data under a redacted consent. In **BYO-key mode**, you
run the app entirely client-side; your browser talks directly to your chosen AI
provider under your own API key, with no intermediate server.

### Auth (managed mode only)

- **Passwords** are hashed with **Argon2id** (memory-hard, GPU-resistant).
- **JWTs** use **HS256** with strict method validation.
- **Refresh tokens** are **rotated** on every use; a stolen refresh token is
  immediately invalidated.
- Login is **timing-equalized** — the server takes the same time whether the
  account exists or not, preventing enumeration.

## Dependencies & supply chain

- All dependencies are **pinned** to exact versions (no `^` ranges, no `:latest`
  Docker tags).
- A **dependency audit** (`osv-scanner`) runs on every push via GitHub Actions.
- Frontend packages are verified via integrity checks; the Go edge is built from
  a pinned `golang:1.25.11` image into a distroless runtime image.

## What we DON'T store

- ❌ Financial transactions, balances, or budgets
- ❌ Merchant names, categories, or amounts
- ❌ AI prompts or responses
- ❌ Your passphrase or encryption key
- ❌ Your biometric data (WebAuthn is handled by your OS/browser)

The managed-edge database (Postgres) stores **only**: user email, Argon2id hash,
and refresh-token hashes — nothing financial.

## Accepted risks (transparent disclosure)

1. **Full-egress to AI providers**: When you consent to full-egress, your
   transaction data is sent to a third-party AI provider (e.g., OpenAI, Google
   Gemini). Their retention policies apply. We choose providers that commit to
   **no-training** on your data, but once data leaves your device, we cannot
   control what the provider does with it. This is disclosed at consent time and
   is your choice.

2. **IndexedDB index keys**: To enable fast offline queries, we store timestamps,
   event types, and entity counts as plaintext IndexedDB index keys. This means
   an attacker with physical access to your unlocked device could see *that*
   transactions happened at certain times — but never *amounts*, *merchants*, or
   *descriptions*. This is a deliberate trade-off for offline-first performance.

3. **Consent state**: Your consent preferences are stored in localStorage
   (unencrypted but user-clearable). In managed mode, egress enforcement is also
   enforced server-side (signed consent assertion + structural payload cap).

## Reporting a vulnerability

This is a small-scale personal project. If you find a security issue:

- **Do not** open a public GitHub issue for an unpatched flaw.
- Report it privately to the maintainer via email or direct message.
- We aim to acknowledge receipt within 48 hours and patch critical issues within
  7 days. We'll credit you in the changelog (if you wish).

## Full threat model

For the complete STRIDE-based threat model, including detailed attack trees and
mitigation rationale, see [`docs/THREAT_MODEL.md`](./docs/THREAT_MODEL.md).

---

*Last reviewed: 2026-06-27*
