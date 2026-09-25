import { describe, expect, it } from "vitest";
import type { FinancialOperation } from "../../domain/financialOperations.ts";
import type { TransactionDisplay } from "../../domain/financialState.ts";
import {
  RECENT_MOVEMENT_LIMIT,
  indexTransactionsById,
  selectHomeLayout,
  selectRecentMovements,
  type HomeSectionId,
} from "./homeSelectors.ts";

function operation(overrides: Partial<FinancialOperation> & { id: string; timestamp: number }): FinancialOperation {
  return {
    kind: "expense",
    direction: "expense",
    amount: { minorUnits: 100, currency: "XOF" },
    displayAmount: { minorUnits: 100, currency: "XOF" },
    destinationAmount: null,
    note: "",
    merchant: null,
    accountId: "cash",
    toAccountId: null,
    externalDestination: null,
    categoryId: "food",
    goalId: null,
    recurringItemId: null,
    cashFlowRole: "expense",
    isLegacyExternal: false,
    ...overrides,
  };
}

const ALL_SECTIONS: HomeSectionId[] = ["summary", "firstSteps", "quickActions", "attention", "recentMovements", "assistant", "charts", "planningCards", "aiInsight"];

describe("selectRecentMovements", () => {
  const ops = [
    operation({ id: "a", timestamp: 100 }),
    operation({ id: "b", timestamp: 300 }),
    operation({ id: "c", timestamp: 200 }),
    operation({ id: "d", timestamp: 300 }),
    operation({ id: "future", timestamp: 900 }),
    operation({ id: "transfer", timestamp: 250, kind: "transfer", direction: null, accountId: "cash", toAccountId: "savings", cashFlowRole: "neutral" }),
  ];

  it("returns the newest first, capped, and never past the period end", () => {
    const result = selectRecentMovements(ops, { accountId: null, end: 500, limit: 3 });
    expect(result.map((item) => item.id)).toEqual(["d", "b", "transfer"]);
  });

  it("breaks timestamp ties on id so the order is stable", () => {
    const result = selectRecentMovements(ops, { accountId: null, end: 500, limit: 2 });
    expect(result.map((item) => item.id)).toEqual(["d", "b"]);
  });

  it("keeps both sides of a transfer when an account is selected", () => {
    const savings = selectRecentMovements(ops, { accountId: "savings", end: 500, limit: RECENT_MOVEMENT_LIMIT });
    expect(savings.map((item) => item.id)).toEqual(["transfer"]);
  });

  it("is empty for no operations", () => {
    expect(selectRecentMovements([], { accountId: null, end: 500, limit: 5 })).toEqual([]);
  });
});

describe("indexTransactionsById", () => {
  it("indexes by id with last write winning", () => {
    const tx = (id: string, note: string) => ({ id, note } as unknown as TransactionDisplay);
    const index = indexTransactionsById([tx("1", "first"), tx("2", "second"), tx("1", "again")]);
    expect(index.size).toBe(2);
    expect(index.get("1")?.note).toBe("again");
  });
});

describe("selectHomeLayout", () => {
  it("leads with the summary, ends the first viewport with the assistant entry, folds the charts first", () => {
    const layout = selectHomeLayout({ canMutate: true });
    expect(layout.aboveFold[0]).toBe("summary");
    expect(layout.aboveFold.at(-1)).toBe("assistant");
    expect(layout.belowFold[0]).toBe("charts");
  });

  it("drops quick actions when the period cannot be mutated and never loses a section", () => {
    for (const canMutate of [true, false]) {
      const layout = selectHomeLayout({ canMutate });
      const all = [...layout.aboveFold, ...layout.belowFold];
      expect(new Set(all)).toEqual(new Set(canMutate ? ALL_SECTIONS : ALL_SECTIONS.filter((id) => id !== "quickActions")));
      expect(all.length).toBe(new Set(all).size);
    }
  });
});
