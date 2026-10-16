// Voice lab (ADR-0014 follow-up, approved 2026-10-16): measures whisper-tiny running on the phone
// before any "offline voice pack" is offered. Nothing here touches the vault; audio stays in memory.
import { env, pipeline, type AutomaticSpeechRecognitionPipeline, type ProgressInfo } from "@huggingface/transformers";
import { runtimeVariant } from "./runtimeVariant.ts";

export const LAB_MODEL_ID = "onnx-community/whisper-tiny";
const MODEL_CACHE = "transformers-cache";
const SAMPLE_RATE = 16_000;
// A spoken movement is a few words; the cap also stops Whisper's repetition loop on noise.
const MAX_NEW_TOKENS = 48;

function configureRuntime(): void {
  const suffix = runtimeVariant(navigator.userAgent, "gpu" in navigator) === "asyncify" ? ".asyncify" : "";
  const wasm = env.backends.onnx.wasm;
  if (wasm == null) throw new Error("The ONNX WebAssembly backend is unavailable.");
  // Our own origin (vite.config.ts copies them to /ort/), never the library's default CDN.
  wasm.wasmPaths = { mjs: `/ort/ort-wasm-simd-threaded${suffix}.mjs`, wasm: `/ort/ort-wasm-simd-threaded${suffix}.wasm` };
  env.allowLocalModels = false;
}

export type LoadProgress = { loaded: number; total: number };

export async function loadRecognizer(onProgress: (progress: LoadProgress) => void): Promise<AutomaticSpeechRecognitionPipeline> {
  configureRuntime();
  return pipeline("automatic-speech-recognition", LAB_MODEL_ID, {
    dtype: "q8",
    device: "wasm",
    progress_callback: (info: ProgressInfo) => {
      if (info.status === "progress_total") onProgress({ loaded: info.loaded, total: info.total });
    },
  });
}

export async function transcribe(recognizer: AutomaticSpeechRecognitionPipeline, audio: Float32Array): Promise<string> {
  const result = await recognizer(audio, { language: "french", task: "transcribe", max_new_tokens: MAX_NEW_TOKENS, no_repeat_ngram_size: 3 });
  return result.text.trim();
}

/** Decodes a recording (webm/opus on Android, mp4/aac on iPhone) to 16 kHz mono, as Whisper expects. */
export async function decodeTo16k(recording: Blob): Promise<Float32Array> {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await recording.arrayBuffer());
    const frames = Math.max(1, Math.ceil(decoded.duration * SAMPLE_RATE));
    const offline = new OfflineAudioContext(1, frames, SAMPLE_RATE);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    return (await offline.startRendering()).getChannelData(0);
  } finally {
    void context.close();
  }
}

export async function cachedModelBytes(): Promise<number> {
  if (!("caches" in globalThis) || !(await caches.has(MODEL_CACHE))) return 0;
  const cache = await caches.open(MODEL_CACHE);
  let bytes = 0;
  for (const request of await cache.keys()) {
    const response = await cache.match(request);
    if (response != null) bytes += (await response.clone().arrayBuffer()).byteLength;
  }
  return bytes;
}

export async function clearModel(): Promise<void> {
  if ("caches" in globalThis) await caches.delete(MODEL_CACHE);
}

export { SAMPLE_RATE };
