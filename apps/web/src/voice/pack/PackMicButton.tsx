import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LoaderCircle, Mic, Square } from "lucide-react";
import { Button } from "../../components/ui/button.tsx";
import { MicrophoneDenied, startRecording, type Recording } from "./recorder.ts";

/**
 * The quick line's microphone when the set-up chose the voice pack: records, then transcribes on the
 * phone. The recogniser starts loading when the sheet opens so the first phrase is not the slow one.
 */
export default function PackMicButton({ language, onText, onFailure }: {
  language: "fr" | "en";
  onText: (text: string) => void;
  onFailure: (messageKey: string) => void;
}) {
  const { t } = useTranslation();
  const [state, setState] = useState<"idle" | "recording" | "transcribing">("idle");
  const recording = useRef<Recording | null>(null);

  useEffect(() => {
    void import("./packEngine.ts").then((engine) => engine.loadPackRecognizer()).catch(() => undefined);
    return () => recording.current?.stop();
  }, []);

  const start = async () => {
    let session: Recording;
    try {
      session = await startRecording();
    } catch (error) {
      onFailure(error instanceof MicrophoneDenied ? "voice.denied" : "voice.failed");
      return;
    }
    recording.current = session;
    setState("recording");
    try {
      const blob = await session.done;
      setState("transcribing");
      const engine = await import("./packEngine.ts");
      try {
        await engine.loadPackRecognizer();
      } catch {
        onFailure("voice.packMissing");
        return;
      }
      const { text } = await engine.transcribeRecording(blob, language);
      if (text.length > 0) onText(text);
      else onFailure("voice.packFailed");
    } catch {
      onFailure("voice.packFailed");
    } finally {
      recording.current = null;
      setState("idle");
    }
  };

  if (state === "recording") {
    return (
      <Button type="button" size="icon" className="h-11 w-11 shrink-0 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => recording.current?.stop()} aria-label={t("voice.stop")}>
        <Square className="h-3.5 w-3.5 fill-current" />
      </Button>
    );
  }
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className="h-11 w-11 shrink-0 rounded-full text-foreground"
      disabled={state === "transcribing"}
      onClick={() => { void start(); }}
      aria-label={state === "transcribing" ? t("voice.transcribing") : t("voice.start")}
      title={t("voice.start")}
    >
      {state === "transcribing" ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Mic className="h-5 w-5" />}
    </Button>
  );
}
