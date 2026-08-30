import { describe, expect, it } from "vitest";
import type { FinancialStateSnapshot, TransactionDisplay } from "../domain/financialState.ts";
import {
  selectAccountDistribution,
  selectAccountOperations,
  selectAccountTransactions,
  selectAvailableAfterCommitments,
  selectBalanceTimeline,
  selectCashFlowTimeline,
  selectDashboardAlerts,
  selectExpensesByCategory,
  selectUpcomingCommitments,
} from "./dashboard.ts";
import type { FinancialOperation } from "../domain/financialOperations.ts";

function transaction(overrides: Partial<TransactionDisplay> & Pick<TransactionDisplay, "id" | "timestamp" | "direction">): TransactionDisplay {
  return {
    accountId: "account",
    categoryId: "category",
    amount: { minorUnits: 100, currency: "XOF" },
    displayAmount: { minorUnits: 100, currency: "XOF" },
    note: "",
    tags: [],
    merchant: "",
    ...overrides,
  };
}

function snapshot(overrides: Partial<FinancialStateSnapshot> = {}): FinancialStateSnapshot {
  return {
    version: 4,
    asOfEventId: "event",
    asOfTimestamp: new Date(2026, 7, 20).getTime(),
    baseCurrency: "XOF",
    currencyContextId: "XOF",
    missingFxCurrencies: [],
    accounts: [],
    categories: [],
    budgets: [],
    goals: [],
    recurringItems: [],
    debtCredits: [],
    transfers: [],
    plannedExpenses: [],
    periodStart: new Date(2026, 7, 1).getTime(),
    periodEnd: new Date(2026, 8, 0, 23, 59, 59, 999).getTime(),
    totalBalance: { minorUnits: 100_000, currency: "XOF" },
    periodIncome: { minorUnits: 0, currency: "XOF" },
    periodExpenses: { minorUnits: 0, currency: "XOF" },
    netCashFlow: { minorUnits: 0, currency: "XOF" },
    categoryTotals: {},
    budgetProgress: {},
    goalProgress: {},
    projectedRecurring: [],
    ...overrides,
  };
}

function operation(overrides: Partial<FinancialOperation> & Pick<FinancialOperation, "id" | "timestamp" | "kind">): FinancialOperation {
  return { direction: null, amount: null, displayAmount: null, note: "", accountId: null, toAccountId: null, externalDestination: null, categoryId: null, goalId: null, recurringItemId: null, ...overrides };
}

