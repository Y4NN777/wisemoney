import { describe, expect, it } from "vitest";
import type { FinancialOperation } from "../domain/financialOperations.ts";
import { filterFinancialOperations, groupOperationsByLocalDay, operationAmountForAccount, operationCashTotals, operationEffect, summarizeMonthlyActivity } from "./operations.ts";

function operation(overrides: Partial<FinancialOperation> & Pick<FinancialOperation, "id" | "timestamp" | "kind">): FinancialOperation {
  const inferredRole = overrides.kind === "income"
    ? "income"
    : overrides.kind === "expense" || overrides.kind === "planned_expense" || (overrides.kind === "recurring_realisation" && overrides.direction === "expense")
      ? "expense"
      : overrides.kind === "recurring_realisation" && overrides.direction === "income" ? "income" : "neutral";
  return {
    direction: null,
    amount: null,
    displayAmount: null,
    destinationAmount: null,
    note: "",
    merchant: null,
    accountId: null,
    toAccountId: null,
    externalDestination: null,
    categoryId: null,
    goalId: null,
    recurringItemId: null,
    cashFlowRole: inferredRole,
    isLegacyExternal: false,
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

  it("finds merchants and presents legacy external transfers as expenses", () => {
    const legacy = operation({
      id: "legacy",
      timestamp: 12,
      kind: "transfer",
      accountId: "cash",
      externalDestination: "Awa",
      cashFlowRole: "expense",
      isLegacyExternal: true,
    });
    const merchant = operation({ id: "merchant", timestamp: 13, kind: "expense", merchant: "Marché de Gounghin" });
    expect(filterFinancialOperations([legacy], { query: "", kind: "expense", accountId: "all", categoryId: "all", start: 0, end: 20 }, index)).toEqual([legacy]);
    expect(filterFinancialOperations([legacy], { query: "", kind: "transfer", accountId: "all", categoryId: "all", start: 0, end: 20 }, index)).toEqual([]);
    expect(filterFinancialOperations([merchant], { query: "gounghin", kind: "all", accountId: "all", categoryId: "all", start: 0, end: 20 }, index)).toEqual([merchant]);
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

  it("summarizes global cash flow while keeping internal transfers neutral", () => {
    const summary = summarizeMonthlyActivity({
      operations: [
        operation({ id: "income", timestamp: 1, kind: "income", categoryId: "salary", displayAmount: { minorUnits: 20_000, currency: "XOF" } }),
        operation({ id: "expense", timestamp: 2, kind: "expense", categoryId: "food", displayAmount: { minorUnits: 5_000, currency: "XOF" } }),
        operation({ id: "internal", timestamp: 3, kind: "transfer", accountId: "cash", toAccountId: "bank", displayAmount: { minorUnits: 8_000, currency: "XOF" } }),
        operation({ id: "legacy", timestamp: 4, kind: "transfer", accountId: "cash", externalDestination: "Other", displayAmount: { minorUnits: 2_000, currency: "XOF" }, cashFlowRole: "expense", isLegacyExternal: true }),
      ],
      start: 0,
      end: 10,
      accountId: null,
      displayCurrency: "XOF",
    });
    expect(summary).toMatchObject({
      received: { minorUnits: 20_000, currency: "XOF" },
      spent: { minorUnits: 7_000, currency: "XOF" },
      difference: { minorUnits: 13_000, currency: "XOF" },
      uncategorizedSpent: { minorUnits: 2_000, currency: "XOF" },
      isPartial: false,
    });
  });

  it("uses the immutable destination amount for the receiving account", () => {
    const transfer = operation({
      id: "fx",
      timestamp: 1,
      kind: "transfer",
      accountId: "xof",
      toAccountId: "usd",
      amount: { minorUnits: 10_000, currency: "XOF" },
      displayAmount: { minorUnits: 10_000, currency: "XOF" },
      destinationAmount: { minorUnits: 1_650, currency: "USD" },
    });
    expect(operationEffect(transfer, null)).toBe("neutral");
    expect(operationEffect(transfer, "xof")).toBe("outgoing");
    expect(operationEffect(transfer, "usd")).toBe("incoming");
    expect(operationAmountForAccount(transfer, "usd")).toEqual({ minorUnits: 1_650, currency: "USD" });
    expect(summarizeMonthlyActivity({ operations: [transfer], start: 0, end: 2, accountId: "usd", displayCurrency: "USD" }).received.minorUnits).toBe(1_650);
  });

  it("summarizes a 10,000-operation activity context without dropping rows", () => {
    const operations = Array.from({ length: 10_000 }, (_, index) => operation({
      id: `expense-${index}`,
      timestamp: index + 1,
      kind: "expense",
      accountId: "cash",
      categoryId: "food",
      amount: { minorUnits: 100, currency: "XOF" },
      displayAmount: { minorUnits: 100, currency: "XOF" },
      cashFlowRole: "expense",
    }));
    const summary = summarizeMonthlyActivity({
      operations,
      start: 1,
      end: 10_000,
      accountId: null,
      displayCurrency: "XOF",
    });
    expect(summary.spent.minorUnits).toBe(1_000_000);
    expect(summary.difference.minorUnits).toBe(-1_000_000);
  });
});
