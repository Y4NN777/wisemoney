import { describe, expect, it } from "vitest";
import {
  convertMoney,
  currencyFractionDigits,
  currencyInputStep,
  formatMoney,
  parseMajorUnits,
} from "./money.ts";

describe("currency minor units", () => {
  it("uses ISO fraction digits", () => {
    expect(currencyFractionDigits("XOF")).toBe(0);
    expect(currencyFractionDigits("JPY")).toBe(0);
    expect(currencyFractionDigits("USD")).toBe(2);
    expect(currencyFractionDigits("KWD")).toBe(3);
  });

  it("parses and formats without assuming cents", () => {
    expect(parseMajorUnits("1500", "XOF")).toBe(1500);
    expect(parseMajorUnits("1.234", "KWD")).toBe(1234);
    expect(parseMajorUnits("1.23", "XOF")).toBeNull();
    expect(currencyInputStep("XOF")).toBe("1");
    expect(formatMoney({ minorUnits: 1500, currency: "XOF" }, "fr-FR")).toContain("1\u202f500");
  });
});

describe("convertMoney", () => {
  it("converts across currencies with different minor-unit scales", () => {
    expect(convertMoney({ minorUnits: 100, currency: "USD" }, "XOF", "600"))
      .toEqual({ minorUnits: 600, currency: "XOF" });
    expect(convertMoney({ minorUnits: 600, currency: "XOF" }, "USD", "600", true))
      .toEqual({ minorUnits: 100, currency: "USD" });
  });

  it("applies exact half-even rounding", () => {
    expect(convertMoney({ minorUnits: 1, currency: "XOF" }, "XOF", "1")).toEqual({ minorUnits: 1, currency: "XOF" });
    expect(convertMoney({ minorUnits: 1, currency: "USD" }, "XOF", "2.5"))
      .toEqual({ minorUnits: 0, currency: "XOF" });
    expect(convertMoney({ minorUnits: 3, currency: "USD" }, "XOF", "50"))
      .toEqual({ minorUnits: 2, currency: "XOF" });
  });

  it("rejects exponent notation and unsafe results", () => {
    expect(() => convertMoney({ minorUnits: 100, currency: "USD" }, "EUR", "1e2"))
      .toThrow("invalid rate string");
    expect(() => convertMoney({ minorUnits: Number.MAX_SAFE_INTEGER, currency: "USD" }, "KWD", "999999999"))
      .toThrow("overflow");
  });
});
