# ADR-0009: Optional encrypted export in MVP; balanced passphrase policy

| Field   | Value                                                       |
| ------- | ----------------------------------------------------------- |
| Status  | Accepted                                                    |
| Date    | 2026-06-02                                                  |
| Source  | Intake Gate-5 decisions 26, 27                             |
| Binds   | INV-PERS-03, INV-PERS-04; THREAT_MODEL §2.5, §2.7          |

## Context

The JSON export is the sole backup and restore path (INV-PERS-03) and the recovery
path for passphrase loss (ADR-0006). A plaintext export contains the user's complete
financial history and, once on disk or in cloud storage, can be attacked offline with
no rate limiting (THREAT_MODEL §2.7, I-EXPORT-01). Two decisions were required: whether
encrypted export is MVP or Post-MVP, and what passphrase quality bar to enforce —
balanced against the low-friction need of the primary "Overwhelmed Tracker" persona.

## Decision

**Optional encrypted export in the MVP (Gate-5 decision 26).** Ship an **opt-in,
passphrase-encrypted export alongside the plaintext export**, with a clear plaintext
warning at export time. JSON remains the lossless restore format (INV-PERS-03); the
encrypted variant **wraps** it. (This advances the THREAT_MODEL's encrypted-export item
from Post-MVP to MVP.)

**Balanced passphrase policy (Gate-5 decision 27).** Enforce a sensible minimum
(length plus a zxcvbn-style strength check) with a **live strength meter**, blocking
**only genuinely weak** passphrases. Tuned for the Overwhelmed Tracker: low friction,
real security. The same balanced bar applies to the master passphrase (ADR-0006) and
any export-specific passphrase.

## Consequences

- Users can store an export in cloud locations without exposing their full financial
  history in plaintext; the plaintext export remains available but is explicitly
  warned about and is treated as a credential (THREAT_MODEL §2.7).
- CSV/XLSX remain human-readable, non-restore secondaries (INV-PERS-04) regardless of
  the encrypted-export option.
- The passphrase strength bar mitigates weak-passphrase offline cracking
  (THREAT_MODEL §2.5, T-KEY-01, M-KEY-01) while keeping setup friction low; the live
  meter communicates strength without hard, opaque rejection.
- Encrypted export does not change the passphrase-loss-is-data-loss property
  (ADR-0006); active export prompts and the irreversibility warning still apply.

## Alternatives considered

- **Plaintext-only export (encrypted export Post-MVP).** Not selected — Gate-5
  decision 26 moved encrypted export into the MVP because the plaintext disclosure
  risk was judged unacceptable to defer.
- **Strict passphrase policy (complexity rules, dictionary checks).** Rejected as the
  default — too much friction for the primary persona; a strength-meter + block-only-weak
  approach gives real security with less abandonment.
- **No passphrase quality bar.** Rejected — leaves the export and the at-rest store
  exposed to trivially weak passphrases.
