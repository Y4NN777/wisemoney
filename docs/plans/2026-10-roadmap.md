# WiseMoney roadmap after the October fixes

2026-10-16 · Diátaxis: Explanation · Owner: Y4NN · Kept up to date at the end of each workstream.

## 1. Live (pushed)

- Quick line "taxi 2000" in the capture sheet (ADR-0014, accepted).
- `/lab/voice`: whisper-tiny measuring page (unlinked).
- Accounts: archive a setup-only account; correct the opening balance; explained refusals.
- Dark mode: attention and positive colours readable.
- Every "Échec" message says what happened, why, what to do (8 screens).
- Category tooling: ADR-0015 (accepted), dataset generator, sourced West African lexicon.

## 2. Done, not pushed

- `ac0d566` past months keep a corrected opening balance; archive refused before the confirm.

## 3. Waiting on Y4NN

| # | What | Why it blocks |
|---|------|---------------|
| Y1 | `git push origin main` | ships section 2 |
| Y2 | `/lab/voice` on the Android and the iPhone: paste "Copy results" | decides the voice pack (W3) |
| Y3 | Trial run of the dataset generator, then the full run | feeds the category model (W2) |
| Y4 | Confirm the labelling rules in `tools/categorize/labelingGuide.mjs` (airtime and mobile money fees → Factures; family support → Cadeaux; own sales → Travail indépendant; tontine payout → Autres revenus; transfers and savings → no category) | the dataset follows them |

## 4. Workstreams, in order

Each one is planned, approved, built, gated (typecheck, lint, tests, build, smoke) and shipped before the next starts. W2 data generation runs in the background meanwhile.

### Added 2026-10-17 (Y4NN)

Status 2026-10-17: done and pushed or committed: W1 steps 1–3 (reader v2 and bank d13747d, understood
line and chained purchases 8697027, category from history a4e5090), R1 (d013523), E1 (13999d2), landing
(a6451f6 returning users on unlock, 39c6c69 demo and logo mark), G1 (f7a6ad7). Next when Y4NN resumes:
ADR-0016 step 1 (notification delivery test) or W1 steps 4–5.

- **R1** reminders on by default, an empty bell that says why: done (d013523).
- **E1** examples and suggestions from the user's own notes: placeholder from frequent notes (a
  time-of-day local example for new users), three one-tap frequent purchases, a microphone icon button
  that dictates on the device where possible and otherwise opens the keyboard and points to its
  microphone (no emoji).
- **G1** a greeting line computed from the user's data with one call to action (deadline today, budget
  at 90%, receivable due, nothing recorded today, the day's total), replacing the 14 generic messages
  removed on 2026-09-25.
- **N2** an honest notification status in Settings; **ADR-0016** daily reminder push without financial
  data, step 1 a delivery test on Y4NN's Android and iPhone.

### W1 · Fast, reliable capture (next)

Problem: the quick line misreads common phrases (measured 2026-10-16: "Taxi deux mille." → 2 F; "j'ai paye le taxi" → income; "2 pains à 250" → 2 F; a second purchase is lost) and never shows what it understood; the sheet hides the + button behind its toast and doubles Dépense/Revenu.

1. Quick-entry reader v2: normalise dictation text, full French number grammar, quantity × price, several purchases in one line, no overlapping direction words, a confidence per field.
2. "Understood" line under the input ("2 000 F · Dépense · « taxi »"); ambiguity asks instead of guessing.
3. Test bank of 300+ real phrases with a CI floor.
4. Category from history: the category the user always chose for the same note is pre-selected, marked "Suggéré".
5. Sheet fixes from the audit: toast above the bottom bar, one Dépense/Revenu control, Ajouter visible above the keyboard, account visible and changeable, income categories first in Revenu, edit can change account and date.

Done when: the test bank passes its floor, the audit's capture findings are closed, smoke covers them.

### W2 · Category model (ADR-0015)

1. Dataset (Y3) and review of `data/review.jsonl`.
2. Training script: Model2Vec student on our vocabulary, int8, classification head; reproducible.
3. Evaluation: accuracy, precision at threshold, coverage, per-category recall; CI floor.
4. Integration after W1.4: model below the user's history; pre-select only above the calibrated threshold.

Done when: the model file is a few MB, the floor holds in CI, the sheet suggests a category offline.

### W3 · Hybrid voice set-up

Decided 2026-10-17 (Y4NN): hybrid; plan in `2026-10-w3-voice.md`. Steps 1–2 (ADR-0014 amendment;
phrases, scoring, decision, preflight, profile in `apps/web/src/voice/setup/`) done 2026-10-17.
Step 3 (Settings › Voix with engines A and B, permission guidance) done 2026-10-17. Next: the pack.

### W4 · Works on bad networks (audit block B)

"Réessayer" reloads after a failed file load; the landing loads no vault code; a returning user goes straight to unlock.

### W5 · A clear first session (audit block C)

Starting balance for the default account; no help tips during setup; F CFA guessed from the time zone even on fr-FR phones.

### W6 · Fewer, plainer words (audit block D)

Activity opens on the list (export moves to Settings); backup before wipe; goals get "Ajouter de l'argent" from an account; budgets and planned expenses list expense categories only; jargon and English leaks fixed; AI keys under "Avancé".

## 5. Small debt, folded into the nearest workstream

- `docs/SRS.md` FR-DE-01 event list is missing the newer event types (W6).
- `CLAUDE.md` project state predates WiseLearn history, voice and categories (each ship).
- Reader: English "Awa paid me (back) 12 500" reads as an expense; should be income (W1 follow-up).
- Lexicon: spot-check the non-Burkina entries; Burkina has few income terms (W2).
- `.claude/worktrees/` should be git-ignored (next commit).
- Error refusals are matched on message constants (`REFUSAL`), not codes: keep unless a screen needs codes.
- Tracked follow-ups in `CLAUDE.md` (edge hosting, Node 20 end of life, post-deploy probes) stay separate from this roadmap.
