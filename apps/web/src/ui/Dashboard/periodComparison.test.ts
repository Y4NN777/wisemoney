import { describe, expect, it } from "vitest";
import { comparePeriodAmounts } from "./periodComparison.ts";

describe("comparePeriodAmounts", () => {
  it("does not turn a missing previous baseline into a fake +100%", () => {
    expect(comparePeriodAmounts(100_000, 0)).toEqual({ kind: "new", difference: 100_000 });
  });

  it("describes a period that stopped instead of showing -100%", () => {
    expect(comparePeriodAmounts(0, 75_000)).toEqual({ kind: "stopped", difference: 75_000 });
  });

  it("returns absolute increases and decreases in the user’s currency", () => {
    expect(comparePeriodAmounts(125_000, 100_000)).toEqual({ kind: "increase", difference: 25_000 });
    expect(comparePeriodAmounts(80_000, 100_000)).toEqual({ kind: "decrease", difference: 20_000 });
  });

  it("separates equal activity from two empty periods", () => {
    expect(comparePeriodAmounts(50_000, 50_000)).toEqual({ kind: "same", difference: 0 });
    expect(comparePeriodAmounts(0, 0)).toEqual({ kind: "no-activity", difference: 0 });
  });

  it("rejects invalid financial totals", () => {
    expect(() => comparePeriodAmounts(-1, 0)).toThrow(/non-negative safe integers/);
    expect(() => comparePeriodAmounts(1.5, 0)).toThrow(/non-negative safe integers/);
  });
});
