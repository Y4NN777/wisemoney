# WiseMoney — Documentation

| Field           | Value                                              |
| --------------- | -------------------------------------------------- |
| Project         | WiseMoney                                      |
| Current phase   | Active MVP implementation                          |
| Date            | 2026-06-29                                         |
| Doc owner       | Project maintainers                                |
| Provenance      | `docs/intake/intent-v0.1.md`                       |

> This is the home of the WiseMoney documentation set. S0 documents are retained
> as the design baseline; live indexes and runbooks are updated as implementation
> changes land.

---

## Project at a glance

**WiseMoney** is a local-first personal-finance progressive web app (PWA) that
unifies three pillars usually kept separate: real-time **financial state tracking**,
AI-driven **financial intelligence**, and adaptive **financial literacy** — delivered
through a minimal, mobile-first interaction loop. Data is held on-device by default
(encrypted IndexedDB), single-device for the MVP, with any cloud/AI egress gated
behind explicit, per-feature user consent. Two AI-key modes coexist: a managed
WiseMoney service for server-held provider keys, and a bring-your-own-key mode
that runs without a WiseMoney server.

The baseline documentation set was produced during Sprint **S0** on
**2026-06-02**. Current implementation has advanced beyond that baseline; use this
index, the package READMEs, and `CHANGELOG.md` for live status.

---

## Specification set (the SWE-BASICS-BEFORE-CODE sequence)

The specs were produced in order; each constrains the next. Read them in sequence.

| Document | What it owns | Link |
| -------- | ------------ | ---- |
| **PRD** | What the product must do and why (problem, personas, pillars, locked decisions). | [`PRD.md`](./PRD.md) |
| **SRS** | Software requirements — the *how-much* and the start of the *how* boundary. | [`SRS.md`](./SRS.md) |
| **CONTRACT** | Binding invariants and guarantees (money, event-log, egress, key, auth, persistence, proxy). | [`CONTRACT.md`](./CONTRACT.md) |
| **ARCHITECTURE** | How the system is structured: components, data flows, binding architecture decisions. | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| **THREAT_MODEL** | Adversarial design: STRIDE analysis, trust boundaries, mitigations, residual risks. | [`THREAT_MODEL.md`](./THREAT_MODEL.md) |

---

## Diagrams

| Document | What it owns | Link |
| -------- | ------------ | ---- |
| **C4 diagrams** | Context / Container / Component views of the system (architectural). | [`diagrams/C4/`](./diagrams/C4/) |
| **UML diagrams** | MODELING (T-S0-01): domain/ER model, sequence diagrams, state machines, class/component detail. | [`diagrams/UML/`](./diagrams/UML/) |

---

## Modeling (T-S0-01)

| Document | What it owns | Link |
| -------- | ------------ | ---- |
| **Data model** | Persistence schema design: client IndexedDB/Dexie object stores + encryption boundary, edge Postgres tables, and migration history. | [`modeling/data-model.md`](./modeling/data-model.md) |

---

## Decision record

| Document | What it owns | Link |
| -------- | ------------ | ---- |
| **ADR log** | Architecture Decision Records — one record per consequential decision, in MADR-style format. | [`adr/`](./adr/) |

The ADR log captures the consequential initialisation decisions (locked decisions
1–4 and Gate-1 through Gate-5) as durable, dated, sourced records. Start at
[`adr/README.md`](./adr/README.md) for the format and the index.

---

## Operations

| Document | What it owns | Link |
| -------- | ------------ | ---- |
| **Runbooks** | Operational procedures for proxy deployment, incident response, secrets, provider-terms verification, and dependency scanning. Some are active, others remain pre-production outlines. | [`runbooks/`](./runbooks/) |

---

## Provenance

The raw source intent and all locked / gated decisions are recorded in
[`intake/intent-v0.1.md`](./intake/intent-v0.1.md). That file is the decision source
for the ADR log and is not itself a deliverable — it is source material captured on
2026-06-02.

---

*MADR for ADRs; Keep a Changelog where a changelog applies. Historical S0 records
remain dated to their original decision points.*
