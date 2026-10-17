import { SILENT_START_TIMEOUT_MS, failureFor, finalTranscript, type DictationFailure, type RecognitionCtor } from "../dictation.ts";

export type Heard = { text: string; ms: number | null };

export class ListenFailure extends Error {
  constructor(readonly failure: DictationFailure) {
    super(failure);
  }
}

/**
 * One utterance through the browser's on-device recognition, for the set-up test. The time is
 * from the end of speech to the final text (null when the browser does not report the end of
 * speech). The recognition is always local: this path exists only where `available()` said so.
 */
export function listenOnce(ctor: RecognitionCtor, lang: string, now: () => number = () => performance.now()): { heard: Promise<Heard>; stop: () => void } {
  const session = new ctor();
  session.lang = lang;
  session.interimResults = false;
  session.continuous = false;
  session.processLocally = true;
  let text = "";
  let speechEnd: number | null = null;
  let ms: number | null = null;
  let failure: DictationFailure | null = null;

  const heard = new Promise<Heard>((resolve, reject) => {
    const silent = setTimeout(() => {
      failure = "silent";
      session.abort();
    }, SILENT_START_TIMEOUT_MS);
    session.onaudiostart = () => clearTimeout(silent);
    session.onspeechend = () => { speechEnd = now(); };
    session.onresult = (event) => {
      const words = finalTranscript(event);
      if (words.length === 0) return;
      text = text.length === 0 ? words : `${text} ${words}`;
      if (speechEnd != null) ms = Math.round(now() - speechEnd);
    };
    session.onerror = (event) => { failure ??= failureFor(event.error); };
    session.onend = () => {
      clearTimeout(silent);
      if (failure != null) reject(new ListenFailure(failure));
      else resolve({ text, ms });
    };
    try {
      session.start();
    } catch {
      clearTimeout(silent);
      reject(new ListenFailure("failed"));
    }
  });
  return { heard, stop: () => session.stop() };
}
