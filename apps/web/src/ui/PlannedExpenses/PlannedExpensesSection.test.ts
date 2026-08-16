import { describe, expect, it } from "vitest";

import type { FinancialStateSnapshot, PlannedExpenseState } from "@/domain/financialState.ts";
import { compatibleAccountIds, sortPlannedExpenses } from "./PlannedExpensesSection.tsx";

function planned(
  id: string,
  priority: PlannedExpenseState["priority"],
  dueDate: number | null,
  createdAt: number,
): PlannedExpenseState {
  return {
    id,
    label: id,
    estimatedAmount: { minorUnits: 100, currency: "XOF" },
    categoryId: "category",
    priority,
    dueDate,
    note: "",
    status: "pending",
    createdAt,
    updatedAt: createdAt,
    completedAt: null,
    cancelledAt: null,
    transactionId: null,
    completedAccountId: null,
    actualAmount: null,
  };
}

describe("sortPlannedExpenses", () => {
  it("orders high, medium, low before applying due dates", () => {
    const result = sortPlannedExpenses([
      planned("low", "low", 10, 1),
      planned("high", "high", null, 1),
      planned("medium", "medium", 5, 1),
    ]);

    expect(result.map((item) => item.id)).toEqual(["high", "medium", "low"]);
  });

  it("orders dated items first, by nearest due date, then oldest creation", () => {
    const result = sortPlannedExpenses([
      planned("none", "high", null, 1),
      planned("later", "high", 30, 1),
      planned("newer", "high", 20, 3),
      planned("older", "high", 20, 2),
    ]);

    expect(result.map((item) => item.id)).toEqual(["older", "newer", "later", "none"]);
  });
});

describe("compatibleAccountIds", () => {
  it("returns active accounts in the exact planned currency", () => {
    const accounts = [
      { id: "xof", isActive: true, currency: "XOF" },
      { id: "archived", isActive: false, currency: "XOF" },
      { id: "eur", isActive: true, currency: "EUR" },
    ] as FinancialStateSnapshot["accounts"];

    expect(compatibleAccountIds(accounts, "XOF")).toEqual(["xof"]);
  });
});

