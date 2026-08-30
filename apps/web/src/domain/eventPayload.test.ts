import { describe, expect, it } from "vitest";
import { validateFinancialEventPayload } from "./eventPayload.ts";
import type { FinancialEventPayload, FinancialEventType } from "./eventStore.ts";
import { validateDecryptedEventSequence } from "./financialState.ts";

const money = { minorUnits: 100, currency: "XOF" };
const validPayloads: Record<FinancialEventType, FinancialEventPayload> = {
  account_created: { name: "Cash", type: "cash", initialBalance: { minorUnits: 0, currency: "XOF" } },
  account_updated: { accountId: "a", name: "Cash", type: "cash" },
  account_archived: { accountId: "a" },
  transaction_created: { accountId: "a", categoryId: "c", amount: money, direction: "expense", note: null, tags: [], merchant: null },
  transaction_updated: { originalEventId: "t", accountId: "a", categoryId: "c", amount: money, direction: "expense", note: null, tags: [], merchant: null },
  transaction_deleted: { originalEventId: "t" },
  category_created: { name: "Food", parentId: null, isSystemDefault: false },
  category_renamed: { categoryId: "c", newName: "Dining" },
  category_archived: { categoryId: "c" },
  budget_created: { name: "Food", categoryId: "c", limit: money, periodMonth: "2026-07" },
  budget_archived: { budgetId: "b" },
  goal_created: { name: "Reserve", targetAmount: money, targetDate: null },
  goal_contribution: { goalId: "g", amount: money },
  goal_archived: { goalId: "g" },
  recurring_item_created: { categoryId: "c", label: "Rent", amount: money, direction: "expense", frequency: "monthly", startDate: 1 },
  recurring_item_archived: { itemId: "r" },
  recurring_item_realised: { itemId: "r", amount: money, date: 1 },
  transfer_created: { fromAccountId: "a", toAccountId: "b", externalDestination: null, amount: money, note: null },
  debt_credit_created: { kind: "receivable", partyName: "Client", motive: "Invoice", amount: money, date: 1, status: "pending" },
  debt_credit_status_updated: { debtCreditId: "d", status: "partial" },
  debt_credit_due_date_updated: { debtCreditId: "d", dueDate: null },
  planned_expense_created: { label: "Laptop", estimatedAmount: money, categoryId: "c", priority: "high", dueDate: null, note: "Work" },
  planned_expense_updated: { plannedExpenseId: "p", label: "Laptop", estimatedAmount: money, categoryId: "c", priority: "medium", dueDate: 1, note: "Work" },
  planned_expense_cancelled: { plannedExpenseId: "p" },
  planned_expense_completed: { plannedExpenseId: "p", transactionId: "t", accountId: "a", actualAmount: money, occurredAt: 1 },
};

describe("financial event payload schemas", () => {
  it("accepts every event shape emitted by the business layer", () => {
    for (const [type, payload] of Object.entries(validPayloads)) {
      expect(() => validateFinancialEventPayload(type as FinancialEventType, payload)).not.toThrow();
    }
  });

  it("rejects unknown fields, unsafe money, and invalid transfer destinations", () => {
    expect(() => validateFinancialEventPayload("account_archived", { accountId: "a", extra: true })).toThrow();
    expect(() => validateFinancialEventPayload("goal_contribution", { goalId: "g", amount: { minorUnits: 1.5, currency: "XOF" } })).toThrow();
    expect(() => validateFinancialEventPayload("transfer_created", {
      fromAccountId: "a", toAccountId: "a", externalDestination: null, amount: money, note: null,
    })).toThrow();
  });

  it("accepts an internal destination amount and rejects one on legacy external transfers", () => {
    expect(() => validateFinancialEventPayload("transfer_created", {
      ...validPayloads.transfer_created,
      destinationAmount: { minorUnits: 2, currency: "EUR" },
    })).not.toThrow();
    expect(() => validateFinancialEventPayload("transfer_created", {
      fromAccountId: "a",
      toAccountId: null,
      externalDestination: "Merchant",
      amount: money,
      destinationAmount: { minorUnits: 2, currency: "EUR" },
    })).toThrow(/destination amount/);
  });

  it("accepts legacy signed transaction amounts for replay normalization", () => {
    expect(() => validateFinancialEventPayload("transaction_created", {
      ...validPayloads.transaction_created,
      amount: { minorUnits: -100, currency: "XOF" },
    })).not.toThrow();
  });

  it("accepts occurredAt only on transaction creation", () => {
    expect(() => validateFinancialEventPayload("transaction_created", {
      ...validPayloads.transaction_created,
      occurredAt: 1,
    })).not.toThrow();
    expect(() => validateFinancialEventPayload("transaction_updated", {
      ...validPayloads.transaction_updated,
      occurredAt: 1,
    })).toThrow(/schema/);
    expect(() => validateFinancialEventPayload("transaction_created", {
      ...validPayloads.transaction_created,
      occurredAt: -1,
    })).toThrow(/timestamp/);
  });

  it("keeps legacy debt creation payloads valid and validates optional due dates", () => {
    expect(() => validateFinancialEventPayload("debt_credit_created", validPayloads.debt_credit_created)).not.toThrow();
    expect(() => validateFinancialEventPayload("debt_credit_created", {
      ...validPayloads.debt_credit_created,
      dueDate: null,
    })).not.toThrow();
    expect(() => validateFinancialEventPayload("debt_credit_created", {
      ...validPayloads.debt_credit_created,
      dueDate: 1_800_000_000_000,
    })).not.toThrow();
    expect(() => validateFinancialEventPayload("debt_credit_created", {
      ...validPayloads.debt_credit_created,
      dueDate: -1,
    })).toThrow(/timestamp/);
    expect(() => validateFinancialEventPayload("debt_credit_due_date_updated", {
      debtCreditId: "d",
      dueDate: 1.5,
    })).toThrow(/timestamp/);
  });

  it.each([
    ["planned_expense_created", { ...validPayloads.planned_expense_created, label: " " }],
    ["planned_expense_created", { ...validPayloads.planned_expense_created, estimatedAmount: { minorUnits: 0, currency: "XOF" } }],
    ["planned_expense_created", { ...validPayloads.planned_expense_created, estimatedAmount: { minorUnits: 1, currency: "xof" } }],
    ["planned_expense_created", { ...validPayloads.planned_expense_created, categoryId: "" }],
    ["planned_expense_created", { ...validPayloads.planned_expense_created, priority: "urgent" }],
    ["planned_expense_created", { ...validPayloads.planned_expense_created, dueDate: -1 }],
    ["planned_expense_created", { ...validPayloads.planned_expense_created, note: null }],
    ["planned_expense_updated", { ...validPayloads.planned_expense_updated, plannedExpenseId: "" }],
    ["planned_expense_cancelled", { ...validPayloads.planned_expense_cancelled, extra: true }],
    ["planned_expense_completed", { ...validPayloads.planned_expense_completed, actualAmount: { minorUnits: -1, currency: "XOF" } }],
    ["planned_expense_completed", { ...validPayloads.planned_expense_completed, occurredAt: 1.5 }],
  ] satisfies Array<[FinancialEventType, FinancialEventPayload]>)
    ("rejects invalid %s payloads", (type, payload) => {
      expect(() => validateFinancialEventPayload(type, payload)).toThrow();
    });

  it("rejects a structurally valid sequence with broken references", () => {
    expect(() => validateDecryptedEventSequence([{
      id: "transaction",
      timestamp: 1,
      type: "transaction_created",
      payload: validPayloads.transaction_created,
    }])).toThrow(/missing account/);
  });
});
