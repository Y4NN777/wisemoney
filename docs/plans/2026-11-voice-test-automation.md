# Automating the voice tests: what can be automated, what cannot, and the feedback loop

2026-11-01 · Diátaxis: Explanation and plan · Owner: Y4NN · Status: proposed; four short spikes decide the build.
Follows `2026-10-w3-voice-real-phone-test.md` (the human test) and ADR-0017 and ADR-0018.
Y4NN 2026-11-01: "automate mobile testing with Maestro on dev containers for the voice test, get feedback,
upgrade the system with it".

## 1. The honest limit

Voice quality has three links: **audio to text** (the recogniser), **text to entry** (the reader of
ADR-0017) and **the screen** (the sheet, the understood line, the chooser). Automation covers the last
two completely and the first one only for one of our three engines.

| Engine | Can a test machine drive it? |
|--------|------------------------------|
| A. Browser on-device recognition | Only on a real device or a cloud device. Emulator images usually lack on-device speech models, and a cloud fallback is excluded by ADR-0014, so an emulator may report "unavailable" |
| B. Keyboard dictation (Gboard, Apple) | No. It is the phone's keyboard and needs a real person's voice |
| C. Voice pack (Whisper tiny in the browser) | **Yes.** The page reads the microphone through the browser, so a recorded file can stand in for the microphone |

So automation does not replace the phone test. It makes the two outer links safe to change and it
tests engine C against a library of real recordings, run after run.

## 2. Three levels

| Level | What it tests | Where it runs | When |
|-------|---------------|---------------|------|
| **L1 Reader** | text to entry: kinds, edge cases, amounts | Vitest, already in CI (`quickEntry.bank.json`) | every push |
| **L2 Audio to entry for engine C** | a recorded phrase goes through the pack and the reader and must give the expected entry | headless Chromium with a fake microphone fed a WAV file, in a dev container or CI | nightly and on changes to the voice code |
| **L3 Screens on Android** | the capture flows on a real Chrome PWA: type a line, the chooser, the transfer tab, learning banner; optionally a spoken phrase played into the emulator's microphone | Maestro flows on an Android emulator, or a cloud device | on release branches and on demand |

The Playwright smokes that exist stay: they are the fast web check. Maestro adds what they cannot, a
real Android browser and system dialogs such as the microphone permission.

### L2 in detail

- Chromium accepts a fake capture device fed from a file: `--use-fake-device-for-media-stream`,
  `--use-file-for-fake-audio-capture=phrase.wav` (WebRTC testing guidance). The `WAV` should be 16-bit
  PCM; formats and looping behaviour are to be confirmed in spike S1.
- It feeds the app's own recorder (`apps/web/src/voice/pack/recorder.ts`), so the whole pack path is
  exercised. It does not exercise the browser's `SpeechRecognition`, and whether that API reads the fake
  device at all is unconfirmed, which is why engines A and B are left to devices.
- Latency measured here is a desktop figure, not a phone figure. It is used only to catch regressions.

### L3 in detail

- **Maestro** is an open-source framework for UI tests of Android, iOS and web apps, written as YAML
  flows, run from a CLI that needs Java 17 or later, with a Studio and a paid Cloud. Which browser
  engine its web mode uses is not stated in what I could read, so it is treated as unconfirmed.
- **Speaking into an emulator.** Reported practice: the Android emulator takes its microphone from
  audio played on the host, so a test plays a WAV on the runner while the app listens (QA Wolf documents
  this pattern). Real-device clouds such as Sauce Labs offer audio injection for speech recognition
  tests on their real devices. Both are third-party reports, to be proven in spike S2 and S4.
- **Hardware acceleration.** Android emulators need KVM to be usable. Sources disagree about standard
  hosted CI runners, document larger runners with it, and note a device-permission step (`udevadm
  trigger`). For a dev container, `/dev/kvm` must be passed through from a Linux host; this is my
  inference and not documented in the sources. A cloud IDE without KVM can run L1 and L2 but not
  the emulator.

