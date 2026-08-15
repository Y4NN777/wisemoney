import { beforeEach, describe, expect, it, vi } from "vitest";

type AppendedEvent = {
  id: string;
  timestamp: number;
  type: string;
  entityId: string;
  payload: Record<string, unknown>;
  masterKey: unknown;
  expectedLastEventId?: string;
};

const { fakeAppendEvent, fakeAppendEvents, fakeGetSnapshot } = vi.hoisted(() => ({
  fakeAppendEvent: vi.fn<(event: AppendedEvent) => Promise<void>>(),
  fakeAppendEvents: vi.fn<(events: readonly AppendedEvent[]) => Promise<void>>(),
  fakeGetSnapshot: vi.fn<() => Promise<Record<string, unknown>>>(),
}));

vi.mock("@/domain/eventStore.ts", () => ({
  appendEvent: fakeAppendEvent,
  appendEvents: fakeAppendEvents,
}));

vi.mock("@/domain/financialState.ts", () => ({
  getSnapshot: fakeGetSnapshot,
  readTransactionsInRange: vi.fn(),
}));

import {
  archiveCategory,
  cancelPlannedExpense,
  completePlannedExpense,
  createPlannedExpense,
  updatePlannedExpense,
  ValidationError,
} from "./index.ts";

const mkKey = { _brand: "MasterKey" as const, key: null as unknown as CryptoKey };

const pendingExpense = {
  id: "planned-1",
  label: "Annual insurance",
  estimatedAmount: { minorUnits: 25_000, currency: "XOF" },
  categoryId: "category-1",
  priority: "high" as const,
  dueDate: 1_800_000_000_000,
  note: "Renewal",
  status: "pending" as const,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  completedAt: null,
  cancelledAt: null,
  transactionId: null,
  completedAccountId: null,
  actualAmount: null,
};

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    asOfEventId: "snapshot-event",
    accounts: [{
      id: "account-1",
      currency: "XOF",
      isActive: true,
      balance: { minorUnits: 100_000, currency: "XOF" },
    }],
    categories: [{ id: "category-1", isArchived: false }],
    budgets: [],
    recurringItems: [],
    plannedExpenses: [pendingExpense],
    ...overrides,
  };
}

beforeEach(() => {
  fakeAppendEvent.mockReset();
  fakeAppendEvents.mockReset();
  fakeGetSnapshot.mockReset();
  fakeAppendEvent.mockResolvedValue(undefined);
  fakeAppendEvents.mockResolvedValue(undefined);
  fakeGetSnapshot.mockResolvedValue(snapshot());
});

describe("createPlannedExpense", () => {
  it("reloads state and creates only a planned expense without requiring an account", async () => {
    const id = await createPlannedExpense({
      label: "  School supplies  ",
      estimatedAmount: { minorUnits: 12_500, currency: "XOF" },
      categoryId: "category-1",
      priority: "medium",
      masterKey: mkKey,
    });

    expect(fakeGetSnapshot).toHaveBeenCalledWith(mkKey);
    expect(fakeAppendEvent).toHaveBeenCalledOnce();
    expect(fakeAppendEvents).not.toHaveBeenCalled();
    expect(fakeAppendEvent.mock.calls[0]![0]).toMatchObject({
      id,
      type: "planned_expense_created",
      entityId: id,
      expectedLastEventId: "snapshot-event",
      payload: {
        label: "School supplies",
        estimatedAmount: { minorUnits: 12_500, currency: "XOF" },
        categoryId: "category-1",
        priority: "medium",
        dueDate: null,
        note: "",
      },
    });
    expect(fakeAppendEvent.mock.calls[0]![0].payload).not.toHaveProperty("accountId");
  });

  it("rejects invalid fields and an archived category before writing", async () => {
    fakeGetSnapshot.mockResolvedValue(snapshot({
      categories: [{ id: "category-1", isArchived: true }],
    }));

    const promise = createPlannedExpense({
      label: " ",
      estimatedAmount: { minorUnits: 0, currency: "xof" },
      categoryId: "category-1",
      priority: "urgent" as never,
      dueDate: Number.NaN,
      masterKey: mkKey,
    });

    const error: unknown = await promise.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ValidationError);
    if (!(error instanceof ValidationError)) throw error;
    expect(error.details.map((detail) => detail.field)).toEqual(expect.arrayContaining([
      "label",
      "estimatedAmount",
      "estimatedAmount.currency",
      "categoryId",
      "priority",
      "dueDate",
    ]));
    expect(fakeAppendEvent).not.toHaveBeenCalled();
  });
});

