import { afterEach, describe, expect, it, vi } from "vitest";
import { currencyDisplay, currencyName } from "./currencyNames.ts";

function stubDisplayNames(answer: (code: string) => string | undefined) {
  vi.stubGlobal("Intl", { ...Intl, DisplayNames: class { of(code: string) { return answer(code); } } });
}

describe("currency names", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("words the CFA francs the same on every phone", () => {
    stubDisplayNames((code) => code);
    expect(currencyDisplay("XOF", "fr-FR")).toBe("XOF - Francs CFA");
    expect(currencyDisplay("XAF", "fr")).toBe("XAF - Francs CFA (CEMAC)");
    expect(currencyDisplay("XOF", "en-US")).toBe("XOF - CFA francs");
  });

  it("treats a name equal to the code as missing and uses the fallback", () => {
    stubDisplayNames((code) => code);
    expect(currencyName("GHS", "en", "Ghanaian Cedi")).toBe("Ghanaian Cedi");
    expect(currencyDisplay("GHS", "en", "Ghanaian Cedi")).toBe("GHS - Ghanaian Cedi");
  });

  it("shows only the code when nothing names it", () => {
    stubDisplayNames(() => undefined);
    expect(currencyDisplay("ZZZ", "fr")).toBe("ZZZ");
  });

  it("capitalises the phone's lowercase French names", () => {
    stubDisplayNames(() => "dollar des États-Unis");
    expect(currencyDisplay("USD", "fr")).toBe("USD - Dollar des États-Unis");
  });
});
