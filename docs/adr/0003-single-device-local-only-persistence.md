# ADR-0003: Single-device, local-only persistence; sync deferred Post-MVP

| Field   | Value                                                       |
| ------- | ----------------------------------------------------------- |
| Status  | Accepted                                                    |
| Date    | 2026-06-02                                                  |
| Source  | Intake locked decision 3                                   |
| Binds   | INV-PERS-01..05; PRD §9.3, §11; ARCHITECTURE §4            |

## Context

The product must always know where the user's money is, including offline. A
decision was required on where data lives and whether multi-device sync is in scope
for the MVP. Intent §6.2 marks the sync layer "Optional".

## Decision

Persistence is **single-device, local-only** for the MVP. Financial data lives in
**encrypted on-device storage (IndexedDB)**; the local store is the operative store
and there is no cloud replication. Backup and restore are via **user-driven file
export** (JSON is the lossless, restore-capable format; CSV/XLSX are human-readable,
non-restore secondaries). **Multi-device sync is explicitly out of MVP scope.**

The architecture is **sync-ready** — an append-only event log with stable
identifiers (see ADR-0005 / ARCHITECTURE §4) is the substrate a Post-MVP sync layer
would build on — but sync itself is not built now.

## Consequences

- Capture and read operations succeed with no network connection; the dashboard and
  timeline work identically offline and online (INV-PERS-01).
- All financial data and key material are encrypted at rest on-device at all times
  (INV-PERS-02); no financial data is replicated to any cloud service (INV-PERS-05).
- The JSON export is the **sole** backup and restore path and must be lossless
  (INV-PERS-03). It is also the recovery path for passphrase loss (see ADR-0006).
- Losing the device without an export means losing the data; in-app export prompts
  mitigate this (THREAT_MODEL §2.5, D-KEY-01).
- Sync (multi-device, conflict resolution, background sync) is tracked as Post-MVP
  (PRD §11) so the MVP architecture stays ready without building it.

## Alternatives considered

- **Cloud-synced from MVP.** Rejected — out of MVP scope per locked decision 3 and
  intent §6.2; it would add a cloud dependency and a second data store, expanding
  the threat surface before it is needed.
- **Local-only with no sync-readiness.** Rejected — would force a costly rewrite to
  add sync later; the append-only log makes sync-readiness cheap to preserve now.
