# ADR-0018: Learn the user's way of saying things from their own corrections, on the device

| Field    | Value |
| -------- | ----- |
| Status   | Proposed (2026-11-01, Y4NN asked for it; builds on ADR-0017, so it comes after) |
| Date     | 2026-11-01 |
| Diátaxis | Explanation |
| Source   | Y4NN 2026-11-01 ("an adapter in the app for the user to allow the app to learn from his voice patterns, for 5 to 7 days, following and correcting… all the data stays on the device"); ADR-0014, ADR-0015, ADR-0017; CONTRACT INV-EGR-01/02, INV-KEY-03 |
| Binds    | `apps/web/src/capture/`, a new `apps/web/src/learning/` module, `apps/web/src/db/schema.ts`, Settings › Voice, encrypted export |
| Depends on | ADR-0017 (the kind chooser and the understood line produce the correction signal) |

## Context

People do not say things the way a lexicon expects. One person says "OM" for Orange Money, another
"momo"; the keyboard hears "orangé"; "envoi Awa" always means a gift for one user and a repayment for
another; "retrait" is always from the same bank. Today the reader and the category suggestion
(from history) cover part of this. Nothing remembers how *this* person speaks or what they corrected.

The user asked for a bounded period, 5 to 7 days, in which the app follows the user's entries and
corrections, then keeps what it learned, with everything on the device.

An honest limit first: **WiseMoney cannot retrain a speech model on a phone.** Fine-tuning Whisper or
the browser's or keyboard's recogniser is out of reach on the device and impossible for engines A and
B. What can be learned is the layer *after* the transcript: how the heard text maps to what the user
meant. That is the part that makes a user feel the app "gets" them.

### Decision drivers

1. Nothing leaves the device and no audio is ever stored (INV-EGR-01/02, ADR-0014).
2. The user consents, sees what was learned, and can forget it.
3. Deterministic and explainable: each rule can be shown in one sentence and tested.
4. Cannot make the app worse: a learned rule never defeats a safety rule of ADR-0017.
5. Small and cheap on a low-end phone.
6. Works for engines A, B and C alike, since it acts on text.

## Decision

1. **An opt-in learning window.** Settings › Voice offers "Learn how I say things" for **7 days**
   (the user may choose 5). A short banner on the capture sheet says it is on and how many days are
   left. Off by default; stopping early is one tap.
2. **What is observed, per entry saved from the quick line** (typed or dictated):
   `{ at, engine, heard, proposed, saved }` where `heard` is the normalised text (at most 200
   characters), `proposed` is what the reader filled (amount, kind, accounts, note, category) and
   `saved` is what the user finally saved. **No audio, no voice features, no biometrics.**
3. **Where it is kept:** an encrypted store on the device, sealed with the master key like the other
   app settings (`db.appSettings` pattern), not a new network service. The observations are capped
   (500) and deleted when the review is accepted or after 30 days.
4. **What is learned** (rule types, all deterministic):
   | Rule | Example | Effect |
   |------|---------|--------|
   | Heard substitution | "orangé" means "orange" | applied to cue words and own-account names |
   | Account alias | "OM" is the Orange Money account | resolves the account in ADR-0017 |
   | Default counterpart | "retrait" comes from Ecobank | fills the source of a withdrawal |
   | Default kind for a name or word | "envoi Awa" is a gift expense | pre-selects the kind inside the `check` zone |
   | Preferred category for a note word | complements the existing history suggestion | pre-selects, never forces |
5. **Promotion.** An observation becomes a rule when the same correction occurs **at least twice** and
   is not contradicted later; its evidence count and last-seen date are kept. A rule unused for 90 days
   fades out.
6. **Application limits.** Learned rules work inside the `check` zone and for alias resolution. They
   never override a `sure` generic cue and never remove the chooser that ADR-0017 requires.
7. **Review at the end.** When the window closes the app shows "I learned N things", each as a
   sentence with Keep or Forget, plus the honest numbers measured on the device: "Corrections needed:
   X% in the first days, Y% in the last". Nothing is kept without that review; "Forget everything" is
   always available in Settings › Voice.
8. **After the window** the learned rules stay active and update only from explicit corrections the
   user makes; the user can run a new window at any time.
9. **Backup.** The rules are user data: they are included in the **encrypted** export and excluded from
   the plaintext exports (CSV, XLSX), which would expose names.
10. **Optional, to be evaluated rather than assumed:** biasing engine C with the user's own vocabulary
    (account names, frequent merchants) through Whisper's prompt, and engine A with the browser's
    phrase hints where it exists. Both go through the test loop in
    `docs/plans/2026-11-voice-test-automation.md` and ship only if they measurably help.

## Edge cases

| # | Case | Policy |
|---|------|--------|
| L01 | The user's correction was a mistake | a rule needs two matching corrections; the review shows each rule; Forget is one tap |
| L02 | Two rules disagree | the most recent with the higher evidence wins; if tied, neither applies and the line is `check` |
| L03 | The phone is shared | rules belong to the vault, so they follow the passphrase, not the person; the review says so |
| L04 | Restore on another phone | encrypted backup carries the rules; speech engines differ, so rules are re-validated by use (evidence reset to 1) |
| L05 | An account is renamed or archived | aliases follow the account id, not its name; an archived account's aliases are dropped |
| L06 | A learned alias collides with a new account | the collision is shown at review and the line is `check` |
| L07 | Language switch or code-switching | rules are language-neutral strings; both lexicons stay active |
| L08 | Very few entries in the window | the review says "not enough yet" and offers to extend by 7 days; no rule is created from one entry |
| L09 | Storage full or blocked | learning stops with a notice; the app works as before |
| L10 | The user turns the window off midway | observations kept for review are deleted unless the user chooses to review them |
| L11 | A learned rule would defeat an ADR-0017 safety rule | the safety rule wins; the rule is marked "not applied" in the review |
| L12 | Names of other people | stored encrypted, shown only in the review and rule list, never in logs or error text |
| L13 | The user never opens the review | the window ends; rules stay inactive until reviewed, and a reminder appears once on Home |

## Consequences

- Positive: the app adapts to how the person speaks without any new data leaving the phone; every
  adaptation is visible and reversible; the measured drop in corrections is honest evidence rather
  than a claim.
- Negative: a new encrypted store, a review screen, a banner and a rules list; more states to test.
- Risk: **it learns text habits, not voices**, so it will not rescue a recogniser that hears badly;
  that is the job of the engine choice and of the real-phone and automated tests. Users may expect
  more than is possible; the wording must say "how you say things", not "your voice".
  Rules from mistakes are mitigated by the two-correction promotion and the review. Names are personal
  data, so the store is encrypted and excluded from plaintext exports.

## Alternatives considered

- **Fine-tune a speech model on the device.** Not feasible on target phones, and impossible for the
  keyboard and the browser engines. Rejected.
- **Learn continuously and silently.** Easier and more "magic", but invisible adaptation breaks trust
  and cannot be reviewed. Rejected in favour of a bounded, consented window.
- **Send corrections to a server to train a shared model.** Rejected by INV-EGR-01/02 and ADR-0015
  ("no user data ever trains a shared model").
- **A per-user machine-learning classifier now.** The category model of ADR-0015 may add a per-user
  head later; deterministic rules come first because they are explainable and cheap.
