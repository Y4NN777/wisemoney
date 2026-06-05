# Architecture Decision Records — WiseMoney

| Field      | Value                                          |
| ---------- | ---------------------------------------------- |
| Owner      | Jehoshaphat (Sefer — documentation)            |
| Format     | MADR-style (lightweight)                        |
| Started    | 2026-06-02 (Sprint S0, `/mishkan-init`)        |
| Source     | `docs/intake/intent-v0.1.md` + spec set        |

> An Architecture Decision Record (ADR) captures a single consequential decision,
> the context that forced it, the decision itself, and its consequences. ADRs are
> immutable once Accepted: a later decision that changes course is a **new** ADR
> that supersedes the old one (the old one is marked Superseded, never edited away).

---

## Format

Each ADR follows this structure:

- **Title** — `ADR-NNNN: <short imperative statement of the decision>`.
- **Status** — `Proposed` · `Accepted` · `Superseded by ADR-MMMM` · `Deprecated`.
- **Date** — the date the decision was taken.
- **Context** — the forces at play: the problem, constraints, and what made a
  decision necessary. Sourced, not invented.
- **Decision** — what was decided, stated plainly.
- **Consequences** — what becomes true as a result, good and bad; what it binds
  downstream; residual risks accepted.
- **Alternatives considered** — the options weighed and why they were not chosen.

ADRs cite their source decision (intake decision number / Gate) and the binding
invariant(s) or document section they map to. No rationale is asserted beyond what
the decisions and specs actually state.

---

## Index

| ADR | Title | Status | Source |
| --- | ----- | ------ | ------ |
| [ADR-0001](./0001-privacy-posture-full-egress-user-consented.md) | Full-egress, user-consented privacy posture with redacted-egress default | Accepted | Locked 1, Gate-1 6 |
| [ADR-0002](./0002-dual-ai-key-modes.md) | Both AI key modes: managed proxy and bring-your-own-key | Accepted | Locked 2 |
| [ADR-0003](./0003-single-device-local-only-persistence.md) | Single-device, local-only persistence; sync deferred Post-MVP | Accepted | Locked 3 |
| [ADR-0004](./0004-managed-proxy-multitenant-jwt-auth.md) | Multi-tenant hosted managed proxy with self-managed email/password JWT auth | Accepted | Gate-2 8, Gate-3 13 |
| [ADR-0005](./0005-go-backend-edge.md) | Go for the backend edge (deviation from FastAPI baseline; client-heavy logic) | Accepted | Gate-4 16, 17 |
| [ADR-0006](./0006-react-ts-pwa-hybrid-key-management.md) | React + TS PWA frontend with hybrid passphrase + WebAuthn key management | Accepted | Gate-4 18, 19 |
| [ADR-0007](./0007-multi-currency-from-mvp.md) | Multi-currency from MVP (integer minor units + ISO-4217; cached user-editable FX) | Accepted | Gate-3 14 |
| [ADR-0008](./0008-egress-enforcement-mode-split.md) | Egress-enforcement mode-split and the INV-EGR-03 amendment | Accepted | Gate-5 23, 24, 25 |
| [ADR-0009](./0009-optional-encrypted-export.md) | Optional encrypted export in MVP; balanced passphrase policy | Accepted | Gate-5 26, 27 |
| [ADR-0010](./0010-dependency-security-baseline-and-scanning-policy.md) | Dependency security baseline and scanning policy | Accepted | `/dep-audit` 2026-06-03 |

---

*Maintained by Sefer (Jehoshaphat). New consequential decisions land here as new,
numbered, dated records.*
