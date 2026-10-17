import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Check, Keyboard, Mic, RotateCcw, Square, X } from "lucide-react";
import { Button } from "../../components/ui/button.tsx";
import { Input } from "../../components/ui/input.tsx";
import { Progress } from "../../components/ui/progress.tsx";
import { useOpenCaptureSheet } from "../../components/CaptureSheet/index.tsx";
import { PRODUCT_VERSION } from "../../releases/releaseNotes.ts";
import { speechLang } from "../dictation.ts";
import { ListenFailure, listenOnce } from "./listenOnce.ts";
import { phonePlatform, probeVoice, type DeviceProbe } from "./probe.ts";
import { browserSignature, readVoiceProfile, writeVoiceProfile, type VoiceProfile } from "./voiceProfile.ts";
import {
  QUALIFYING_PASSES, TEST_PHRASES, chooseVoiceEngine, phrasePassed, scoreEngine, setupLanguage,
  type PhraseResult, type VoiceEngineId, type VoiceScores, type VoiceStep,
} from "./voiceSetup.ts";

type Run = { engine: Exclude<VoiceEngineId, "pack">; results: PhraseResult[]; last: { heard: string; passed: boolean } | null };
type Stage = { kind: "loading" } | { kind: "intro" } | { kind: "run"; run: Run } | { kind: "done"; profile: VoiceProfile };

const PHRASE_COUNT = TEST_PHRASES.length;

/** What the profile says to the user: which engine, and whether it is fully or only partly good. */
function outcomeKey(profile: VoiceProfile): "device" | "keyboard" | "keyboardPartly" | "typing" {
  if (profile.engine == null) return "typing";
  if (profile.engine === "device") return "device";
  const passed = (profile.results.keyboard ?? []).filter((result) => result.passed).length;
  return passed >= QUALIFYING_PASSES ? "keyboard" : "keyboardPartly";
}

/**
 * The voice set-up (W3, ADR-0014 amendment 2026-10-17): five phrases said through what the phone
 * already has, on-device recognition first, then the keyboard's microphone. The decision is
 * `chooseVoiceEngine`; this screen only runs the tests it asks for and saves the outcome.
 */
