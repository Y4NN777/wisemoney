import { describe, expect, it } from "vitest";
import { frequentPurchases, quickLineExample, type FrequentHistoryItem } from "./frequentPurchases.ts";

const spent = (note: string, amount: string, timestamp: number): FrequentHistoryItem => ({ note, amount, direction: "expense", timestamp });
const starters = { morning: "pain 250", midday: "riz gras 750", evening: "essence 1000" };

describe("frequent purchases", () => {
  it("ranks notes by use, groups spellings, keeps the usual amount and the latest spelling", () => {
    const history = [
      spent("taxi", "500", 1), spent("Taxi", "500", 2), spent("taxi", "700", 3),
      spent("riz gras", "750", 4), spent("Riz gras", "750", 5),
      spent("crédit orange", "1000", 6),
    ];
    expect(frequentPurchases(history, "expense")).toEqual([
      { note: "taxi", amount: "500", uses: 3 },
      { note: "Riz gras", amount: "750", uses: 2 },
      { note: "crédit orange", amount: "1000", uses: 1 },
    ]);
  });

  it("keeps to the direction asked and to the limit", () => {
    const history = [spent("taxi", "500", 1), { note: "salaire", amount: "150000", direction: "income" as const, timestamp: 2 }];
    expect(frequentPurchases(history, "income")).toEqual([{ note: "salaire", amount: "150000", uses: 1 }]);
    expect(frequentPurchases([spent("a", "1", 1), spent("b", "1", 2), spent("c", "1", 3), spent("d", "1", 4)], "expense", 2)).toHaveLength(2);
  });

  it("breaks ties by the most recent use", () => {
    expect(frequentPurchases([spent("pain", "250", 1), spent("taxi", "500", 9)], "expense")[0]?.note).toBe("taxi");
  });

  it("shows the user's own purchase as the example, or one that fits the hour", () => {
    expect(quickLineExample([{ note: "Riz gras", amount: "750", uses: 2 }], 8, starters)).toBe("Riz gras 750");
    expect(quickLineExample([], 8, starters)).toBe("pain 250");
    expect(quickLineExample([], 13, starters)).toBe("riz gras 750");
    expect(quickLineExample([], 20, starters)).toBe("essence 1000");
  });
});
