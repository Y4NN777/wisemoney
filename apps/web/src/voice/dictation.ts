/**
 * Dictation through the browser's Web Speech API (Y4NN, 2026-10-16: speak instead of typing in
 * WiseHelp and WiseLearn). Chrome sends audio to Google unless `processLocally` is set and the
 * language pack is there; Safari uses Apple's service and was reported missing in home-screen
 * apps (WebKit bug 225298, 2021). So: on the device when the browser says it can, otherwise the
 * browser's service with a visible note, and no button at all when the API is absent.
 */
export type RecognitionResultEvent = {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
};

export type RecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  processLocally?: boolean;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

export type RecognitionCtor = (new () => RecognitionLike) & {
  available?: (options: { langs: string[]; processLocally: boolean }) => Promise<string>;
};

export function findRecognition(scope: object = globalThis): RecognitionCtor | null {
  const candidate = (scope as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown });
  const ctor = candidate.SpeechRecognition ?? candidate.webkitSpeechRecognition;
  return typeof ctor === "function" ? ctor as RecognitionCtor : null;
}

export function speechLang(locale: string): "fr-FR" | "en-US" {
  return locale.toLowerCase().startsWith("fr") ? "fr-FR" : "en-US";
}

/** True only when the browser confirms on-device recognition for this language is ready. */
export async function canRunLocally(ctor: RecognitionCtor, lang: string): Promise<boolean> {
  if (typeof ctor.available !== "function") return false;
  try {
    return (await ctor.available({ langs: [lang], processLocally: true })) === "available";
  } catch {
    return false;
  }
}

/** The finished words of a result event, joined; interim guesses are left out. */
export function finalTranscript(event: RecognitionResultEvent): string {
  const parts: string[] = [];
  for (let index = event.resultIndex; index < event.results.length; index += 1) {
    const result = event.results[index];
    if (result?.isFinal === true) parts.push(result[0]?.transcript.trim() ?? "");
  }
  return parts.filter((part) => part.length > 0).join(" ");
}

export type DictationFailure = "denied" | "offline" | "failed";

/** Errors worth telling the user about; a pause with no speech or a user stop are not. */
export function failureFor(code: string): DictationFailure | null {
  if (code === "aborted" || code === "no-speech") return null;
  if (code === "not-allowed" || code === "service-not-allowed") return "denied";
  if (code === "network") return "offline";
  return "failed";
}

/** Adds dictated words after what is already typed. */
export function appendDictated(current: string, spoken: string): string {
  if (spoken.length === 0) return current;
  return current.trim().length === 0 ? spoken : `${current.replace(/\s+$/, "")} ${spoken}`;
}