## 3. The dev container

One `.devcontainer/` for everything that does not need a phone:

- Node 22 and pnpm, the repo's pinned versions.
- Chromium and Playwright (already used by the smokes).
- ffmpeg and PulseAudio (a virtual sink so audio can be played without hardware).
- JDK 17, Android command-line tools, an x86_64 emulator image and the Maestro CLI, used only when
  `/dev/kvm` exists; otherwise L3 is skipped and says why.

It is written after spikes S1 and S2 succeed, not before.

## 4. The recordings (the corpus)

- Real voices, with each speaker's agreement. Recorded on the phones in the human test, then reused as
  the L2 library. **Audio files stay out of the repository** (they are personal data): they live in a
  private store, and the repository holds only a manifest (file id, speaker code, condition,
  expected entry) and the results.
- Three speakers, quiet and street noise, the 30 phrases of the voice plan plus the kind phrases of
  ADR-0017 (31 to 40 and more as the bank grows).
- Synthetic speech is allowed only for smoke checks of the plumbing, never for accuracy decisions.

## 5. The feedback loop

```
human test and recordings → corpus
         ↓
L2 run (nightly) → results.json → a short report (pass rate by phrase, speaker, noise, engine)
         ↓
each failure is classed → an action
```

| Failure class | Action |
|---------------|--------|
| The recogniser heard the wrong words | confusion table entry (ADR-0017 E38); if frequent, try a larger model or a vocabulary prompt (ADR-0018 point 10); compare against the thresholds |
| The words were right, the reader erred | add the phrase to `quickEntry.bank.json`, fix the reader (never tune the reader to hide an engine's error) |
| The entry was right, the screen showed it wrong | add an L3 flow |
| Slow | record the figure; engine C only offered when the median is 3 s or less on a phone |

Thresholds live in one file in the repository (`voice-thresholds.json`), with a date and the run that
justified each value. A change to the model, runtime, reader or lexicon must not lower any pass rate
without a written reason.

## 6. Spikes, each one day at most, each with a stop condition

| Spike | Question | Success | If it fails |
|-------|----------|---------|-------------|
| S1 | Does headless Chromium with a fake microphone feed the pack and return text? | a clean recorded phrase gives a transcript through the real recorder | L2 falls back to calling the model directly on the WAV, with less coverage of the recorder |
| S2 | Can an emulator in a dev container with KVM take audio played on the host and let Chrome on it record that audio? | the phrase reaches the page and the pack transcribes it | L3 runs without speech (typed lines only); voice stays a human test |
| S3 | Does Maestro drive the PWA in Android Chrome (permission dialog, sheet, chooser)? | one flow passes, repeatable | keep Playwright for web, use a different Android driver |
| S4 | Does a cloud real-device service inject audio into Chrome's recogniser and does engine A answer? | a result for engine A on a real device | engine A stays a human-only check |

Order: S1, then S2, then S3, with S4 only if budget exists. S1 alone already gives most of the value.

## 7. What is built, in order

1. ADR-0017 reader and bank (L1), with the chooser; it is the change users feel.
2. S1 and L2 for engine C on a first corpus.
3. S2 and S3, then the dev container and L3 flows.
4. ADR-0018 learning window, after the signals from steps 1 to 3 exist.

## Sources

- Maestro: https://github.com/mobile-dev-inc/Maestro
- Audio injection on an emulator (QA Wolf): https://docs.qawolf.com/qawolf/android-audio-injection
- Audio injection on real devices (Sauce Labs): https://docs.saucelabs.com/mobile-apps/features/audio-injection/
- Voice interaction testing guidance (Android Open Source Project): https://source.android.com/docs/automotive/voice/voice_interaction_guide/testing_debugging
- Fake media capture in Chromium for tests (WebRTC): https://webrtc.org/getting-started/testing
- Hardware-accelerated emulators on hosted runners: https://github.com/actions/runner-images/issues/183 and https://github.com/ReactiveCircus/android-emulator-runner
