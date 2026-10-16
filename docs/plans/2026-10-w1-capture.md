# W1 · Fast, reliable capture

2026-10-16 · Diátaxis: Explanation · Part of `2026-10-roadmap.md` · Status: plan, awaiting Y4NN's decisions D1–D4.

## Why

Measured on 2026-10-16 with `parseQuickEntry` on 20 realistic phrases:

| Phrase | Today | Should be |
|---|---|---|
| "Taxi deux mille." | 2 F | 2 000 F (dictation adds the period) |
| "j'ai paye le taxi 2000" | Revenu | Dépense ("paye" is in both word lists) |
| "2 pains à 250" | 2 F | 500 F, shown as 2 × 250 |
| "j'ai vendu 3 sacs à 12000" | 3 F | 36 000 F, Revenu |
| "taxi 500 et pain 250" | 500 F, "pain 250" left in the note | two purchases |
| "remboursement de Awa 3000" | no direction | Revenu |

Two causes: the speech-to-text step belongs to the keyboard (punctuation, number formats, spelling vary),
and the reader takes the first match with no grammar, no confidence and no feedback, so a misread is
silent. The audit of the same day adds: the success toast covers the + button for about 4 s after each
save, "Ajouter" sits under the keyboard, the account is chosen silently, Revenu lists Salaire 9th, and an
edit cannot change the account or the date.

## Steps (one commit each, gate and smoke every time)

### 1. Reader v2 and its test bank (logic only, no screen change)

- `src/capture/quickEntry.ts` rewritten as a pipeline: normalise (punctuation, apostrophes, accents for
  matching only, spaces inside numbers, "F"/"FCFA"/"francs") → tokens → number grammar (digits with
  space, dot or comma grouping; k / mille / million; every French number word including soixante-dix,
  quatre-vingt(s), quatre-vingt-dix, "et un"; English) → items split on "et", "puis", ",", "+" when
  each part has its own amount → quantity × unit price ("2 pains à 250", "3 sacs à 12 000") →
  direction from separate, non-overlapping word sets with conjugated and unaccented forms → note.
- Output per item: amount, how it was read (digits, words, quantity × price), direction and why
  (which word), note, and a confidence: `sure`, `check` (e.g. a lone small number, two readings
  possible) or `none`.
- Test bank `src/capture/quickEntry.bank.json`: 300+ phrases with the expected result, built from the
  sourced lexicon terms, the dictation forms above, typed forms (typos, SMS spelling), and the 20 probe
  phrases; Y4NN reviews a sample. A test prints accuracy per field and fails under the floor
  (amount ≥ 98%, direction ≥ 95% on phrases that state it; floor set from the first measurement).

### 2. "Understood" line and questions instead of guesses

- Under the quick line: "**2 000 F** · Dépense · « taxi »", updated as the user types or dictates.
- Confidence `check`: one short question with the two readings as buttons ("2 pains à 250 : 500 F
  ou 250 F ?"). Confidence `none`: "Aucun montant trouvé : ajoutez un nombre." (exists today).
- Several purchases (D2): "2 achats : taxi 500 F, pain 250 F". After "Ajouter", the sheet stays open
  with the next purchase already filled; the toast says "1 sur 2 enregistré".

### 3. Category from the user's own history

- The category the user chose most often for the same normalised note (or its first word, "taxi
  moto" → "taxi") is pre-selected and marked "Suggéré"; ties go to the most recent. Computed on the
  phone from movements already decrypted for the session; nothing stored. Changing it is just picking
  another category. The category model (W2) slots in under this later.

### 4. Sheet fixes from the audit

- Toast placement (D1) so the bottom bar and the + button stay free.
- "Ajouter" stays visible above the keyboard (the sheet follows `visualViewport`).
- The account in use is shown as a chip at the top of the form ("Compte : Orange Money ▾") instead of
  being chosen silently; tapping it changes it.
- Revenu lists income categories first; Dépense lists expense categories first (today both lists mix).
- The tab name (D3).

### 5. Edit can change the account and the date

- `transaction_updated` already carries `accountId`; the edit form gains the account. The date needs an
  optional `occurredAt` in the same event (older events replay unchanged; export/import validation
  updated); the projection moves the movement to its new month. Unit tests for the projection,
  validation and import.

## Decisions for Y4NN

- **D1 Toast placement:** (a, recommended) just above the bottom bar, so it is read where the thumb
  is and never covers the +; (b) at the top of the screen.
- **D2 Several purchases in one sentence:** (a, recommended) recorded one after another, the next one
  prefilled; (b) all at once with one category each (more taps on one screen, more to get wrong).
- **D3 Tab name "Dépense / Revenu"** repeats the two buttons below it: (a, recommended) keep the
  buttons and rename the tab to a single word, to be chosen from research on the words used by
  West African money apps (not invented); (b) leave it.
- **D4 "2 pains à 250":** (a, recommended) total 500 F shown as "2 × 250", note "2 pains";
  (b) ask every time.

## Done when

The bank passes its floor in CI; the six measured misreads above read correctly; the audit's capture
findings (toast over +, Ajouter under the keyboard, silent account, Revenu order, edit account/date)
are closed and covered by the smoke; help topics `transactions` (fr, en) follow.
