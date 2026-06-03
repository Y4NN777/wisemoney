# WiseMoney — Documentation

| Field           | Value                                              |
| --------------- | -------------------------------------------------- |
| Project         | WiseMoney                                      |
| Current sprint  | S0 (initialisation)                                |
| Date            | 2026-06-02                                         |
| Doc owner       | Jehoshaphat (Sefer — documentation)                |
| Provenance      | `docs/intake/intent-v0.1.md`                       |

> This is the home of the WiseMoney documentation set. Every document below is
> dated and sourced; nothing here is fabricated. Sefer writes to `docs/` only.

---

## Project at a glance

**WiseMoney** is a local-first personal-finance progressive web app (PWA) that
unifies three pillars usually kept separate: real-time **financial state tracking**,
AI-driven **financial intelligence**, and adaptive **financial literacy** — delivered
through a minimal, mobile-first interaction loop. Data is held on-device by default
(encrypted IndexedDB), single-device for the MVP, with any cloud/AI egress gated
behind explicit, per-feature user consent. Two AI-key modes coexist: a managed Go
proxy that holds provider keys server-side, and a bring-your-own-key mode that runs
fully local with no cloud dependency.

This documentation set was produced during `/mishkan-init`, Sprint **S0**, on
**2026-06-02**.

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
| **Data model** | Persistence schema design: client IndexedDB/Dexie object stores + encryption boundary, edge Postgres tables, designed migrations (not executed). | [`modeling/data-model.md`](./modeling/data-model.md) |

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
| **Runbooks** | Operational procedures (proxy deployment, incident response, secrets, provider-terms verification). Stubs at S0 — completed as the relevant systems exist. | [`runbooks/`](./runbooks/) |

---

## Provenance

The raw source intent and all locked / gated decisions are recorded in
[`intake/intent-v0.1.md`](./intake/intent-v0.1.md). That file is the decision source
for the ADR log and is not itself a deliverable — it is source material captured on
2026-06-02.

---

*Maintained by Sefer (Jehoshaphat, the Recorder). Diátaxis quadrant on every doc;
MADR for ADRs; Keep a Changelog where a changelog applies. No undated docs.*
