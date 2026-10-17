import { describe, expect, it } from "vitest";
import { PACK_MODEL_REVISION, PACK_REVISION, modelFileUrl, packBytes, packFiles, pinnedUrl, runtimePaths } from "./packFiles.ts";

const android = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36";
const oldSafari = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

describe("voice pack files", () => {
  it("pins the model to one commit, never main", () => {
    expect(PACK_MODEL_REVISION).toMatch(/^[0-9a-f]{40}$/);
    expect(modelFileUrl("config.json")).toBe(`https://huggingface.co/onnx-community/whisper-tiny/resolve/${PACK_MODEL_REVISION}/config.json`);
    expect(PACK_REVISION).toContain(`+ort${__ORT_VERSION__}`);
  });

  it("answers the library's checks at main with the pinned files, and nothing else", () => {
    expect(pinnedUrl("https://huggingface.co/onnx-community/whisper-tiny/resolve/main/tokenizer_config.json")).toBe(modelFileUrl("tokenizer_config.json"));
    expect(pinnedUrl("https://huggingface.co/other/model/resolve/main/config.json")).toBe("https://huggingface.co/other/model/resolve/main/config.json");
    expect(pinnedUrl(modelFileUrl("config.json"))).toBe(modelFileUrl("config.json"));
  });

  it("serves the runtime from our origin, versioned, in the build the browser can run", () => {
    expect(runtimePaths(android, false).wasm).toBe(`/ort/${__ORT_VERSION__}/ort-wasm-simd-threaded.asyncify.wasm`);
    expect(runtimePaths(oldSafari, false).wasm).toBe(`/ort/${__ORT_VERSION__}/ort-wasm-simd-threaded.wasm`);
  });

  it("lists seven model files and the runtime, with their sizes", () => {
    const files = packFiles("https://wisemoney.y7labs.studio", runtimePaths(android, false));
    expect(files).toHaveLength(9);
    expect(files.every((file) => file.bytes > 0)).toBe(true);
    expect(files.at(-1)?.url).toBe(`https://wisemoney.y7labs.studio/ort/${__ORT_VERSION__}/ort-wasm-simd-threaded.asyncify.wasm`);
    expect(files.filter((file) => file.url.endsWith(".onnx")).every((file) => file.sha256?.length === 64)).toBe(true);
    // About 70 MB with the asyncify runtime (43.6 MB of model).
    expect(packBytes(files)).toBeGreaterThan(65_000_000);
    expect(packBytes(files)).toBeLessThan(75_000_000);
  });
});
