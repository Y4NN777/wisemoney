import { describe, expect, it } from "vitest";
import { phonePlatform } from "./probe.ts";

describe("phonePlatform", () => {
  it("tells iPhone and iPad, Android and the rest apart", () => {
    expect(phonePlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)", 5)).toBe("ios");
    expect(phonePlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5)).toBe("ios");
    expect(phonePlatform("Mozilla/5.0 (Linux; Android 14; TECNO KI5q)", 5)).toBe("android");
    expect(phonePlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0)).toBe("other");
  });
});
