import { describe, expect, it } from "vitest";
import type { ObservabilitySet } from "dexie";
import { containsFinancialMutation } from "./useFinancialState.ts";

describe("cross-tab financial invalidation", () => {
  it.each(["financialEvents", "fxRates", "appSettings"])(
    "recognizes %s mutations",
    (store) => {
      const parts = { [`idb://WiseMoney/${store}/`]: {} } as unknown as ObservabilitySet;
      expect(containsFinancialMutation(parts)).toBe(true);
    },
  );

  it("ignores unrelated encrypted stores", () => {
    const parts = { "idb://WiseMoney/byoProviderKeys/": {} } as unknown as ObservabilitySet;
    expect(containsFinancialMutation(parts)).toBe(false);
  });
});