export default function VoiceSetup() {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const language = setupLanguage(locale);
  const openCapture = useOpenCaptureSheet();
  const [probe, setProbe] = useState<DeviceProbe | null>(null);
  const [stage, setStage] = useState<Stage>(() => {
    const saved = readVoiceProfile();
    return saved == null ? { kind: "loading" } : { kind: "done", profile: saved };
  });
  const scores = useRef<VoiceScores>({});
  const allResults = useRef<VoiceProfile["results"]>({});

  useEffect(() => {
    let live = true;
    void probeVoice(speechLang(locale)).then((found) => {
      if (!live) return;
      setProbe(found);
      setStage((current) => (current.kind === "loading" ? { kind: "intro" } : current));
    });
    return () => { live = false; };
  }, [locale]);

  const advance = (step: VoiceStep) => {
    if (step.kind === "test" && step.engine !== "pack") {
      setStage({ kind: "run", run: { engine: step.engine, results: [], last: null } });
      return;
    }
    const engine = step.kind === "use" ? step.engine : null;
    const profile: VoiceProfile = {
      engine,
      results: allResults.current,
      testedAt: new Date().toISOString(),
      appVersion: PRODUCT_VERSION,
      browser: browserSignature(navigator.userAgent),
      modelRevision: null,
    };
    writeVoiceProfile(profile);
    setStage({ kind: "done", profile });
  };

  const start = () => {
    if (probe == null) return;
    scores.current = {};
    allResults.current = {};
    advance(chooseVoiceEngine(probe, {}));
  };

  const finishEngine = (engine: Run["engine"], results: PhraseResult[] | "skipped") => {
    if (probe == null) return;
    if (results === "skipped") scores.current = { ...scores.current, [engine]: "skipped" };
    else {
      allResults.current = { ...allResults.current, [engine]: results };
      scores.current = { ...scores.current, [engine]: scoreEngine(results) };
    }
    advance(chooseVoiceEngine(probe, scores.current));
  };

  if (stage.kind === "loading") {
    return <p className="text-sm text-muted-foreground" aria-live="polite">{t("voiceSetup.checking")}</p>;
  }

  if (stage.kind === "intro") {
    return (
      <div className="space-y-4">
        <p className="text-sm">{t("voiceSetup.intro")}</p>
        <ul className="space-y-1 text-sm text-muted-foreground">
          <li>{t("voiceSetup.introNoDownload")}</li>
          <li>{t("voiceSetup.introPrivate")}</li>
        </ul>
        <Button type="button" className="w-full gap-2 sm:w-auto" onClick={start}>
          <Mic className="h-4 w-4" />
          {t("voiceSetup.start")}
        </Button>
      </div>
    );
  }

  if (stage.kind === "done") {
    const outcome = outcomeKey(stage.profile);
    const engineResults = stage.profile.engine === "device" ? stage.profile.results.device : stage.profile.results.keyboard;
    const passed = engineResults?.filter((result) => result.passed).length ?? null;
    return (
      <div className="space-y-4" role="status">
        <p className="text-base font-semibold">{t(`voiceSetup.outcome.${outcome}.title`)}</p>
        <p className="text-sm text-muted-foreground">{t(`voiceSetup.outcome.${outcome}.body`)}</p>
        {passed != null && <p className="text-sm">{t("voiceSetup.understood", { passed, total: PHRASE_COUNT })}</p>}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" className="gap-2" onClick={() => openCapture("transaction", "expense")}>
            {t("voiceSetup.addMovement")}
          </Button>
          <Button type="button" variant="outline" className="gap-2" disabled={probe == null} onClick={start}>
            <RotateCcw className="h-4 w-4" />
            {t("voiceSetup.retest")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <PhraseTest
      key={stage.run.engine}
      run={stage.run}
      language={language}
      probe={probe}
      lang={speechLang(locale)}
      onRun={(run) => setStage({ kind: "run", run })}
      onFinish={(results) => finishEngine(stage.run.engine, results)}
    />
  );
}

function PhraseTest({ run, language, probe, lang, onRun, onFinish }: {
  run: Run;
  language: ReturnType<typeof setupLanguage>;
  probe: DeviceProbe | null;
  lang: string;
  onRun: (run: Run) => void;
  onFinish: (results: PhraseResult[] | "skipped") => void;
}) {
  const { t } = useTranslation();
  const index = run.results.length - (run.last == null ? 0 : 1);
  const phrase = TEST_PHRASES[Math.min(index, PHRASE_COUNT - 1)]!;
  const [typed, setTyped] = useState("");
  const [listening, setListening] = useState<(() => void) | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const platform = phonePlatform(navigator.userAgent, navigator.maxTouchPoints);
  const record = (heard: string, ms: number | null) => {
    const passed = phrasePassed(phrase, language, heard);
    onRun({ ...run, results: [...run.results, { id: phrase.id, passed, ms }], last: { heard, passed } });
  };

  const next = () => {
    setTyped("");
    setNotice(null);
    if (run.results.length >= PHRASE_COUNT) onFinish(run.results);
    else onRun({ ...run, last: null });
  };

  const listen = () => {
    if (probe?.ctor == null) return;
    setNotice(null);
    const session = listenOnce(probe.ctor, lang);
    setListening(() => session.stop);
    session.heard.then(
      ({ text, ms }) => {
        setListening(null);
        if (text.length === 0) setNotice(t("voiceSetup.nothingHeard"));
        else record(text, ms);
      },
      (error: unknown) => {
        setListening(null);
        const failure = error instanceof ListenFailure ? error.failure : "failed";
        if (failure === "denied") setDenied(true);
        else setNotice(t(failure === "silent" ? "voice.silent" : "voice.failed"));
      },
    );
  };

  const submitTyped = (event: FormEvent) => {
    event.preventDefault();
    if (typed.trim().length > 0) record(typed.trim(), null);
  };

  const skipPhrase = () => record("", null);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">
          {t(run.engine === "device" ? "voiceSetup.engine.device" : "voiceSetup.engine.keyboard")}
          {" · "}
          {t("voiceSetup.progress", { current: index + 1, total: PHRASE_COUNT })}
        </p>
        <Progress value={(run.results.length / PHRASE_COUNT) * 100} aria-label={t("voiceSetup.progress", { current: index + 1, total: PHRASE_COUNT })} />
      </div>

      <div>
        <p className="text-xs text-muted-foreground">{t("voiceSetup.say")}</p>
        <p className="mt-1 text-xl font-semibold leading-snug">« {phrase.said[language]} »</p>
      </div>

      {run.last != null ? (
        <div className="space-y-3">
          <p className={`flex items-start gap-2 rounded-md px-3 py-2 text-sm ${run.last.passed ? "bg-positive-wash text-positive" : "bg-negative-wash text-negative"}`} role="status">
            {run.last.passed ? <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <X className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
            <span>
              {run.last.heard.length === 0 ? t("voiceSetup.skipped") : t(run.last.passed ? "voiceSetup.passed" : "voiceSetup.missed", { heard: run.last.heard })}
            </span>
          </p>
          <Button type="button" className="w-full sm:w-auto" onClick={next}>
            {run.results.length >= PHRASE_COUNT ? t("voiceSetup.seeResult") : t("voiceSetup.next")}
          </Button>
        </div>
      ) : run.engine === "device" && denied ? (
        <div className="space-y-3" role="alert">
          <p className="text-sm font-medium text-negative">{t("voice.denied")}</p>
          <p className="text-sm text-muted-foreground">{t("voiceSetup.permission.deniedChrome")}</p>
          <p className="text-xs text-muted-foreground">{t("voiceSetup.permission.deniedSystem")}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => { setDenied(false); listen(); }}>{t("voiceSetup.permission.retry")}</Button>
            <Button type="button" className="gap-2" onClick={() => onFinish(run.results)}>
              <Keyboard className="h-4 w-4" aria-hidden="true" />
              {t("voiceSetup.permission.useKeyboard")}
            </Button>
          </div>
        </div>
      ) : run.engine === "device" ? (
        <div className="flex flex-col items-center gap-3">
          {run.results.length === 0 && listening == null && <p className="text-center text-xs text-muted-foreground">{t("voiceSetup.permission.ask")}</p>}
          {listening != null ? (
            <Button type="button" size="icon" className="h-16 w-16 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={listening} aria-label={t("voice.stop")}>
              <Square className="h-6 w-6 fill-current" />
            </Button>
          ) : (
            <Button type="button" size="icon" className="h-16 w-16 rounded-full" onClick={listen} aria-label={t("voiceSetup.speak")}>
              <Mic className="h-7 w-7" />
            </Button>
          )}
          <p className="text-sm text-muted-foreground" aria-live="polite">{listening != null ? t("voice.listening") : t("voiceSetup.speak")}</p>
        </div>
      ) : (
        <form className="space-y-3" onSubmit={submitTyped}>
          <p className="flex items-center gap-1.5 rounded-md bg-information-wash px-2 py-1.5 text-xs font-medium text-information">
            <Mic className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {t("voiceSetup.keyboardHint")}
          </p>
          {run.results.length === 0 && platform !== "other" && (
            <p className="text-xs text-muted-foreground">{t(`voiceSetup.permission.keyboard.${platform}`)}</p>
          )}
          <Input
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            aria-label={t("voiceSetup.heardLabel")}
            autoComplete="off"
            autoFocus
            enterKeyHint="done"
            className="h-12"
          />
          <Button type="submit" className="w-full sm:w-auto" disabled={typed.trim().length === 0}>
            {t("voiceSetup.check")}
          </Button>
        </form>
      )}

      {notice != null && <p className="text-sm text-negative" role="alert">{notice}</p>}

      {run.last == null && (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <Button type="button" variant="link" className="h-11 px-0 text-muted-foreground" onClick={skipPhrase}>
            {t("voiceSetup.skipPhrase")}
          </Button>
          {run.engine === "keyboard" && run.results.length === 0 && (
            <Button type="button" variant="link" className="h-11 gap-1.5 px-0 text-muted-foreground" onClick={() => onFinish("skipped")}>
              <Keyboard className="h-4 w-4" aria-hidden="true" />
              {t("voiceSetup.noKeyboardMic")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