describe("updatePlannedExpense", () => {
  it("replaces every editable field on a pending expense", async () => {
    await updatePlannedExpense({
      plannedExpenseId: "planned-1",
      label: "New insurance",
      estimatedAmount: { minorUnits: 30_000, currency: "USD" },
      categoryId: "category-1",
      priority: "low",
      dueDate: null,
      note: "Compare providers",
      masterKey: mkKey,
    });

    expect(fakeAppendEvent).toHaveBeenCalledOnce();
    expect(fakeAppendEvent.mock.calls[0]![0]).toMatchObject({
      type: "planned_expense_updated",
      entityId: "planned-1",
      expectedLastEventId: "snapshot-event",
      payload: {
        plannedExpenseId: "planned-1",
        label: "New insurance",
        estimatedAmount: { minorUnits: 30_000, currency: "USD" },
        categoryId: "category-1",
        priority: "low",
        dueDate: null,
        note: "Compare providers",
      },
    });
  });

  it.each(["completed", "cancelled"] as const)(
    "keeps a %s expense immutable",
    async (status) => {
      fakeGetSnapshot.mockResolvedValue(snapshot({
        plannedExpenses: [{ ...pendingExpense, status }],
      }));

      await expect(updatePlannedExpense({
        plannedExpenseId: "planned-1",
        label: "Changed",
        estimatedAmount: { minorUnits: 30_000, currency: "XOF" },
        categoryId: "category-1",
        priority: "medium",
        dueDate: null,
        note: "",
        masterKey: mkKey,
      })).rejects.toThrow(/Only pending/);
      expect(fakeAppendEvent).not.toHaveBeenCalled();
    },
  );
});

describe("cancelPlannedExpense", () => {
  it("cancels a pending expense without creating a transaction", async () => {
    await cancelPlannedExpense({ plannedExpenseId: "planned-1", masterKey: mkKey });

    expect(fakeAppendEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: "planned_expense_cancelled",
      entityId: "planned-1",
      payload: { plannedExpenseId: "planned-1" },
      expectedLastEventId: "snapshot-event",
    }));
    expect(fakeAppendEvents).not.toHaveBeenCalled();
  });

  it("rejects a second cancellation", async () => {
    fakeGetSnapshot.mockResolvedValue(snapshot({
      plannedExpenses: [{ ...pendingExpense, status: "cancelled" }],
    }));

    await expect(cancelPlannedExpense({ plannedExpenseId: "planned-1", masterKey: mkKey }))
      .rejects.toThrow(/Only pending/);
    expect(fakeAppendEvent).not.toHaveBeenCalled();
  });
});

describe("archiveCategory with planned expenses", () => {
  it("blocks a category used by a pending planned expense", async () => {
    await expect(archiveCategory({ categoryId: "category-1", masterKey: mkKey }))
      .rejects.toThrow(/pending planned expense/);
    expect(fakeAppendEvent).not.toHaveBeenCalled();
  });

  it.each(["completed", "cancelled"] as const)(
    "does not block a category used only by a %s planned expense",
    async (status) => {
      fakeGetSnapshot.mockResolvedValue(snapshot({
        plannedExpenses: [{ ...pendingExpense, status }],
      }));

      await archiveCategory({ categoryId: "category-1", masterKey: mkKey });
      expect(fakeAppendEvent).toHaveBeenCalledWith(expect.objectContaining({
        type: "category_archived",
      }));
    },
  );
});

