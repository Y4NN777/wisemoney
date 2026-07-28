# WiseMoney — UML Diagram Set

| Field   | Value                                              |
| ------- | -------------------------------------------------- |
| Title   | WiseMoney — UML Diagram Set Index              |
| Date    | 2026-06-02                                         |
| Version | UML v0.1                                           |
| Status  | Draft                                              |
| Owner   | Nathan (software architecture) + Shallum (data modeling) |
| Source  | CONTRACT v0.1; ARCHITECTURE v0.1; THREAT_MODEL v0.1 |
| Sprint  | MODELING T-S0-01                                   |

This is the MODELING (T-S0-01) diagram set for WiseMoney. All diagrams are
Mermaid. All source documents are versioned at v0.1, dated 2026-06-02.

---

## Diagram index

| File | Owner | Type | Contents |
| ---- | ----- | ---- | -------- |
| `01-domain-er.md` | Shallum (data modeling) | Entity-Relationship | Domain model: FinancialEvent, Account, Transaction, Category, Budget, Goal, RecurringItem, FinancialStateSnapshot. Canonical entity definitions and relationships. |
| `02-sequences.md` | Nathan (architecture) | Sequence (`sequenceDiagram`) | Six non-trivial flows: offline capture; aggregate-only managed AI; BYO-key AI; auth; hybrid key management; export and restore. |
| `03-state-machines.md` | Nathan (architecture) | State machine (`stateDiagram-v2`) | Per-feature AI disclosure, budget and goal lifecycles, and RecurringItem lifecycle (scheduled → realised-as-Transaction or archived). |
| `04-class-component.md` | Nathan (architecture) | Class / Component (`classDiagram`) | Client state, intelligence, consent, crypto and export modules; Go auth, rate limiting, routing, payload validation, logging and provider adapters. |

---

## Scope and authorship notes

- `01-domain-er.md` is authored by Shallum. The sequence and class diagrams
  reference domain entities defined there; they do not redefine them.
- `02-sequences.md` through `04-class-component.md` are authored by Nathan.
- The C4 context / container / component diagrams (Meshullam) are a separate
  artifact set and are not in this directory. The class/component diagram in
  `04-class-component.md` intentionally overlaps the C4 Component view to add
  method-level responsibility detail not carried in the C4 notation.
- All diagrams are accurate to the source specifications. No components or flows
  are invented that are not present in CONTRACT, ARCHITECTURE, or THREAT_MODEL.
- Money is represented as integer minor units at every boundary (INV-MON-01).
  No floats appear in any diagram.
