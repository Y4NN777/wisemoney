# ADR-0014: Voice capture of movements, recognised on the device only

| Field    | Value |
| -------- | ----- |
| Status   | Proposed (2026-10-16), awaiting Y4NN |
| Date     | 2026-10-16 |
| Diátaxis | Explanation |
| Source   | Y4NN 2026-10-16 ("mettre voice capture pour éviter d'écrire à chaque fois", then "Both": chat dictation and voice capture); dictation in WiseHelp and WiseLearn shipped the same day (`apps/web/src/voice/`); CONTRACT INV-EGR-01/02; ADR-0003 |
| Binds    | `apps/web/src/components/CaptureSheet`; `apps/web/src/voice/`; help topic for capture |

## Context

Typing an amount and a note for every expense is the main effort in WiseMoney.
Y4NN asked to say it instead ("taxi, deux mille francs").

The browser speech API decides where the audio goes:

- Chrome sends audio to Google's recognition service by default. Since Chrome
  139 (MDN: experimental) `processLocally = true` keeps it on the device, if
  `SpeechRecognition.available({ langs, processLocally: true })` answers
  `"available"`, which needs the language pack on the phone.
- Safari uses Apple's service. It was reported missing in home-screen apps
  (WebKit bug 225298, 2021; reports to 2022). Nothing recent confirms a fix.

A spoken expense is a raw transaction: amount, often a merchant or a
free-text note. Sending it to a speech service is egress of vault data, which
INV-EGR-01 and INV-EGR-02 allow only with per-feature consent under a provider's
terms. The chat dictation does not raise this: a WiseHelp or WiseLearn question
already goes to Google and must carry no vault data (INV-EGR-04).

## Decision (proposed)

1. **On the device or not at all.** The capture microphone appears only when
   `available()` answers `"available"` for the app language with
   `processLocally: true`. No fallback to a server, ever, for this feature.
2. **Speech fills the sheet, the user saves.** The words go through a local
   parser: an amount (digits, or French and English number words such as
   "deux mille cinq cents") and the rest as the note. They pre-fill the existing
   capture sheet; nothing is saved until the user chooses Add. The category is
   not guessed.
3. **No audio or transcript is kept.** Only what the user saves, as an ordinary
   encrypted movement.
4. **Where it is missing, nothing changes.** No button, no message. Typing and
   the keyboard's own dictation stay as they are.

## Consequences

- Positive: a movement in one sentence where the browser supports it; no new
  data leaves the device; no consent screen needed.
- Negative: probably not on iPhone home-screen apps, and not on Chrome before
  139 or without the French pack, so many of today's users will not see it.
- Risk: number words are easy to mishear ("deux cents" / "deux sans"); the sheet
  shows the amount large before Add, and the parser is tested on spoken forms.

## Alternatives considered

- **Server recognition with a per-feature consent.** Would work on most phones,
  but puts raw expenses under a speech vendor's terms. Rejected: same reasoning
  as ADR-0013 against sending vault data to free-tier endpoints.
- **A speech model shipped in the app (WASM).** Works everywhere and offline, but
  tens of megabytes to download on slow, costly data (the audience is low-end
  Android at 360 px). Rejected for now.
- **Only the keyboard's dictation.** Already works in every field, at no cost;
  it is what users without on-device support keep.

## Open questions

- Can the app ask Chrome to fetch the French pack when `available()` answers
  `"downloadable"`, and should it? Not verified.
- First test on Y4NN's Android and iPhone: does `available()` answer at all?
