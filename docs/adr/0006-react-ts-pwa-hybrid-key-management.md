# ADR-0006: React + TS PWA frontend with hybrid passphrase + WebAuthn key management

| Field   | Value                                                       |
| ------- | ----------------------------------------------------------- |
| Status  | Accepted                                                    |
| Date    | 2026-06-02                                                  |
| Source  | Intake Gate-4 decisions 18, 19                             |
| Binds   | INV-PERS-01..03, INV-KEY-03; ARCHITECTURE §7; THREAT_MODEL §2.5 |

## Context

The client holds all domain logic (ADR-0005) and the user's complete financial
history, encrypted on-device. A decision was required on (a) the frontend platform
and (b) how the encryption key is derived and how the user unlocks day-to-day without
either retyping a passphrase every session or weakening the cryptographic root.

## Decision

**Frontend — React + TypeScript PWA (Gate-4 decision 18).** Built with Vite, a
service worker for offline operation, Dexie over IndexedDB for the encrypted event
store, Web Crypto **AES-GCM** for encryption at rest, and client-side event-sourcing.
Package manager is **pnpm**.

**Encryption key — hybrid (Gate-4 decision 19).** A user **passphrase** is the
cryptographic root: Argon2id derives the master key from it. Day-to-day unlock is via
**WebAuthn / biometric**, which unwraps a stored wrapped copy of the master key — a
convenience layer over the passphrase, not a replacement for it. **Losing the
passphrase loses the data**; the lossless JSON export is the explicit recovery path.

## Consequences

- The PWA works offline (service worker + local store), satisfying INV-PERS-01.
- All financial data and key material are encrypted at rest at all times via AES-GCM
  (INV-PERS-02, INV-KEY-03); the passphrase itself is never stored — only the tuned
  Argon2id parameters and salt, so the key can be re-derived when an export is
  restored on a fresh device (ARCHITECTURE §7).
- WebAuthn is a convenience unlock, not a second cryptographic factor. Residual risk:
  platform-authenticator sync (e.g. iCloud Keychain) could carry the wrapped key
  off-device; the user must be told the passphrase is the sole root of trust
  (THREAT_MODEL §2.5, S-KEY-01, M-KEY-05).
- Passphrase loss is unrecoverable by design (THREAT_MODEL §2.5, D-KEY-01); the app
  must actively prompt regular exports and make irreversibility unambiguous. The
  passphrase **policy** is set in ADR-0009.
- The strict CSP / SRI / pinned-dependency posture is essential for this client,
  since XSS on the PWA origin can reach the in-session decrypted key
  (THREAT_MODEL §2.4, §2.6).

## Alternatives considered

- **Native mobile app.** Not selected — the product is defined as a PWA (intent §1,
  PRD §1); a PWA delivers the mobile-first, offline-first surface without app-store
  friction.
- **Passphrase-only unlock (no WebAuthn).** Rejected — retyping a strong passphrase
  every session is friction the primary "Overwhelmed Tracker" persona would abandon.
- **WebAuthn as the cryptographic root.** Rejected — platform-authenticator sync and
  device-bound keys make it unsuitable as the recovery root; the passphrase stays the
  root and WebAuthn stays a convenience.