describe("dashboard analytics", () => {
  it("builds cash-flow buckets in one pass and ignores transactions outside the period", () => {
    const start = new Date(2026, 7, 1).getTime();
    const end = new Date(2026, 7, 10, 23, 59, 59, 999).getTime();
    const points = selectCashFlowTimeline([
      transaction({ id: "income", timestamp: start + 100, direction: "income", displayAmount: { minorUnits: 1_000, currency: "XOF" } }),
      transaction({ id: "expense", timestamp: start + 200, direction: "expense", displayAmount: { minorUnits: 250, currency: "XOF" } }),
      transaction({ id: "outside", timestamp: end + 1, direction: "income", displayAmount: { minorUnits: 9_999, currency: "XOF" } }),
    ], { start, end }, 5);

    expect(points.reduce((sum, point) => sum + point.income, 0)).toBe(1_000);
    expect(points.reduce((sum, point) => sum + point.expenses, 0)).toBe(250);
    expect(points.reduce((sum, point) => sum + point.net, 0)).toBe(750);
  });

  it("groups expenses by category with stable ordering and shares", () => {
    const items = selectExpensesByCategory([
      transaction({ id: "a", timestamp: 10, direction: "expense", categoryId: "food", displayAmount: { minorUnits: 300, currency: "XOF" } }),
      transaction({ id: "b", timestamp: 11, direction: "expense", categoryId: "rent", displayAmount: { minorUnits: 700, currency: "XOF" } }),
      transaction({ id: "c", timestamp: 12, direction: "income", categoryId: "food", displayAmount: { minorUnits: 500, currency: "XOF" } }),
    ], { start: 0, end: 20 }, "XOF");

    expect(items.map((item) => [item.categoryId, item.amount.minorUnits, item.share])).toEqual([
      ["rent", 700, 70],
      ["food", 300, 30],
    ]);
  });

  it("reconstructs balance evolution while keeping internal transfers neutral", () => {
    const points = selectBalanceTimeline({ minorUnits: 12_000, currency: "XOF" }, [
      operation({ id: "income", timestamp: 2, kind: "income", displayAmount: { minorUnits: 5_000, currency: "XOF" } }),
      operation({ id: "expense", timestamp: 3, kind: "expense", displayAmount: { minorUnits: 2_000, currency: "XOF" } }),
      operation({ id: "internal", timestamp: 4, kind: "transfer", toAccountId: "bank", displayAmount: { minorUnits: 50_000, currency: "XOF" } }),
      operation({ id: "external", timestamp: 5, kind: "transfer", externalDestination: "Other", displayAmount: { minorUnits: 1_000, currency: "XOF" } }),
    ], { start: 1, end: 10 }, 2);
    expect(points[0]?.balance).toBe(10_000);
    expect(points.at(-1)?.balance).toBe(12_000);
  });

  it("counts internal transfers when reconstructing one selected account", () => {
    const points = selectBalanceTimeline({ minorUnits: 4_000, currency: "XOF" }, [
      operation({ id: "internal", timestamp: 4, kind: "transfer", accountId: "cash", toAccountId: "bank", amount: { minorUnits: 1_000, currency: "XOF" }, displayAmount: { minorUnits: 1_000, currency: "XOF" } }),
    ], { start: 1, end: 10 }, 2, "cash");
    expect(points[0]?.balance).toBe(5_000);
    expect(points.at(-1)?.balance).toBe(4_000);
  });

  it("counts realised recurring income and expenses in the balance path", () => {
    const points = selectBalanceTimeline({ minorUnits: 6_000, currency: "XOF" }, [
      operation({ id: "rent", timestamp: 3, kind: "recurring_realisation", direction: "expense", displayAmount: { minorUnits: 2_000, currency: "XOF" } }),
      operation({ id: "salary", timestamp: 4, kind: "recurring_realisation", direction: "income", displayAmount: { minorUnits: 3_000, currency: "XOF" } }),
    ], { start: 1, end: 10 }, 2);
    expect(points[0]?.balance).toBe(5_000);
    expect(points.at(-1)?.balance).toBe(6_000);
  });

  it("scopes native transaction values to one account without mutating the source", () => {
    const source = [
      transaction({ id: "cash", timestamp: 1, direction: "expense", accountId: "cash", amount: { minorUnits: 500, currency: "XOF" }, displayAmount: { minorUnits: 1, currency: "EUR" } }),
      transaction({ id: "bank", timestamp: 2, direction: "income", accountId: "bank" }),
    ];
    const result = selectAccountTransactions(source, "cash");
    expect(result.map((item) => item.id)).toEqual(["cash"]);
    expect(result[0]?.displayAmount).toEqual({ minorUnits: 500, currency: "XOF" });
    expect(source[0]?.displayAmount).toEqual({ minorUnits: 1, currency: "EUR" });
  });

  it("keeps incoming and outgoing transfers in a selected account operation scope", () => {
    const result = selectAccountOperations([
      operation({ id: "out", timestamp: 1, kind: "transfer", accountId: "cash", toAccountId: "bank", amount: { minorUnits: 100, currency: "XOF" } }),
      operation({ id: "in", timestamp: 2, kind: "transfer", accountId: "bank", toAccountId: "cash", amount: { minorUnits: 200, currency: "XOF" } }),
      operation({ id: "other", timestamp: 3, kind: "expense", accountId: "bank", amount: { minorUnits: 300, currency: "XOF" } }),
    ], "cash");
    expect(result.map((item) => item.id)).toEqual(["out", "in"]);
    expect(result.every((item) => item.displayAmount === item.amount)).toBe(true);
  });

  it("does not invent account shares when account currencies are incompatible", () => {
    const result = selectAccountDistribution(snapshot({
      accounts: [
        { id: "xof", name: "Mobile", type: "mobile_money", currency: "XOF", isActive: true, balance: { minorUnits: 5_000, currency: "XOF" }, initialBalance: { minorUnits: 0, currency: "XOF" } },
        { id: "eur", name: "Bank", type: "bank", currency: "EUR", isActive: true, balance: { minorUnits: 10, currency: "EUR" }, initialBalance: { minorUnits: 0, currency: "EUR" } },
      ],
    }));
    expect(result.every((item) => item.share == null)).toBe(true);
  });

  it("keeps only active future commitments and removes completed planned expenses", () => {
    const dueAt = new Date(2026, 7, 25).getTime();
    const result = selectUpcomingCommitments(snapshot({
      plannedExpenses: [
        { id: "pending", label: "School", estimatedAmount: { minorUnits: 4_000, currency: "XOF" }, categoryId: "c", priority: "high", dueDate: dueAt, note: "", status: "pending", createdAt: 1, updatedAt: 1, completedAt: null, cancelledAt: null, transactionId: null, completedAccountId: null, actualAmount: null },
        { id: "done", label: "Done", estimatedAmount: { minorUnits: 2_000, currency: "XOF" }, categoryId: "c", priority: "low", dueDate: dueAt, note: "", status: "completed", createdAt: 1, updatedAt: 2, completedAt: 2, cancelledAt: null, transactionId: "tx", completedAccountId: "a", actualAmount: { minorUnits: 2_000, currency: "XOF" } },
      ],
      debtCredits: [
        { id: "debt", kind: "debt", partyName: "Awa", motive: "Loan", amount: { minorUnits: 1_000, currency: "XOF" }, date: 1, dueDate: dueAt, status: "pending" },
        { id: "settled", kind: "receivable", partyName: "Moussa", motive: "Loan", amount: { minorUnits: 1_000, currency: "XOF" }, date: 1, dueDate: dueAt, status: "settled" },
      ],
    }));

    expect(result.map((item) => item.id)).toEqual(["debt:debt", "planned:pending"]);
  });

  it("returns a reliable available-after-commitments value only for one currency", () => {
    const base = snapshot({
      plannedExpenses: [{ id: "pending", label: "School", estimatedAmount: { minorUnits: 4_000, currency: "XOF" }, categoryId: "c", priority: "high", dueDate: null, note: "", status: "pending", createdAt: 1, updatedAt: 1, completedAt: null, cancelledAt: null, transactionId: null, completedAccountId: null, actualAmount: null }],
    });
    expect(selectAvailableAfterCommitments(base)).toEqual({ minorUnits: 96_000, currency: "XOF" });
    base.plannedExpenses[0]!.estimatedAmount = { minorUnits: 10, currency: "EUR" };
    expect(selectAvailableAfterCommitments(base)).toBeNull();
  });

  it("creates stable period and threshold alert fingerprints", () => {
    const result = selectDashboardAlerts(snapshot({
      missingFxCurrencies: ["USD", "EUR", "USD"],
      periodIncome: { minorUnits: 10_000, currency: "XOF" },
      periodExpenses: { minorUnits: 11_000, currency: "XOF" },
      netCashFlow: { minorUnits: -1_000, currency: "XOF" },
      budgets: [{ id: "food", name: "Food", categoryId: "c", limit: { minorUnits: 10_000, currency: "XOF" }, periodMonth: "2026-08", isArchived: false, spent: { minorUnits: 9_000, currency: "XOF" } }],
      budgetProgress: { food: { limit: { minorUnits: 10_000, currency: "XOF" }, spent: { minorUnits: 9_000, currency: "XOF" }, percentage: 90 } },
    }));

    expect(result.map((alert) => alert.id)).toEqual([
      "budget-threshold:food:2026-08:90",
      "missing-fx:XOF:EUR,USD",
      "negative-cash-flow:2026-08",
    ]);
  });

  it("explains expenses funded from the opening balance without calling them excess spending", () => {
    const result = selectDashboardAlerts(snapshot({
      periodIncome: { minorUnits: 0, currency: "XOF" },
      periodExpenses: { minorUnits: 5_000, currency: "XOF" },
      netCashFlow: { minorUnits: -5_000, currency: "XOF" },
    }));

    expect(result).toContainEqual({
      id: "spending-from-balance:2026-08",
      kind: "spending_from_balance",
      severity: "info",
      entityId: "2026-08",
      threshold: null,
    });
  });

  it("rejects reversed date ranges instead of silently producing misleading data", () => {
    expect(() => selectCashFlowTimeline([], { start: 20, end: 10 })).toThrow(/must not precede/);
  });
});
