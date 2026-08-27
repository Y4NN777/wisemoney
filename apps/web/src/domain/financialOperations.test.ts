import { describe, expect, it } from "vitest";
import type { DecodedFinancialEvent } from "./financialOperations.ts";
import { projectFinancialOperations } from "./financialOperations.ts";

function event(overrides: Partial<DecodedFinancialEvent> & Pick<DecodedFinancialEvent, "id" | "timestamp" | "type">): DecodedFinancialEvent {
  return { payload: {}, ...overrides };
}

describe("projectFinancialOperations", () => {
  it("replays updates and deletions without duplicating transactions", () => {
    const operations = projectFinancialOperations([
      event({ id: "created", timestamp: 10, type: "transaction_created", payload: { accountId: "a", categoryId: "food", amount: { minorUnits: 100, currency: "XOF" }, direction: "expense", note: "First", occurredAt: 5 } }),
      event({ id: "updated", timestamp: 20, type: "transaction_updated", payload: { originalEventId: "created", accountId: "a", categoryId: "rent", amount: { minorUnits: 200, currency: "XOF" }, direction: "expense", note: "Updated" } }),
      event({ id: "deleted-created", timestamp: 30, type: "transaction_created", payload: { accountId: "a", categoryId: "food", amount: { minorUnits: 500, currency: "XOF" }, direction: "income" } }),
      event({ id: "delete", timestamp: 40, type: "transaction_deleted", payload: { originalEventId: "deleted-created" } }),
    ]);
    expect(operations).toHaveLength(1);
    expect(operations[0]).toMatchObject({ id: "created", timestamp: 5, categoryId: "rent", note: "Updated", amount: { minorUnits: 200, currency: "XOF" } });
  });

  it("classifies a completed planned expense as one actual operation", () => {
    const operations = projectFinancialOperations([
      event({ id: "tx", timestamp: 10, type: "transaction_created", payload: { accountId: "a", categoryId: "school", amount: { minorUnits: 2_000, currency: "XOF" }, direction: "expense", tags: ["planned-expense"] } }),
      event({ id: "complete", timestamp: 11, type: "planned_expense_completed", payload: { plannedExpenseId: "planned", transactionId: "tx", accountId: "a", actualAmount: { minorUnits: 2_000, currency: "XOF" }, occurredAt: 10 } }),
    ]);
    expect(operations).toHaveLength(1);
    expect(operations[0]?.kind).toBe("planned_expense");
  });

  it("keeps transfers neutral and exposes both endpoints", () => {
    const [operation] = projectFinancialOperations([
      event({ id: "transfer", timestamp: 10, type: "transfer_created", payload: { fromAccountId: "cash", toAccountId: "bank", externalDestination: null, amount: { minorUnits: 1_000, currency: "XOF" }, note: "Move" } }),
    ]);
    expect(operation).toMatchObject({ kind: "transfer", direction: null, accountId: "cash", toAccountId: "bank" });
  });

  it("includes goal contributions and recurring realisations without treating them as cash flow", () => {
    const operations = projectFinancialOperations([
      event({ id: "recurring", timestamp: 1, type: "recurring_item_created", payload: { categoryId: "rent", label: "Rent", amount: { minorUnits: 50_000, currency: "XOF" }, direction: "expense", frequency: "monthly", startDate: 1 } }),
      event({ id: "realised", timestamp: 10, type: "recurring_item_realised", payload: { itemId: "recurring", date: 9 } }),
      event({ id: "goal", timestamp: 8, type: "goal_contribution", payload: { goalId: "emergency", amount: { minorUnits: 5_000, currency: "XOF" } } }),
    ]);
    expect(operations.map((operation) => operation.kind)).toEqual(["recurring_realisation", "goal_contribution"]);
    expect(operations[0]).toMatchObject({ direction: "expense", timestamp: 9, note: "Rent" });
    expect(operations[1]?.direction).toBeNull();
  });

  it("folds an atomic recurring realisation and its tagged transaction into one actual operation", () => {
    const operations = projectFinancialOperations([
      event({ id: "recurring", timestamp: 1, type: "recurring_item_created", payload: { categoryId: "rent", label: "Rent", amount: { minorUnits: 50_000, currency: "XOF" }, direction: "expense", frequency: "monthly", startDate: 1 } }),
      event({ id: "realised", timestamp: 10, type: "recurring_item_realised", payload: { itemId: "recurring", amount: { minorUnits: 50_000, currency: "XOF" }, date: 10 } }),
      event({ id: "transaction", timestamp: 10, type: "transaction_created", payload: { accountId: "cash", categoryId: "rent", amount: { minorUnits: 50_000, currency: "XOF" }, direction: "expense", note: "Recurring: Rent", tags: ["recurring"] } }),
    ]);
    expect(operations).toHaveLength(1);
    expect(operations[0]).toMatchObject({ id: "transaction", kind: "recurring_realisation", direction: "expense" });
  });
});
