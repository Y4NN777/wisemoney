# Onboarding rethink — guided first session

Status: APPROVED with amendments · 2026-09-25 (Y4NN: option "slides back, but softer" as the base) · Follows `ux-simplification.md` decision 6 (one-step onboarding), which Y4NN found confusing on first use ("moi déjà j'étais confus").

## Diagnosis

- The primary persona (PRD §Personas, Overwhelmed Tracker) "values being *told what to do*, not just shown numbers". Between *Start* and *Record first transaction* the app currently tells them nothing: what they are creating, why a passphrase and no login, what to do first, what the three tabs are.
- The four slides removed in Phase 2 were the wrong answer (abstract screens before any value) — but removing them left **zero orientation**. The coach only speaks 20 s into a session, once.
- Wording adds doubt: the empty Home says "Votre compte est prêt" although no account exists yet and the thing created is a *space*; "Transaction" as a tab name means nothing to this persona.

## Decisions

0. **A three-screen intro comes back, softened** (Y4NN, 2026-09-25): between *Start* and the passphrase, three quiet screens — one icon, one title, one sentence each — *Your money on this device* · *One passphrase, your only key* · *Start with one movement*; a *Skip* on every screen; the last button is the setup button. Decision 1's extra lines on the setup screen are therefore not added (the intro says it; no repetition).

1. **The setup screen is the pitch and the commitment, on one screen.** Above the fields, three lines with icons: *Vos finances restent sur cet appareil* · *La phrase privée est votre seule clé — pas d'e-mail, pas de compte* · *Perdue = données perdues ; l'export sert de sauvegarde*. Title "Votre espace WiseMoney"; button "Créer mon espace". Nothing else is added; no slide is restored.
2. **First-run Home is a checklist, not an empty dashboard.** "Premiers pas" replaces the current empty state until done: ① *Enregistrer un premier mouvement* (opens the sheet; Espèces is created silently) ② *Donner un nom à votre compte, ou en ajouter un* (Settings › Comptes) ③ *Poser un budget ou un objectif* (Plan). Each row is one tap, ticks when the underlying milestone exists (coach already tracks `hasTransaction`, `accountCount`, `planningUsed`), the card disappears when all three are done or is dismissed. One line under it names the tabs: *Accueil = où vous en êtes · Activité = ce qui s'est passé · Plan = ce qui vient*.
3. **The first save explains itself.** After the very first recorded movement, the confirmation reads "Enregistré dans Espèces — retrouvez-le dans Activité" instead of the generic toast. Once.
4. **Vocabulary.** "Votre compte est prêt" → "Votre espace est prêt". Capture tab "Transaction" → "Dépense / Revenu" (EN "Expense / Income"); "Transfert" and "Objectif" stay.

Non-goals: no account, e-mail or tour; no change to the landing; passphrase mechanics untouched. Cold path to the first expense stays at 4 interactions.

Verify: fresh vault at 375 px in French — a new user can say what they created, why there is no login, and what to do first without opening Help; checklist ticks follow real state; smokes keep "Start"/"Commencer" and the `Your account is ready` heading is replaced everywhere they assert it.
