import { useCallback, useEffect, useRef, useState } from "react";
import { SILENT_START_TIMEOUT_MS, canRunLocally, failureFor, finalTranscript, findRecognition, isIosHomeScreenApp, speechLang, type DictationFailure, type RecognitionLike } from "./dictation.ts";

export type Dictation = {
  supported: boolean;
  listening: boolean;
  /** False when the browser's speech service, not the device, hears the audio. */
  onDevice: boolean;
  start: () => void;
  stop: () => void;
};

export function useDictation({ locale, onText, onFailure }: { locale: string; onText: (text: string) => void; onFailure: (failure: DictationFailure) => void }): Dictation {
  const iosHomeScreen = isIosHomeScreenApp({
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
    standalone: (navigator as Navigator & { standalone?: boolean }).standalone,
    displayStandalone: typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches,
  });
  const ctor = iosHomeScreen ? null : findRecognition();
  const lang = speechLang(locale);
  const [listening, setListening] = useState(false);
  const [onDevice, setOnDevice] = useState(false);
  const recognition = useRef<RecognitionLike | null>(null);
  const callbacks = useRef({ onText, onFailure });
  callbacks.current = { onText, onFailure };

  useEffect(() => {
    if (ctor == null) return;
    let live = true;
    void canRunLocally(ctor, lang).then((local) => { if (live) setOnDevice(local); });
    return () => { live = false; };
  }, [ctor, lang]);

  useEffect(() => () => recognition.current?.abort(), []);

  const start = useCallback(() => {
    if (ctor == null || recognition.current != null) return;
    const session = new ctor();
    session.lang = lang;
    session.interimResults = false;
    session.continuous = false;
    if (onDevice) session.processLocally = true;
    session.onresult = (event) => {
      const text = finalTranscript(event);
      if (text.length > 0) callbacks.current.onText(text);
    };
    session.onerror = (event) => {
      const failure = failureFor(event.error);
      if (failure != null) callbacks.current.onFailure(failure);
    };
    // A browser can accept start() and never capture audio; stop and say so instead of waiting.
    const silent = window.setTimeout(() => {
      if (recognition.current !== session) return;
      session.abort();
      callbacks.current.onFailure("silent");
    }, SILENT_START_TIMEOUT_MS);
    session.onaudiostart = () => window.clearTimeout(silent);
    session.onend = () => {
      window.clearTimeout(silent);
      recognition.current = null;
      setListening(false);
    };
    recognition.current = session;
    setListening(true);
    try {
      session.start();
    } catch {
      recognition.current = null;
      setListening(false);
      callbacks.current.onFailure("failed");
    }
  }, [ctor, lang, onDevice]);

  const stop = useCallback(() => recognition.current?.stop(), []);

  return { supported: ctor != null, listening, onDevice, start, stop };
}
