import type { PhraseResult, VoiceEngineId } from "./voiceSetup.ts";

/**
 * What the voice set-up decided on this phone. Holds no money, no audio and no transcript: the
 * engine, each phrase's pass and time, and what the test ran on, so it is offered again when the
 * browser or the pinned voice model changes. A convenience on this device, not vault data.
 */
const STORAGE_KEY = "wisemoney.voice.profile.v1";

export type VoiceProfile = {
  /** null: typing; the test found no voice engine good enough here. */
  engine: VoiceEngineId | null;
  results: Partial<Record<VoiceEngineId, PhraseResult[]>>;
  testedAt: string;
  appVersion: string;
  /** Browser name and major version, e.g. "Chrome/141". */
  browser: string;
  /** Pinned voice pack revision, when the pack was tested. */
  modelRevision: string | null;
};

const ENGINES: readonly VoiceEngineId[] = ["device", "keyboard", "pack"];

function isPhraseResult(value: unknown): value is PhraseResult {
  if (typeof value !== "object" || value == null) return false;
  const result = value as Record<string, unknown>;
  return typeof result.id === "string" && typeof result.passed === "boolean" && (result.ms === null || typeof result.ms === "number");
}

export function parseVoiceProfile(raw: string | null): VoiceProfile | null {
  if (raw == null) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value == null) return null;
  const profile = value as Record<string, unknown>;
  const engine = profile.engine;
  if (engine !== null && !ENGINES.includes(engine as VoiceEngineId)) return null;
  if (typeof profile.testedAt !== "string" || typeof profile.appVersion !== "string" || typeof profile.browser !== "string") return null;
  if (profile.modelRevision !== null && typeof profile.modelRevision !== "string") return null;
  const results = profile.results;
  if (typeof results !== "object" || results == null) return null;
  for (const [key, list] of Object.entries(results)) {
    if (!ENGINES.includes(key as VoiceEngineId) || !Array.isArray(list) || !list.every(isPhraseResult)) return null;
  }
  return value as VoiceProfile;
}

export function readVoiceProfile(): VoiceProfile | null {
  try {
    return parseVoiceProfile(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

export function writeVoiceProfile(profile: VoiceProfile | null): void {
  try {
    if (profile == null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // Storage unavailable: the set-up is offered again next time.
  }
}

/** "Chrome/141", "Safari/26", "Firefox/144", or "unknown". */
export function browserSignature(userAgent: string): string {
  const named = /(Edg|SamsungBrowser|OPR|Firefox|CriOS|Chrome)\/(\d+)/.exec(userAgent);
  if (named != null) return `${named[1]}/${named[2]}`;
  const safari = /Version\/(\d+)[^ ]* .*Safari\//.exec(userAgent);
  return safari == null ? "unknown" : `Safari/${safari[1]}`;
}

/** The test is offered again when what it measured may have changed. */
export function needsRetest(profile: VoiceProfile | null, now: { browser: string; modelRevision: string }): boolean {
  if (profile == null) return true;
  if (profile.browser !== now.browser) return true;
  return profile.engine === "pack" && profile.modelRevision !== now.modelRevision;
}
