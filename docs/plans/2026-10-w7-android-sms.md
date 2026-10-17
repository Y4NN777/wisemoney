# W7 · Android app that reads mobile-money SMS on the phone

2026-10-17 · Diátaxis: Explanation · Part of `2026-10-roadmap.md` · Status: planned for the week of
2026-10-19 (Y4NN: "that's the next update, for next week").

## Goal

The same WiseMoney, packaged as an Android app, turns Orange Money and Moov Money SMS into movements
without typing. Nothing leaves the phone: no server, no new egress.

## Shape (Y4NN 2026-10-17)

- Package the current web app as an Android app with **Capacitor**: same code, plus native plugins.
- A small native module reads only the operators' SMS and hands the text to our JavaScript inside the
  phone.
- The quick-line reader turns it into a movement in the encrypted vault (review before Add, as today).

## Two consents (Y4NN 2026-10-17: "double auth")

1. **Read and list:** Android's SMS permission, asked by the system. With it, the app lists only the
   *senders* (for example "OrangeMoney", "MOOV MONEY"), never message bodies, and puts the known
   operators first.
2. **Chosen feeds:** the user ticks the senders WiseMoney may read. Only those messages are opened and
   parsed; any other sender's body is never read. The choice is stored on the phone, shown in
   Settings, and can be changed or withdrawn at any time (withdrawing stops reading at once).

Listing senders already touches the inbox, so step 1 reads addresses only; the screen says so in one
line before the system prompt.

## Facts it rests on (research 2026-10-17)

- A web app cannot read SMS in any browser; computing locally does not change that.
- Google Play allows READ_SMS / RECEIVE_SMS outside the default SMS app only by exception, after review.
  Two exceptions fit: "SMS-based money management (apps that track and manage budget)" and "SMS-based
  financial transactions". All exceptions require that no alternative method exists; the Spyware clause
  says budgeting apps may not exfiltrate or share non-financial or personal SMS history.
  https://support.google.com/googleplay/android-developer/answer/10208820
- iPhone: no app can read the SMS inbox (only a filter extension for unknown senders). Out of scope.

## Before any code (to decide or verify)

1. ADR: native shell (Capacitor) and SMS access; THREAT_MODEL entry (new permission, sender filter).
2. Capacitor and the SMS plugin vetted per `.claude/rules/common/dependencies.md` (OSV, maintenance,
   provenance), or a minimal native module of our own.
3. Real Orange Money and Moov Money Burkina SMS from Y4NN, anonymised, as the reader's test bank;
   formats are never guessed.
4. The sender list and the chosen-feeds store (above): which Android query returns senders without
   bodies, and how the choice is enforced in the native module, not only in the UI.
5. Play Console declaration for the exception, and the plain in-app disclosure it needs.

## Open

- Notification access (reading the operator apps' notifications) as a second route: Play policy text
  not found yet; to verify before considering it.
