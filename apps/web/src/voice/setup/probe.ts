import { canRunLocally, findRecognition, isIosHomeScreenApp, type RecognitionCtor } from "../dictation.ts";
import { PACK_OFFERED, packFiles, runtimePaths, type PackFile } from "../pack/packFiles.ts";
import { packStatus, type PackStatus } from "../pack/packStore.ts";
import { packPreflight, type PackPreflight, type VoiceProbe } from "./voiceSetup.ts";

export type DeviceProbe = VoiceProbe & { ctor: RecognitionCtor | null; preflight: PackPreflight; files: PackFile[]; installed: PackStatus | null };

type NetworkInformationLike = { saveData?: boolean; type?: string; effectiveType?: string };

async function freeBytes(): Promise<number | null> {
  try {
    const estimate = await navigator.storage?.estimate?.();
    return estimate?.quota != null && estimate.usage != null ? estimate.quota - estimate.usage : null;
  } catch {
    return null;
  }
}

async function installedPack(files: PackFile[]): Promise<PackStatus | null> {
  try {
    return typeof caches === "undefined" ? null : await packStatus(files);
  } catch {
    return null;
  }
}

/**
 * What this phone offers before any test: on-device recognition for the language (never the
 * browser's cloud, ADR-0014), and whether the voice pack can be offered (room, WebAssembly, a
 * microphone) and how (Wi-Fi question, low-memory warning).
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
  const files = packFiles(location.origin, runtimePaths(navigator.userAgent, "gpu" in navigator));
  const installed = await installedPack(files);
  const connection = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
  const preflight = packPreflight({
    wasm: typeof WebAssembly === "object" && typeof caches !== "undefined",
    microphone: typeof navigator.mediaDevices?.getUserMedia === "function" && typeof MediaRecorder === "function",
    // A pack already on the phone needs no more room.
    freeBytes: installed?.complete === true ? null : await freeBytes(),
    saveData: connection?.saveData === true,
    cellular: connection?.type === "cellular",
    deviceMemoryGb: (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null,
  });
  return { device, pack: PACK_OFFERED ? preflight.blocked : "notReady", ctor: device ? ctor : null, preflight, files, installed };
}

/** Which keyboard help to show: Apple's dictation switch, Gboard's voice typing, or neither. */
export function phonePlatform(userAgent: string, maxTouchPoints: number): "ios" | "android" | "other" {
  if (/iP(hone|ad|od)/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)) return "ios";
  return /Android/.test(userAgent) ? "android" : "other";
}
