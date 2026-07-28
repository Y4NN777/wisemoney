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

  it("accepts legacy signed transaction amounts for replay normalization", () => {
    expect(() => validateFinancialEventPayload("transaction_created", {
      ...validPayloads.transaction_created,
      amount: { minorUnits: -100, currency: "XOF" },
    })).not.toThrow();
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
