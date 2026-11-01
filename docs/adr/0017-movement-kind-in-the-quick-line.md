# ADR-0017: Read the kind of movement in the quick line, and ask when it is not certain

| Field    | Value |
| -------- | ----- |
| Status   | Proposed (2026-11-01, Y4NN agreed the approach; edge cases below to be confirmed before code) |
| Date     | 2026-11-01 |
| Diátaxis | Explanation |
| Source   | Y4NN 2026-11-01 ("how the system is going to detect whether it's a transfer, an income or an expense"); probe run 2026-11-01 on `apps/web/src/capture/quickEntry.ts`; ADR-0014; CONTRACT INV-EGR-01/02 |
| Binds    | `apps/web/src/capture/quickEntry.ts` and its bank; `apps/web/src/components/CaptureSheet`; `docs/plans/2026-10-w3-voice-real-phone-test.md` |
| Amends   | ADR-0014 (the reader's output and where the quick line sits) |

## Context

The quick line (ADR-0014) fills amount, direction and note. Its direction is "expense", "income" or
nothing, and "nothing" keeps whatever the sheet already had, which is expense. It has no idea that a
movement can be a transfer between the user's own accounts, a payment into a goal, or a debt.

Run on 2026-11-01, with the reader as it ships:

| Said | Read as | Saved as |
|------|---------|----------|
| Transfert Orange Money vers banque 10000 | no direction | **expense** |
| Dépôt banque 20000 | no direction | **expense** |
| Retrait 10000 | no direction | **expense** |
| Cash in Orange 15000 | no direction | **expense** |
| Épargne 5000 | no direction | **expense** (not a goal contribution) |
| Prêt à Issouf 3000 | no direction | **expense** (not a receivable) |

The harm is not cosmetic. A transfer saved as an expense inflates spending, lowers one account and
never credits the other, so every figure on Home is wrong until the user notices. The quick line is
the product's strongest feature and most users will trust it, so it must be wrong rarely and never
silently.

### Decision drivers

1. A wrong silent result costs more than one extra tap. Precision matters more than recall.
2. Mobile money makes transfers between own accounts frequent (cash, Orange Money, Moov, bank).
3. The same word means different things by context ("crédit" is airtime, "remboursement" runs both
   ways, "dépôt" is a transfer or a client's payment).
4. Speech recognition garbles exactly the cue words that matter ("vers" for "vert", "retrait" for
   "retraite").
5. Everything stays on the device and is deterministic and explainable (ADR-0014, INV-EGR-01/02).
6. Testable: every rule needs phrases in the CI bank, with floors.

## Decision

1. **The reader returns a kind, not just a direction.** `kind` is one of `expense`, `income`,
   `transfer`, `goal` (a contribution to a goal), `debt` (a new debt or receivable, or settling one),
   or `null`. For a transfer it also returns `from` and `to` own accounts when it can resolve them.
2. **It reads the user's own context, not only the words.** Its inputs are the active accounts
   (name, type, currency), open debts and receivables (counterparty names), goals, and the user's
   own aliases (ADR-0018). A cue word alone is weak evidence; a cue word plus a matching own account
   is strong.
3. **Every reading carries a confidence:** `sure` (strong cue, nothing in conflict), `check` (weak
   cue, conflict, or something unresolved) or `none`.
4. **The understood line always shows the kind**, for example "Transfert · Orange Money → Banque ·
   10 000 F CFA". On `check` it also shows a one-tap choice (Dépense · Revenu · Transfert, plus
   Objectif or Dette when relevant), with the best guess selected. On `none` nothing changes.
5. **Transfers are never silent unless both accounts are resolved** (a transfer with an unresolved
   side is `check`). A guess is never applied without being visible, and every save keeps Undo.
6. **The quick line moves above the sheet's tabs** and drives them. A transfer reading switches to
   the transfer tab with accounts and amount filled; a goal reading to the goal tab.
7. **Ambiguity must never come out as `sure`.** This is a CI rule: a phrase marked ambiguous in the
   bank fails the build if the reader returns `sure`.

### How the kind is decided (in order)

1. **Is it an entry at all?** Questions, commands and negations are not entries (E30 to E33).
2. **Split into items** as today; each item gets its own kind (E34 to E37).
3. **Gather cues for the item:** kind words, own-account mentions with a role (from, to, at), a
   person's name, a goal's name, debt words, fee words, price patterns.
4. **Resolve:** two distinct own accounts with from and to roles give `transfer`, `sure`. One own
   account plus a counterpart word (dépôt, retrait, cash in, cash out, versement) gives `transfer`,
   `check`, with the counterpart proposed (cash for a deposit, the last used non-cash account for a
   withdrawal). A kind word with no own account is `check`. Conflicting cues are `check`.
5. **Otherwise** the existing direction rules apply, unchanged.

## Edge cases

Policy words: **sure** = applied and shown; **check** = best guess selected, chooser shown;
**split** = several movements from one item; **not an entry** = nothing is filled.

### Transfers between own accounts

| # | Case | Example | Policy |
|---|------|---------|--------|
| E01 | Two own accounts with from and to | "Transfert Orange Money vers banque 10000" | transfer, **sure** |
| E02 | Source and destination words | de, depuis, du, from = source; vers, à, sur, dans, to = destination; order "X → Y" or "X > Y" also | first named is the source when no word says otherwise |
| E03 | Only the destination named | "Vers banque 10000" | transfer, **check**; source = account last used |
| E04 | Kind word, no accounts | "Transfert 10000" | transfer, **check**; both accounts to pick |
| E05 | Deposit into an own account | "Dépôt banque 20000", "Cash in Orange 15000" | transfer, **check**; source = the cash account if there is exactly one |
| E06 | Deposit with no own account named, a third party | "Dépôt client 50000" | income or transfer, **check**, no default |
| E07 | Withdrawal | "Retrait 10000", "Retrait Orange 10000" | transfer to cash, **check**; source = named account or the last used non-cash account |
| E08 | Agent deposit or withdrawal | "Déposé chez l'agent 20000" | transfer cash to mobile money, **check**; a fee line may be offered (E19) |
| E09 | The word alone is not enough | "Reçu virement 5000 de Awa" | **income**: a transfer needs own-account evidence or a counterpart word |
| E10 | Sending to a person | "J'ai envoyé 5000 à Awa", "Envoi Awa 5000", "Send 5000 to Awa" | expense, **check**; if Awa has an open debt, offer to settle it |
| E11 | Slang for sending | "J'ai viré 5000 à Awa" | same as E10 |
| E12 | A name is both an account and a person | an account called "Awa" and a person Awa | **check**, ask which |
| E13 | Aliases and brands | OM, momo, Orange, Moov, MTN MoMo, Wave, Airtel Money, "la banque", "cash", "espèces", "caisse" | built-in synonyms by account type, plus the user's own aliases (ADR-0018) |
| E14 | An alias fits several accounts | "banque" with two banks | **check**, list the candidates |
| E15 | Archived or inactive accounts | | never matched |
| E16 | Same account on both sides | "Orange vers Orange 5000" | not a transfer, **check** |
| E17 | The user has one account only | | transfer impossible; offer to add the second account, otherwise expense or income, **check** |
| E18 | Accounts in different currencies | "10000 XOF vers 15 EUR" | read both amounts; with one amount, use the source currency and ask for a rate if none is stored, **check** |
| E19 | Fee on a transfer | "Transfert 10000 frais 150" | **split**: transfer 10 000 and expense 150 |
| E20 | Fee word means an expense | "Frais de transfert Orange Money 150" | expense only; "frais" is a strong expense cue and "transfert" stays in the note |
| E21 | Received amount differs from sent | "Transfert 10000 reçu 9850" | transfer plus implied fee 150, **check** |
| E22 | Chain of transfers | "Retrait banque puis dépôt Orange 10000" | two transfers when amounts are clear, otherwise **check** |

### Other kinds and direction words

| # | Case | Example | Policy |
|---|------|---------|--------|
| E23 | "Crédit" is airtime | "Crédit Orange mille francs" | expense; "crédit" is never income by itself |
| E24 | Refunds run both ways | "Awa m'a remboursé 12500" income; "J'ai remboursé Issouf 4000" expense; bare "Remboursement 4000" | by subject; bare form is **check** with no default; an open debt or receivable with that name is offered for settling |
| E25 | Lending and borrowing | "Prêt à Issouf 3000" (receivable); "Issouf m'a prêté 3000" or "Emprunt 3000" (debt); bare "Prêt 3000" | debt kind, **sure** when the subject is clear, otherwise **check** |
| E26 | Salary advance | "Avance sur salaire 20000" | **check** between income and debt |
| E27 | Salary versus paying | "La paye 150000", "Salaire" (income); "J'ai payé le loyer" (expense) | existing rules, kept |
| E28 | Tontine and contributions | "J'ai reçu la tontine 100000" income; "Tontine 15000" | bare form expense or goal when a tontine goal exists, **check** |
| E29 | Saving | "Épargne 5000", "Mis de côté 5000" | goal kind: **sure** when a goal is named or only one exists, otherwise **check** with the goals listed; no goal, offer to create one |

### Not entries, or not yet

| # | Case | Example | Policy |
|---|------|---------|--------|
| E30 | Negation or something that did not happen | "Je n'ai pas payé le loyer", "Awa n'a pas remboursé" | **not an entry**; say so |
| E31 | Future or plan | "Je vais payer le loyer 90000", "Loyer vendredi" | offer a planned expense, **check** |
| E32 | Question | "Combien j'ai dépensé en taxi ?" | **not an entry**; offer WiseHelp |
| E33 | Command | "Annule le dernier", "Supprime" | **not an entry** here; never saved as a note with a number |

### Several items and numbers

| # | Case | Example | Policy |
|---|------|---------|--------|
| E34 | Different kinds in one line | "Retrait 10000 taxi 500" | **split**: transfer and expense; the existing rule that shares a direction across items applies only when no item states its own |
| E35 | Each item states its kind | "Reçu 5000 de Awa et payé taxi 500" | each item keeps its own |
| E36 | "à" is a price or a destination | "2 pains à 250" price; "Envoi à Awa" destination | price pattern is tried first |
| E37 | Digits that are not amounts | "Compte 2", "MTN 2 mois", a phone number in "Recharge 07 12 34 56 5000" | phone-like numbers (8 or more digits, or a leading 0 or +) are not amounts |

### Speech and language

| # | Case | Example | Policy |
|---|------|---------|--------|
| E38 | Misheard cue words | vers/vert, virement/vire ment, retrait/retraite, dépôt/dépose, Orange/orangé | a confusion table applied to cue words and to own-account names only |
| E39 | Mixed languages | "Cash out 10000 de Orange" | both French and English lexicons are always active, whatever the interface language |
| E40 | Local brand names | momo, OM, Wave, MoMo | in the synonym table; unknown local words stay in the note |
| E41 | Date words | "Hier", "lundi dernier" | set the date, never the kind; a weekday cannot match a person's or goal's name |

### System

| # | Case | Example | Policy |
|---|------|---------|--------|
| E42 | Undo | any saved kind | every save has Undo; a split is undone as one |
| E43 | Personal rules | ADR-0018 | adjust aliases and defaults inside the `check` zone; never override a `sure` generic cue |
| E44 | Accessibility | the chooser | reachable by keyboard and screen reader; the kind is announced in the understood line |

## Verification

- **Bank.** Extend `quickEntry.bank.json` with at least 250 phrases carrying `context` (accounts,
  debts, goals), expected `kind`, expected accounts and an `ambiguous` flag. Floors in CI: kind
  accuracy 98%, silent transfers 100% precise (never `sure` when wrong), and every `ambiguous`
  phrase returns `check` or `none`, never `sure`.
- **UI.** The browser smoke covers one transfer by quick line (accounts filled, tab switched) and
  one `check` chooser.
- **Voice.** The real-phone plan gains phrases 31 to 40 for kinds, with the test phones set up with
  Espèces, Orange Money and Banque.

## Consequences

- Positive: a transfer is no longer counted as spending; the user always sees the kind; the same
  rules serve typed and spoken lines; ambiguity is handled by asking, not guessing.
- Negative: the reader needs context (accounts, debts, goals), so it is no longer a pure function of
  the text; it grows from one file of rules to rules plus lexicons and a confusion table; the sheet
  gains a chooser and a new place for the quick line.
- Risk: a lexicon that drifts from how people really talk; mitigated by the bank, by the real-phone
  test, and by learning from corrections (ADR-0018). Over-asking would feel slow; the `check` rate on
  the bank is tracked so that clear phrases stay `sure`.

## Alternatives considered

- **Add a "transfer" word list to the existing direction rules.** Cheapest, but a word like
  "transfert" or "dépôt" is not enough without the accounts, so it would silently misfile
  third-party payments. Rejected.
- **Ask a language model.** Better on messy phrases, but it would send the user's note and accounts
  off the device or need a large local model (ADR-0014, INV-EGR-01/02). Kept only as a possible
  future helper for the `check` zone, on the device.
- **Make the user pick the tab first.** What happens today; it is why transfers are said badly.
- **Detect transfers by matching amounts across accounts after the fact.** Detects, but does not
  prevent the wrong entry, and double counting would already have happened.
