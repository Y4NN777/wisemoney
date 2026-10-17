import { describe, expect, it } from "vitest";
import { runtimeVariant } from "./runtimeVariant.ts";

const SAFARI_18 = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1";
const SAFARI_26 = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";
const ANDROID_CHROME = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36";

describe("runtimeVariant", () => {
  it("uses the plain build only on Safari before 26 without WebGPU", () => {
    expect(runtimeVariant(SAFARI_18, false)).toBe("plain");
    expect(runtimeVariant(SAFARI_18, true)).toBe("asyncify");
    expect(runtimeVariant(SAFARI_26, false)).toBe("asyncify");
    expect(runtimeVariant(ANDROID_CHROME, false)).toBe("asyncify");
  });
});
