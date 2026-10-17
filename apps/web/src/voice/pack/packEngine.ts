// The voice pack's recogniser (ADR-0014 amendment 2026-10-17). Loaded only once the pack is on the
// phone: it reads every file from the pack store and never fetches. Audio stays in memory.
import {
  AutoModelForSpeechSeq2Seq, AutoProcessor, AutoTokenizer, AutomaticSpeechRecognitionPipeline, env,
} from "@huggingface/transformers";
import { PACK_CACHE, PACK_MODEL_ID, PACK_MODEL_REVISION, pinnedUrl, runtimePaths } from "./packFiles.ts";

const SAMPLE_RATE = 16_000;
// A spoken movement is a few words; the cap also stops Whisper's repetition loop on noise.
const MAX_NEW_TOKENS = 48;

async function packOnlyFetch(input: string | URL): Promise<Response> {
  const url = pinnedUrl(new URL(String(input), location.href).href);
  const stored = await (await caches.open(PACK_CACHE)).match(url);
  return stored ?? new Response(null, { status: 404, statusText: "Not in the voice pack" });
}

let recognizer: Promise<AutomaticSpeechRecognitionPipeline> | null = null;

export function loadPackRecognizer(): Promise<AutomaticSpeechRecognitionPipeline> {
  recognizer ??= (async () => {
    const wasm = env.backends.onnx.wasm;
    if (wasm == null) throw new Error("The ONNX WebAssembly backend is unavailable.");
    // Our own origin, versioned (vite.config.ts), never the library's default CDN.
    wasm.wasmPaths = runtimePaths(navigator.userAgent, "gpu" in navigator);
    env.allowLocalModels = false;
    // Every request the library makes is answered from the pack store or refused: it never reaches the
    // network, and a file missing from the pack fails instead of being fetched.
    env.fetch = packOnlyFetch;
    // The parts are loaded one by one, not through pipeline(): pipeline() first lists the model's files
    // on the Hub at "main", ignoring the pinned revision (transformers.js 4.3.0, src/pipelines.js).
    const options = { revision: PACK_MODEL_REVISION } as const;
    const [tokenizer, processor, model] = await Promise.all([
      AutoTokenizer.from_pretrained(PACK_MODEL_ID, options),
      AutoProcessor.from_pretrained(PACK_MODEL_ID, options),
      AutoModelForSpeechSeq2Seq.from_pretrained(PACK_MODEL_ID, { ...options, dtype: "q8", device: "wasm" }),
    ]);
    return new AutomaticSpeechRecognitionPipeline({ task: "automatic-speech-recognition", model, tokenizer, processor });
  })();
  recognizer.catch(() => { recognizer = null; });
  return recognizer;
}

export async function transcribe(audio: Float32Array, language: "fr" | "en"): Promise<string> {
  const recognize = await loadPackRecognizer();
  const result: { text: string } | Array<{ text: string }> = await recognize(audio, {
    language: language === "fr" ? "french" : "english",
    task: "transcribe",
    max_new_tokens: MAX_NEW_TOKENS,
    no_repeat_ngram_size: 3,
  });
  const outputs: Array<{ text: string }> = Array.isArray(result) ? result : [result];
  return (outputs[0]?.text ?? "").trim();
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

/** Recording to text; the time is from the end of recording to the text, as the set-up test measures. */
export async function transcribeRecording(recording: Blob, language: "fr" | "en", now: () => number = () => performance.now()): Promise<{ text: string; ms: number }> {
  const started = now();
  const text = await transcribe(await decodeTo16k(recording), language);
  return { text, ms: Math.round(now() - started) };
}
