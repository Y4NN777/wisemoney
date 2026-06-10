/**
 * redaction.ts unit tests.
 *
 * Coverage:
 *   R-01  toRedacted with FullEgressContext — strips `transactions`, retains all
 *         RedactedEgressContext fields, result has no full-only keys.
 *   R-02  toRedacted with RedactedEgressContext — identity-like (no-op on shape),
 *         retains all fields unchanged.
 *   R-03  toRedacted does not mutate the input.
 *   R-04  toRedacted result satisfies RedactedEgressContext structural contract
 *         (all required keys present, no extra keys).
 */

import { describe, it, expect } from "vitest";
import type { FullEgressContext, RedactedEgressContext } from "./redaction.ts";
import { toRedacted } from "./redaction.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const REDACTED_BASE: RedactedEgressContext = {
  periodTotalsPerCategory: {
    food: { minorUnits: 5000, currency: "EUR" },
  },
  totalIncome: { minorUnits: 200_000, currency: "EUR" },
  totalExpenses: { minorUnits: 95_000, currency: "EUR" },
  netCashFlow: { minorUnits: 105_000, currency: "EUR" },
  budgetStatusPercent: { groceries: 72 },
  goalProgressPercent: { emergency: 45 },
  trendDirection: { food: "up" },
};

const FULL_CTX: FullEgressContext = {
  ...REDACTED_BASE,
  transactions: [
    {
      id: "tx-abc",
      timestamp: 1_718_000_000_000,
      amount: { minorUnits: 1500, currency: "EUR" },
      categoryId: "food",
      note: "supermarket",
    },
    {
      id: "tx-def",
      timestamp: 1_718_100_000_000,
      amount: { minorUnits: 500, currency: "EUR" },
      categoryId: "transport",
      note: "bus pass",
    },
  ],
};

// ---------------------------------------------------------------------------
// R-01: toRedacted strips full-only field from FullEgressContext
// ---------------------------------------------------------------------------

describe("toRedacted — FullEgressContext input", () => {
  it("R-01: strips `transactions` and retains all RedactedEgressContext fields", () => {
    const result = toRedacted(FULL_CTX);

    // Full-only field must be absent.
    expect("transactions" in result).toBe(false);

    // All RedactedEgressContext fields must be present with correct values.
    expect(result.periodTotalsPerCategory).toEqual(
      REDACTED_BASE.periodTotalsPerCategory
    );
    expect(result.totalIncome).toEqual(REDACTED_BASE.totalIncome);
    expect(result.totalExpenses).toEqual(REDACTED_BASE.totalExpenses);
    expect(result.netCashFlow).toEqual(REDACTED_BASE.netCashFlow);
    expect(result.budgetStatusPercent).toEqual(
      REDACTED_BASE.budgetStatusPercent
    );
    expect(result.goalProgressPercent).toEqual(
      REDACTED_BASE.goalProgressPercent
    );
    expect(result.trendDirection).toEqual(REDACTED_BASE.trendDirection);
  });
});

// ---------------------------------------------------------------------------
// R-02: toRedacted with a RedactedEgressContext input (already redacted)
// ---------------------------------------------------------------------------

describe("toRedacted — RedactedEgressContext input", () => {
  it("R-02: identity-like — all fields retained unchanged, no extra keys", () => {
    const result = toRedacted(REDACTED_BASE);

    expect(result).toEqual(REDACTED_BASE);
    expect("transactions" in result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// R-03: toRedacted does not mutate the input
// ---------------------------------------------------------------------------

describe("toRedacted — immutability", () => {
  it("R-03: does not mutate the FullEgressContext passed in", () => {
    const snapshot = JSON.stringify(FULL_CTX);
    toRedacted(FULL_CTX);
    expect(JSON.stringify(FULL_CTX)).toBe(snapshot);
  });
});

// ---------------------------------------------------------------------------
// R-04: result has exactly the RedactedEgressContext keys
// ---------------------------------------------------------------------------

describe("toRedacted — structural contract", () => {
  it("R-04: result has exactly the seven RedactedEgressContext keys", () => {
    const result = toRedacted(FULL_CTX);
    const keys = Object.keys(result).sort();
    expect(keys).toEqual(
      [
        "periodTotalsPerCategory",
        "totalIncome",
        "totalExpenses",
        "netCashFlow",
        "budgetStatusPercent",
        "goalProgressPercent",
        "trendDirection",
      ].sort()
    );
  });
});
