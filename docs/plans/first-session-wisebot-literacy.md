# First session · WiseBot UI · Literacy AI — plan

Status: PROPOSED · 2026-09-26 · From Y4NN's review of the guided first session ("the checklist must be forcefully executed — see TickTick"), the WiseBot panel and the learning AI.

## Track 1 — First session as a required, task-shaped flow (TickTick pattern)

Replaces the dismissible "First steps" card (`components/FirstSteps`) and the three intro screens' role as the only guidance.

1. **Home is the setup until setup is done.** After the passphrase, `/` renders a stepper, not the dashboard: a progress rail and one step at a time. No dismiss; the app shell (tabs, header) is present but the stepper owns the page.
2. **Steps are the real actions, inline, and complete themselves.**
   ① *Your accounts* — Espèces shown with rename inline + "Add another" (name, type, balance); continue once the name is touched or a second account exists.
   ② *Your first movement* — the capture sheet opens on this step; the step completes when a movement is saved (the first-save message stays).
   ③ *One plan* — a single mini-form: budget for a category *or* a goal; "Later" allowed here only (planning is optional by product design).
   ④ *Where things are* — one screen: the three tabs with one line each, the assistant if a provider exists; "Finish" reveals the dashboard.
3. **State lives in the vault**, not localStorage: `appSettings` record `firstSession` = `{ completed: boolean, laterAt?: number }`; steps ①–③ are derived from data (same selectors as today's `firstSteps.ts`), so the flow resumes correctly after a lock or a reinstall from backup.
4. **Intro screens stay** (once per device, skippable) but shrink to what the stepper does not cover: what the app is, the passphrase rule.
5. Verify: fresh space at 375 px FR/EN — the user cannot reach the dashboard without an account named and a movement recorded; reload mid-flow resumes at the right step; restore of a backup with data skips the flow; smokes updated (setup walk + first movement now happen inside the stepper).

## Track 2 — WiseBot panel rework

Measured today (375 px): header = 4 hard-bordered cells (back · title · shield · trash · ×); consent = a bordered card with three bullets before anything else; empty state = icon + question + two privacy sentences; composer = image button + field + send.

1. **Header** — avatar + "WiseBot" + one-word status, a single overflow menu (privacy, new conversation), × — rounded, no cell borders.
2. **Consent** — one line above the composer with "OK" ("Questions go to Google. Nothing from your vault."), remembered; the full text lives behind the shield icon.
3. **Empty state** — three suggested questions as chips built from the help corpus (e.g. "How do I add an account?", "What is a transfer?", "How do backups work?"); tapping one sends it.
4. **Messages** — bubbles with the bot avatar, markdown kept, "open the guide step" link when the answer maps to a corpus task (`corpus.ts` routes already exist).
5. Verify: smoke's WiseBot steps (consent, question, tip) updated; contrast AA in both themes.

## Track 3 — Literacy AI on Gemma, with its own knowledge — research and planning first

Facts: help WiseBot = `api/help/_helpGateway.ts`, Gemma via the Gemini API, server key, model allow-listed; learning chat = `pillars/literacy` → user's BYO provider. Knowledge design exists: `docs/WISEBOT_KNOWLEDGE_ARCHITECTURE.md` (proposed 2026-08-30, deferred; domains, source tiers, claim model, Pinecone, tutoring layer).

1. **Research (pipeline, logged):** Gemma model availability and terms for a hosted gateway; corpus sources — international (OECD/INFE core competencies, World Bank/CGAP) and local (BCEAO/UEMOA financial-inclusion material, Burkina regulators, mobile-money practices) — with licence and freshness; what the deferred architecture assumed that has changed since August.
2. **Planning artifacts:** ADR — *literacy gateway on Gemma with a dedicated key, separate from help*; SRS amendments for the literacy pillar (scope, egress level, offline behaviour); a corpus v0 inventory (20–40 units, EN/FR) chosen from the research; decision on retrieval (start with in-bundle curated units; Pinecone only when the corpus outgrows it — per the architecture doc's own boundary).
3. **Implementation slices after approval:** `api/learn` gateway mirroring the help gateway (key `LEARN_GEMMA_API_KEY`, model allow-list, redacted context per INV-EGR); literacy pillar routes "teaching" to it when the managed learning gateway is configured, BYO otherwise; corpus v0 wired as grounding; consent copy updated.

Sequencing proposed: Track 1 → Track 2 → Track 3 research runs in parallel with 1–2 (agents), its implementation after the ADR is approved.
