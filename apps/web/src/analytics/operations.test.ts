import { describe, expect, it } from "vitest";
import type { FinancialOperation } from "../domain/financialOperations.ts";
import { filterFinancialOperations, groupOperationsByLocalDay, operationCashTotals } from "./operations.ts";

function operation(overrides: Partial<FinancialOperation> & Pick<FinancialOperation, "id" | "timestamp" | "kind">): FinancialOperation {
  return {
    direction: null,
    amount: null,
    displayAmount: null,
    note: "",
    accountId: null,
    toAccountId: null,
    externalDestination: null,
    categoryId: null,
    goalId: null,
    recurringItemId: null,
    ...overrides,
  };
}

const index = { accounts: { cash: "Espèces", bank: "Banque" }, categories: { food: "Alimentation" }, goals: { trip: "Voyage" } };

describe("operation analytics", () => {
  it("combines accent-insensitive search with account and category filters", () => {
    const items = [
      operation({ id: "expense", timestamp: 10, kind: "expense", accountId: "cash", categoryId: "food", note: "Déjeuner" }),
      operation({ id: "transfer", timestamp: 11, kind: "transfer", accountId: "cash", toAccountId: "bank" }),
    ];
    const filtered = filterFinancialOperations(items, { query: "dejeuner", kind: "expense", accountId: "cash", categoryId: "food", start: 0, end: 20 }, index);
    expect(filtered.map((item) => item.id)).toEqual(["expense"]);
  });

  it("finds a transfer through its destination account", () => {
    const items = [operation({ id: "transfer", timestamp: 11, kind: "transfer", accountId: "cash", toAccountId: "bank" })];
    expect(filterFinancialOperations(items, { query: "banque", kind: "all", accountId: "all", categoryId: "all", start: 0, end: 20 }, index)).toHaveLength(1);
    expect(filterFinancialOperations(items, { query: "", kind: "all", accountId: "bank", categoryId: "all", start: 0, end: 20 }, index)).toHaveLength(1);
  });

  it("excludes neutral movements from income and expense totals", () => {
    const totals = operationCashTotals([
      operation({ id: "income", timestamp: 1, kind: "income", displayAmount: { minorUnits: 10_000, currency: "XOF" } }),
      operation({ id: "expense", timestamp: 2, kind: "expense", displayAmount: { minorUnits: 3_000, currency: "XOF" } }),
      operation({ id: "planned", timestamp: 3, kind: "planned_expense", displayAmount: { minorUnits: 2_000, currency: "XOF" } }),
      operation({ id: "recurring", timestamp: 3, kind: "recurring_realisation", direction: "expense", displayAmount: { minorUnits: 1_000, currency: "XOF" } }),
      operation({ id: "transfer", timestamp: 4, kind: "transfer", displayAmount: { minorUnits: 99_000, currency: "XOF" } }),
    ], "XOF");
    expect(totals).toEqual({ income: 10_000, expenses: 6_000, net: 4_000 });
  });

  it("groups operations by local calendar day", () => {
    const first = new Date(2026, 7, 1, 8).getTime();
    const second = new Date(2026, 7, 2, 8).getTime();
    expect(groupOperationsByLocalDay([
      operation({ id: "a", timestamp: first, kind: "income" }),
      operation({ id: "b", timestamp: second, kind: "expense" }),
    ]).map((group) => group.day)).toEqual(["2026-08-01", "2026-08-02"]);
  });
});
