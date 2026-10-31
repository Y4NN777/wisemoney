# How intelligence works in WiseMoney

2026-10-31 · Diátaxis: Explanation · Owner: Y4NN · Update this file when any layer below changes.

WiseMoney uses "intelligence" in four places that share almost no code and have different
availability. This page is the map: what each one is, where it runs, what it can see, who can use
it today, and what a user actually perceives. Decisions behind it are in the ADRs named in each
section.

## 1. The four layers at a glance

| Layer | What it does | Where it runs | Sees vault data? | Who has it today |
|-------|--------------|---------------|------------------|------------------|
| **Capture** | Turns one typed or spoken line into amount, direction, note, category | The phone | Yes, locally only | Everyone (typing); voice depends on the phone |
| **Guidance** | Insights, recommendations, forecasts, pattern detection, assistant chat | The phone calls a provider | Redacted aggregates by default; raw only with BYO key and consent | Only people who saved a personal provider key |
| **Learning** | WiseLearn tutor, WiseHelp in-app help | Vercel server functions | **Never** (closed request schema) | Everyone |
| **Reminders** | Local alerts and the Home line | The phone | Yes, locally only | Everyone |

A layer is *perceived* only when the user can see its result. Capture and Learning are perceived
today. Guidance is not, for most people (section 3).

## 2. Capture: one line in, a movement out

```
voice or keyboard → text → quick-line reader → "understood" line → fields → user taps Add
```

### 2.1 Speech to text (ADR-0014, amended 2026-10-17)

Three engines, tried in this order by a five-phrase test in Settings › Voice. The decision is a pure
function, `chooseVoiceEngine` in `apps/web/src/voice/setup/voiceSetup.ts`.

| Engine | How text is obtained | Download | Audio leaves the phone? |
|--------|----------------------|----------|-------------------------|
| A. Browser on-device recognition | `SpeechRecognition` with `processLocally: true`, only if the browser answers `available()` for the user's language | none | no |
| B. Keyboard dictation | The user taps the keyboard's own microphone (Gboard, Apple); text lands in the field | none | the keyboard's own policy, outside the app |
| C. Voice pack | Whisper tiny, 8-bit quantised, run by transformers.js on ONNX WebAssembly served from our origin | about 70 MB, once | no |

The browser's cloud recognition is excluded, because a spoken expense is vault data.

State of C: built, tested and pinned (`apps/web/src/voice/pack/`), but **switched off**
(`PACK_OFFERED = false` in `packFiles.ts`). It scored 1 of 5 phrases against the 4 needed, but on
**synthetic** speech, which is not evidence about real voices. The real-phone test in
`docs/plans/2026-10-w3-voice-real-phone-test.md` decides its fate.

Known limits: iPhone home-screen apps expose the speech API but never transcribe (WebKit bug
225298), so the in-app microphone is hidden there and engine B is the only route. Android Chrome
may answer `available()` with "unavailable" for a language, which sends the user to B.

### 2.2 The quick-line reader (deterministic, no model)

`apps/web/src/capture/quickEntry.ts` reads the text with rules: tokens with positions, digits and
French and English number words ("soixante-dix", "2 mille", "25k"), one item per purchase, quantity
times unit price, direction words with context ("la paye", "m'a remboursé"), a note that keeps the
original spelling, and a confidence (sure, check, none). A bank of 362 phrases runs in CI with
floors. This part is the most dependable piece of the system and it is not machine learning.

### 2.3 Category suggestion

1. **Today:** the category the user already chose for the same note (from history), marked
   "Suggested".
2. **Designed, not built (ADR-0015):** a small on-device classifier distilled from a large model.
   Gemma labels a generated dataset at build time; a Model2Vec student restricted to our vocabulary
   (estimated 2 to 4 MB in int8) runs as a table lookup. It waits on the dataset run and the
   labelling rules in `tools/categorize/labelingGuide.mjs`.

No user data ever trains a shared model.

## 3. Guidance: why it is not perceived

Code: `apps/web/src/ai/orchestration.ts`, `apps/web/src/lib/capabilities.ts`, `apps/web/src/ui/Assistant/`.

Two modes decide availability in `getAICapability()`:

- **BYO key:** the user saves a provider key (Gemini, OpenAI, OpenRouter, DeepSeek). The browser
  calls the provider directly, keys stay encrypted on the device. This is implemented.
- **Managed:** the phone calls the Go edge with a login, the edge routes to a provider and only
  redacted aggregates are sent. **The edge is not deployed** and `VITE_EDGE_BASE_URL` is not set on
  Vercel, so this mode is off for everyone.

If neither applies, `available` is false: the Assistant tab shows a setup notice with disabled
buttons and the Home insight card never appears. The features work; most people never see them.

## 4. Learning: the AI everyone already has

WiseLearn (`/learn`) and WiseHelp (in-app help) call Vercel functions in `apps/web/api/learn` and
`apps/web/api/help`. The server holds the model key (`LITERACY_GEMINI_API_KEY`), answers with Gemma,
retrieves from the 77 lessons by `gemini-embedding-001` vectors (keyword search as fallback) and
cites its source. The request schema is closed: no vault data can be sent (ADR-0013).

## 5. What the user perceives, and what should be

| Layer | Perceived today | Missing |
|-------|-----------------|---------|
| Capture | The "understood" line, the "Suggested" tag | Nothing says it saved effort; voice outcome differs per phone |
| Guidance | Nothing for most users | A first layer that needs no key |
| Learning | The tutor itself | None |
| Reminders | The Home line, the bell | None |

Direction (decided 2026-10-31):

1. Make capture outcomes visible without inventing numbers (a count of entries saved from one line,
   kept on the device).
2. Decide engine C with real recordings, not synthetic ones.
3. Give guidance a first layer that needs no AI: rule-based insights computed on the phone and
   visible to everyone. The AI narrative sits on top for people with a key, later for everyone when
   the edge exists.
4. Build the category model only once the dataset exists.
5. Keep this page true. README and `CLAUDE.md` point here instead of repeating it.

## 6. Where things live

| Concern | Path |
|---------|------|
| Voice engines and set-up | `apps/web/src/voice/` |
| Quick-line reader and its test bank | `apps/web/src/capture/quickEntry.ts`, `quickEntry.bank.json` |
| Category history suggestion | `apps/web/src/capture/`, CaptureSheet |
| Category model tools | `tools/categorize/` |
| AI orchestration (BYO and managed) | `apps/web/src/ai/orchestration.ts` |
| AI availability | `apps/web/src/lib/capabilities.ts` |
| WiseLearn and WiseHelp gateways | `apps/web/api/learn/`, `apps/web/api/help/` |
| Managed edge (not deployed) | `services/edge/` |

Related: ADR-0001, 0002, 0008, 0011, 0013, 0014, 0015; `docs/plans/2026-10-roadmap.md`;
`docs/plans/2026-10-w3-voice.md`.
