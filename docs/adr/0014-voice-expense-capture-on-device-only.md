# ADR-0014: Say or type a movement in one line, understood on the device

| Field    | Value |
| -------- | ----- |
| Status   | Accepted (2026-10-16, Y4NN); amended 2026-10-17 (hybrid voice set-up, optional voice pack) |
| Date     | 2026-10-16 |
| Diátaxis | Explanation |
| Source   | Y4NN 2026-10-16 ("mettre voice capture pour éviter d'écrire à chaque fois"; "search to design better this feature"); research below; CONTRACT INV-EGR-01/02; ADR-0003 |
| Binds    | `apps/web/src/components/CaptureSheet`; `apps/web/src/voice/` (set-up in `voice/setup/`, pack in `voice/pack/`); `apps/web/src/sw.ts`; `apps/web/vite.config.ts`; help topic for capture |

## Context

Typing an amount and a note for every expense is the main effort in WiseMoney.
Y4NN asked to say it instead ("taxi, deux mille francs"). A spoken expense is a
raw transaction (amount, merchant, note): sending it to a speech service is
egress of vault data (INV-EGR-01/02).

Research, 2026-10-16:

- **iPhone.** Home-screen apps expose `webkitSpeechRecognition` but never
  transcribe, with no error (WebKit bug 225298, open; reported again in October
  2026). Since iOS 26 every site added to the Home Screen opens this way. The
  in-app microphone cannot work there (dictation button hidden since 0bef721).
- **Android Chrome.** Recognition goes to Google unless `processLocally` is set
  and `SpeechRecognition.available()` answers `"available"`; `install()` can
  fetch a language pack (MDN: experimental). One May 2026 report found
  `"unavailable"` on Android: on-device models not shipped there yet. Single
  source; to confirm on Y4NN's phone.
- **What voice-first budget apps do** (vendor claims, unverified): a short
  phrase becomes amount and label ("coffee 25k", VoiceExpense; TrackR);
  several expenses in one sentence (Budget AI); review before saving with a
  suggested category (TrackDad).
- **Voice form practice** (secondary sources): read back the amount before
  committing a payment-like action; ask again only for what is missing.

So an in-app microphone with on-device recognition would reach almost no phone
today, while every phone keyboard already has its own dictation microphone.

## Decision

1. **A quick line at the top of the capture sheet:** "Ex. : taxi 2000". What is
   typed or dictated there is parsed on the device: an amount (digits, "2 000",
   "2k", "2,5k", French and English number words such as "deux mille cinq
   cents"), an expense or income word ("reçu", "salaire" → income), and the rest
   as the note. It fills the sheet's fields; nothing is saved until Add.
2. **Voice through the keyboard.** On every phone the keyboard's microphone
   (iOS dictation, Gboard voice typing) fills that line. WiseMoney sends
   nothing; the keyboard is the user's own choice, outside the app.
3. **In-app microphone only on the device.** Shown on the line only when
   `available()` answers `"available"` with `processLocally: true`; never a
   server for this feature. Today that is probably no phone; it lights up when
   browsers ship the models.
4. **Confirm what was understood.** The amount appears large in the sheet; a
   phrase with no amount says so on the line and fills nothing. No audio or
   transcript is kept.
5. **Later, separately:** several expenses in one line; a category suggested on
   the device from the note (never chosen without the user).

## Consequences

- Positive: one line instead of three fields on every phone now, by voice or
  typing; no new data leaves the app; no consent screen.
- Negative: the voice part depends on the keyboard; a user who never taps the
  keyboard microphone will not know it exists (the line's hint and the help
  topic must say so).
- Risk: misheard numbers ("deux cents" / "deux sans"); the parser is tested on
  spoken forms and the amount is shown large before Add.

## Alternatives considered

- **In-app microphone through the browser's service, with consent.** Works on
  Android today, not on iPhone home-screen apps; puts raw expenses under a
  speech vendor's terms. Rejected (same reasoning as ADR-0013).
- **A speech model shipped in the app (WASM).** Works offline everywhere, but
  tens of megabytes on slow, costly data for a low-end Android audience.
  Rejected for now.
- **In-app on-device microphone only** (this ADR's first draft). Reaches almost
  no phone today. Kept only as point 3.

## Amendment 2026-10-17: a voice set-up that tests what the phone already does

Y4NN 2026-10-17: the voice capture "lacks determinism"; the set-up "should be hybrid: if the phone's
dictation works well during the test, tell the user there is no need for the pack; otherwise help them
set it up". The measurement page `/lab/voice` (2026-10-16) showed Whisper tiny q8 running in the browser
from our origin, about 70 MB downloaded once (desktop measurement).

Decision, replacing the "Rejected for now" of the shipped speech model:

1. **Three engines, in this order:** A, the browser's on-device recognition (point 3 above, unchanged);
   B, the keyboard's dictation (point 2, unchanged); C, an optional **WiseMoney voice pack** (Whisper
   tiny, multilingual, q8, through transformers.js and the ONNX runtime served by our origin), which
   transcribes on the phone. The browser's cloud recognition stays excluded.
2. **A set-up test decides, per phone.** The user says five fixed phrases
   (`apps/web/src/voice/setup/voiceSetup.ts`, `TEST_PHRASES`), each read by the quick-line reader. A
   phrase passes on the exact amount, the expected direction and one note word. An engine qualifies
   with 4 of 5, and, for A and C, a median of at most 3 s from end of speech to text. The next step is
   a pure function, `chooseVoiceEngine`.
3. **The pack is offered only when A and B do not qualify**, and only when the phone can hold and run
   it (200 MB free, WebAssembly, a microphone); on mobile data or data saver the download asks first;
   under 2 GB of memory it warns. If the pack does no better, the app says so and offers to delete it.
4. **The pack is pinned** to one model revision; files are fetched one by one so an interrupted
   download resumes. It lives in the Cache API and can be deleted from Settings.
5. **Stored on the phone only:** the engine, each phrase's pass and time, the date, app version,
   browser and model revision (`localStorage`, `wisemoney.voice.profile.v1`). No audio, no transcript,
   no amount. The test is offered again when the browser or the pinned revision changes.

Status of point 3, 2026-10-17: built and tested, **not offered yet**. On five clear synthetic French
recordings whisper-tiny and whisper-base each passed 1 of 5 (4 needed); the pack is switched on only
when a test with real voices qualifies (`PACK_OFFERED`, `apps/web/src/voice/pack/packFiles.ts`).

Consequences: voice works on more phones without sending speech anywhere; a phone that already
dictates well downloads nothing. The pack costs about 70 MB once, which the user chooses knowingly.
Thresholds are initial values, to be calibrated on the first real phones. The phrases are read
correctly by the reader when written correctly (checked 2026-10-17); the English refund phrase is
"Refund from Awa …" because the reader reads "Awa paid me back …" as an expense (a reader gap, tracked
separately).

## Sources

- WebKit bug 225298: https://bugs.webkit.org/show_bug.cgi?id=225298
- iOS home-screen report, October 2026: https://github.com/JacquesBLR/polyglotte/issues/65
- MDN `available()` / `install()` / `processLocally`:
  https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition
- Android on-device report, May 2026: https://bagrounds.org/ai-blog/2026-05-11-1-word-meter-android-rca
- VoiceExpense: https://play.google.com/store/apps/details?id=com.dreamtech.expense_management
- TrackDad: https://trackdad.app/ · Budget AI: https://apps.apple.com/us/app/expense-tracker-budget-ai/id6756522502
- VUI guide (read-back of amounts): https://typenorm.com/articles/voice-user-interface-design
