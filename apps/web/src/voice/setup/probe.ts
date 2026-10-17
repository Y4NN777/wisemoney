import { canRunLocally, findRecognition, isIosHomeScreenApp, type RecognitionCtor } from "../dictation.ts";
import type { VoiceProbe } from "./voiceSetup.ts";

export type DeviceProbe = VoiceProbe & { ctor: RecognitionCtor | null };

/**
 * What this phone offers before any test: on-device recognition for the language (never the
 * browser's cloud, ADR-0014), and whether the voice pack can be offered. The pack engine lands in
 * W3 step 4 (docs/plans/2026-10-w3-voice.md); until then it is reported as not available here.
 */
export async function probeVoice(lang: string): Promise<DeviceProbe> {
  const iosHomeScreen = isIosHomeScreenApp({
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
    standalone: (navigator as Navigator & { standalone?: boolean }).standalone,
    displayStandalone: typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches,
  });
  const ctor = iosHomeScreen ? null : findRecognition();
  const device = ctor != null && await canRunLocally(ctor, lang);
  return { device, pack: "unsupported", ctor: device ? ctor : null };
}

/** Which keyboard help to show: Apple's dictation switch, Gboard's voice typing, or neither. */
export function phonePlatform(userAgent: string, maxTouchPoints: number): "ios" | "android" | "other" {
  if (/iP(hone|ad|od)/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)) return "ios";
  return /Android/.test(userAgent) ? "android" : "other";
}
