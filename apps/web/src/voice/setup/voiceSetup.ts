import { readQuickEntry } from "../../capture/quickEntry.ts";

/**
 * The voice set-up test (docs/plans/2026-10-w3-voice.md, ADR-0014 amendment 2026-10-17): five
 * phrases said aloud, read by the same reader as the quick line, and a pure decision that picks
 * the phone's own recognition, the keyboard's dictation or the WiseMoney voice pack.
 */
export type VoiceEngineId = "device" | "keyboard" | "pack";

export type TestPhrase = {
  id: string;
  said: { fr: string; en: string };
  amount: number;
  direction: "income" | null;
  /** A word the note must contain, accents and case ignored. */
  keyword: { fr: string; en: string };
};

/** Each one is read correctly by the reader when written correctly, so a miss is the engine's. */
export const TEST_PHRASES: readonly TestPhrase[] = [
  { id: "fuel", said: { fr: "Essence moto deux mille cinq cents", en: "Fuel for the moto two thousand five hundred" }, amount: 2500, direction: null, keyword: { fr: "essence", en: "fuel" } },
  { id: "airtime", said: { fr: "Crédit Orange mille francs", en: "Orange airtime one thousand francs" }, amount: 1000, direction: null, keyword: { fr: "orange", en: "orange" } },
  { id: "rent", said: { fr: "Loyer quatre-vingt-dix mille", en: "Rent ninety thousand" }, amount: 90000, direction: null, keyword: { fr: "loyer", en: "rent" } },
  { id: "salary", said: { fr: "Salaire cent soixante-quinze mille", en: "Salary one hundred seventy-five thousand" }, amount: 175000, direction: "income", keyword: { fr: "salaire", en: "salary" } },
  { id: "refund", said: { fr: "Awa m'a remboursé douze mille cinq cents", en: "Refund from Awa twelve thousand five hundred" }, amount: 12500, direction: "income", keyword: { fr: "awa", en: "awa" } },
];

export type SetupLanguage = keyof TestPhrase["said"];

export function setupLanguage(locale: string): SetupLanguage {
  return locale.toLowerCase().startsWith("fr") ? "fr" : "en";
}

const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** A phrase passes when the amount is exact, the direction matches and the note holds the word. */
export function phrasePassed(phrase: TestPhrase, language: SetupLanguage, heard: string): boolean {
  const [item] = readQuickEntry(heard);
  if (item == null || item.amount == null) return false;
  const direction = item.direction === "income" ? "income" : null;
  return Number(item.amount) === phrase.amount
    && direction === phrase.direction
    && fold(item.note).includes(fold(phrase.keyword[language]));
}

export type PhraseResult = { id: string; passed: boolean; ms: number | null };

export type EngineScore = { passed: number; total: number; medianMs: number | null };

export function scoreEngine(results: readonly PhraseResult[]): EngineScore {
  const times = results.map((result) => result.ms).filter((ms): ms is number => ms != null).sort((a, b) => a - b);
  const middle = Math.floor(times.length / 2);
  const medianMs = times.length === 0 ? null : times.length % 2 === 1 ? times[middle]! : (times[middle - 1]! + times[middle]!) / 2;
  return { passed: results.filter((result) => result.passed).length, total: results.length, medianMs };
}

/** Initial thresholds, to calibrate on the first real phones (plan section 3). */
export const QUALIFYING_PASSES = 4;
export const PARTIAL_KEYBOARD_PASSES = 3;
export const MAX_MEDIAN_MS = 3_000;

/** The keyboard is not timed: the app cannot see when the user starts speaking. */
export function qualifies(engine: VoiceEngineId, score: EngineScore): boolean {
  if (score.passed < QUALIFYING_PASSES) return false;
  if (engine === "keyboard") return true;
  return score.medianMs != null && score.medianMs <= MAX_MEDIAN_MS;
}

export const PACK_BYTES_NEEDED = 200 * 1024 * 1024;
const LOW_MEMORY_GB = 2;

export type PackPreflight = {
  /** Why the pack cannot be offered at all, if it cannot. */
  blocked: "unsupported" | "storage" | null;
  askWifi: boolean;
  slowWarning: boolean;
};

export function packPreflight(env: {
  wasm: boolean;
  microphone: boolean;
  freeBytes: number | null;
  saveData: boolean;
  cellular: boolean;
  deviceMemoryGb: number | null;
}): PackPreflight {
  const blocked = !env.wasm || !env.microphone ? "unsupported" : env.freeBytes != null && env.freeBytes < PACK_BYTES_NEEDED ? "storage" : null;
  return {
    blocked,
    askWifi: env.saveData || env.cellular,
    slowWarning: env.deviceMemoryGb != null && env.deviceMemoryGb < LOW_MEMORY_GB,
  };
}

export type VoiceProbe = {
  /** The browser confirmed on-device recognition for the user's language. */
  device: boolean;
  /** Why the pack is not offered here, if it is not: the phone cannot hold or run it, or it is not ready. */
  pack: PackPreflight["blocked"] | "notReady";
};

/** "skipped": the user said their keyboard has no microphone, or declined the pack. */
export type VoiceScores = Partial<Record<VoiceEngineId, EngineScore | "skipped">>;

export type VoiceStep =
  | { kind: "test"; engine: VoiceEngineId }
  | { kind: "use"; engine: VoiceEngineId; reason: "qualified" | "packNoBetter" | "packUnavailable" | "packDeclined" }
  | { kind: "offerPack" }
  | { kind: "typing"; reason: "packNoBetter" | "packUnavailable" | "packDeclined" };

/** The next step of the set-up, from what is known so far; same inputs, same answer. */
export function chooseVoiceEngine(probe: VoiceProbe, scores: VoiceScores): VoiceStep {
  const passedWith = (engine: VoiceEngineId) => {
    const score = scores[engine];
    return score != null && score !== "skipped" && qualifies(engine, score);
  };
  const keyboardPartly = () => {
    const score = scores.keyboard;
    return score != null && score !== "skipped" && score.passed >= PARTIAL_KEYBOARD_PASSES;
  };

  if (probe.device) {
    if (scores.device == null) return { kind: "test", engine: "device" };
    if (passedWith("device")) return { kind: "use", engine: "device", reason: "qualified" };
  }
  if (scores.keyboard == null) return { kind: "test", engine: "keyboard" };
  if (passedWith("keyboard")) return { kind: "use", engine: "keyboard", reason: "qualified" };

  if (probe.pack != null) {
    return keyboardPartly() ? { kind: "use", engine: "keyboard", reason: "packUnavailable" } : { kind: "typing", reason: "packUnavailable" };
  }
  if (scores.pack == null) return { kind: "offerPack" };
  if (scores.pack === "skipped") {
    return keyboardPartly() ? { kind: "use", engine: "keyboard", reason: "packDeclined" } : { kind: "typing", reason: "packDeclined" };
  }
  if (passedWith("pack")) return { kind: "use", engine: "pack", reason: "qualified" };
  return keyboardPartly() ? { kind: "use", engine: "keyboard", reason: "packNoBetter" } : { kind: "typing", reason: "packNoBetter" };
}
