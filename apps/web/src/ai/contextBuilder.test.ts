import { describe, expect, it } from "vitest";
import { computeTrends } from "./contextBuilder.ts";

describe("computeTrends", () => {
  it("compares current category spending with the previous period", () => {
    expect(computeTrends(
      {
        food: { minorUnits: 12_000, currency: "XOF" },
        transport: { minorUnits: 2_000, currency: "XOF" },
        stable: { minorUnits: 500, currency: "XOF" },
      },
      {
        food: { minorUnits: 10_000, currency: "XOF" },
        transport: { minorUnits: 3_000, currency: "XOF" },
        stable: { minorUnits: 500, currency: "XOF" },
        removed: { minorUnits: 800, currency: "XOF" },
      }
    )).toEqual({
      food: "up",
      transport: "down",
      stable: "stable",
      removed: "down",
    });
  });
});
