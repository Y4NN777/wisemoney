import { describe, expect, it, vi } from "vitest";
vi.mock("../db/schema.ts", () => ({ db: { appSettings: { get: vi.fn(), put: vi.fn() }, fxRates: { toArray: vi.fn() } } }));
import { guessBaseCurrency } from "./currencyStore.ts";

describe("guessBaseCurrency", () => {
  it("maps UEMOA and CEMAC regions to their franc", () => {
    expect(guessBaseCurrency(["fr-BF"])).toBe("XOF");
    expect(guessBaseCurrency(["fr-CI", "fr"])).toBe("XOF");
    expect(guessBaseCurrency(["fr-CM"])).toBe("XAF");
  });

  it("maps common diaspora regions", () => {
    expect(guessBaseCurrency(["fr-FR"])).toBe("EUR");
    expect(guessBaseCurrency(["en-GB"])).toBe("GBP");
    expect(guessBaseCurrency(["en-US", "fr"])).toBe("USD");
    expect(guessBaseCurrency(["en", "en-CA"])).toBe("CAD");
  });

  it("falls back to XOF without a known region", () => {
    expect(guessBaseCurrency(["fr"])).toBe("XOF");
    expect(guessBaseCurrency(["en"])).toBe("XOF");
    expect(guessBaseCurrency(["xx-ZZ"])).toBe("XOF");
    expect(guessBaseCurrency([])).toBe("XOF");
  });
});
