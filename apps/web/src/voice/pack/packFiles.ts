import { runtimeVariant } from "./runtimeVariant.ts";

/**
 * The WiseMoney voice pack (ADR-0014 amendment 2026-10-17): Whisper tiny, multilingual, q8, pinned to
 * one commit of the Hugging Face repository so every phone runs the same files, plus the ONNX runtime
 * from our own origin. Sizes and SHA-256 from the Hub API for that commit (checked 2026-10-17).
 */
export const PACK_MODEL_ID = "onnx-community/whisper-tiny";
export const PACK_MODEL_REVISION = "ff4177021cc41f7db950912b73ea4fdf7d01d8e7";
/** transformers.js keeps models and the runtime in this Cache API store, keyed by URL. */
export const PACK_CACHE = "transformers-cache";

/**
 * Whether the set-up offers the pack. Off until a test with real voices reaches the qualifying score:
 * on five clear synthetic French recordings (2026-10-17) whisper-tiny passed 1 of 5 and whisper-base
 * 1 of 5, against 4 needed (Y4NN chose to keep it off, option A). The pack code stays tested.
 */
export const PACK_OFFERED = false;

export type PackFile = { url: string; bytes: number; sha256: string | null };

const MODEL_FILES: ReadonlyArray<{ path: string; bytes: number; sha256: string | null }> = [
  { path: "config.json", bytes: 2_243, sha256: null },
  { path: "generation_config.json", bytes: 3_772, sha256: null },
  { path: "preprocessor_config.json", bytes: 339, sha256: null },
  { path: "tokenizer_config.json", bytes: 282_683, sha256: null },
  { path: "tokenizer.json", bytes: 2_480_466, sha256: null },
  { path: "onnx/encoder_model_quantized.onnx", bytes: 10_124_990, sha256: "2af4a414ca47aa30f61246017e5fe82b0a8d229281d1255ba666a2a7f6b84d19" },
  { path: "onnx/decoder_model_merged_quantized.onnx", bytes: 30_719_241, sha256: "25e807a962b6349356d0ea5d0dfe530b7e5bf0e2a484aeca0359d03143faddd3" },
];

/** The URL transformers.js builds for a model file, which is also its cache key. */
export function modelFileUrl(path: string): string {
  return `https://huggingface.co/${PACK_MODEL_ID}/resolve/${PACK_MODEL_REVISION}/${path}`;
}

/**
 * transformers.js 4.3.0 checks that the tokenizer and processor files exist at "main", not at the
 * requested revision (src/utils/model_registry/get_tokenizer_files.js, get_processor_files.js), while
 * it loads them at the revision. The pack answers those checks with its pinned files.
 */
export function pinnedUrl(url: string): string {
  const main = `https://huggingface.co/${PACK_MODEL_ID}/resolve/main/`;
  return url.startsWith(main) ? modelFileUrl(url.slice(main.length)) : url;
}

export type RuntimeFiles = { mjs: string; wasm: string };

/** Runtime file paths on our origin for this browser (Safari before 26 needs the plain build). */
export function runtimePaths(userAgent: string, hasWebGpu: boolean): RuntimeFiles {
  const suffix = runtimeVariant(userAgent, hasWebGpu) === "asyncify" ? ".asyncify" : "";
  return {
    mjs: `/ort/${__ORT_VERSION__}/ort-wasm-simd-threaded${suffix}.mjs`,
    wasm: `/ort/${__ORT_VERSION__}/ort-wasm-simd-threaded${suffix}.wasm`,
  };
}

/** Every file of the pack for this browser, model first, in download order. */
export function packFiles(origin: string, runtime: RuntimeFiles): PackFile[] {
  const sizeOf = (path: string) => __ORT_SIZES__[path.slice(path.lastIndexOf("/") + 1)] ?? 0;
  return [
    ...MODEL_FILES.map((file) => ({ url: modelFileUrl(file.path), bytes: file.bytes, sha256: file.sha256 })),
    { url: `${origin}${runtime.mjs}`, bytes: sizeOf(runtime.mjs), sha256: null },
    { url: `${origin}${runtime.wasm}`, bytes: sizeOf(runtime.wasm), sha256: null },
  ];
}

export function packBytes(files: readonly PackFile[]): number {
  return files.reduce((total, file) => total + file.bytes, 0);
}

/** What a profile records: the model commit and the runtime version, which change together with the files. */
export const PACK_REVISION = `${PACK_MODEL_REVISION.slice(0, 12)}+ort${__ORT_VERSION__}`;