describe("completePlannedExpense", () => {
  const params = {
    plannedExpenseId: "planned-1",
    accountId: "account-1",
    actualAmount: { minorUnits: 24_000, currency: "XOF" },
    occurredAt: 1_750_000_000_000,
    masterKey: mkKey,
  };

  it("atomically appends the expense transaction and completion with one concurrency guard", async () => {
    const transactionId = await completePlannedExpense(params);

    expect(fakeGetSnapshot).toHaveBeenCalledOnce();
    expect(fakeAppendEvent).not.toHaveBeenCalled();
    expect(fakeAppendEvents).toHaveBeenCalledOnce();
    const events = fakeAppendEvents.mock.calls[0]![0];
    expect(events).toHaveLength(2);
    const transactionEvent = events[0];
    const completionEvent = events[1];
    if (transactionEvent == null || completionEvent == null) {
      throw new Error("Expected transaction and completion events");
    }
    expect(transactionEvent).toMatchObject({
      id: transactionId,
      type: "transaction_created",
      entityId: "account-1",
      expectedLastEventId: "snapshot-event",
      payload: {
        accountId: "account-1",
        categoryId: "category-1",
        amount: { minorUnits: 24_000, currency: "XOF" },
        direction: "expense",
        note: "Annual insurance",
        tags: ["planned-expense"],
        merchant: null,
        occurredAt: 1_750_000_000_000,
      },
    });
    expect(completionEvent).toMatchObject({
      type: "planned_expense_completed",
      entityId: "planned-1",
      expectedLastEventId: "snapshot-event",
      payload: {
        plannedExpenseId: "planned-1",
        transactionId,
        accountId: "account-1",
        actualAmount: { minorUnits: 24_000, currency: "XOF" },
        occurredAt: 1_750_000_000_000,
      },
    });
    expect(transactionEvent.timestamp).toBe(completionEvent.timestamp);
    expect(transactionEvent.timestamp).not.toBe(params.occurredAt);
  });

  it("does not write either event when any linked entity or amount is invalid", async () => {
    fakeGetSnapshot.mockResolvedValue(snapshot({
      accounts: [{
        id: "account-1",
        currency: "USD",
        isActive: false,
        balance: { minorUnits: 0, currency: "USD" },
      }],
      categories: [{ id: "category-1", isArchived: true }],
    }));

    const promise = completePlannedExpense({
      ...params,
      actualAmount: { minorUnits: 0, currency: "xof" },
      occurredAt: Number.POSITIVE_INFINITY,
    });

    const error: unknown = await promise.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ValidationError);
    if (!(error instanceof ValidationError)) throw error;
    expect(error.details.map((detail) => detail.field)).toEqual(expect.arrayContaining([
      "accountId",
      "categoryId",
      "actualAmount",
      "actualAmount.currency",
      "occurredAt",
    ]));
    expect(fakeAppendEvent).not.toHaveBeenCalled();
    expect(fakeAppendEvents).not.toHaveBeenCalled();
  });

  it("rejects a second validation without creating another transaction", async () => {
    fakeGetSnapshot
      .mockResolvedValueOnce(snapshot())
      .mockResolvedValueOnce(snapshot({
        plannedExpenses: [{
          ...pendingExpense,
          status: "completed",
          transactionId: "first-transaction",
        }],
      }));

    await completePlannedExpense(params);
    await expect(completePlannedExpense(params)).rejects.toThrow(/Only pending/);
    expect(fakeAppendEvents).toHaveBeenCalledOnce();
  });

  it("propagates an atomic append failure and never falls back to separate writes", async () => {
    fakeAppendEvents.mockRejectedValueOnce(new Error("STALE_SNAPSHOT"));

    await expect(completePlannedExpense(params)).rejects.toThrow("STALE_SNAPSHOT");
    expect(fakeAppendEvents).toHaveBeenCalledOnce();
    expect(fakeAppendEvent).not.toHaveBeenCalled();
  });
});
