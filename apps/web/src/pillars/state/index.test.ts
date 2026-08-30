import { describe, it, expect, vi, beforeEach } from "vitest";

const { fakeAppendEvent, fakeAppendEvents, fakeGetSnapshot, fakeReadTransactions, fakeLoadCurrencyContext, fakeConvertUsingContext, fakeAccountsTable, fakeCategoriesTable, fakeGoalsTable, fakeRecurringItemsTable } = vi.hoisted(() => {
  const fakeAppendEvent = vi.fn<(args: { type: string; payload: Record<string, unknown>; masterKey: unknown }) => Promise<void>>();
  const fakeAppendEvents = vi.fn<(args: Array<{ type: string; payload: Record<string, unknown>; masterKey: unknown }>) => Promise<void>>();
  const fakeGetSnapshot = vi.fn<() => Promise<Record<string, unknown>>>();
  const fakeReadTransactions = vi.fn<() => Promise<Array<Record<string, unknown>>>>();
  const fakeLoadCurrencyContext = vi.fn();
  const fakeConvertUsingContext = vi.fn();
  class FakeTable<T extends { id: string }> {
    private store = new Map<string, T>();
    get(id: string): Promise<T | undefined> { return Promise.resolve(this.store.get(id)); }
    seed(r: T): void { this.store.set(r.id, r); }
    clear(): void { this.store.clear(); }
  }
  const fakeAccountsTable = new FakeTable();
  const fakeCategoriesTable = new FakeTable();
  const fakeGoalsTable = new FakeTable();
  const fakeRecurringItemsTable = new FakeTable();
  return { fakeAppendEvent, fakeAppendEvents, fakeGetSnapshot, fakeReadTransactions, fakeLoadCurrencyContext, fakeConvertUsingContext, fakeAccountsTable, fakeCategoriesTable, fakeGoalsTable, fakeRecurringItemsTable };
});

vi.mock("@/domain/eventStore.ts", () => ({
  appendEvent: fakeAppendEvent,
  appendEvents: fakeAppendEvents,
}));

vi.mock("@/db/schema.ts", () => ({
  db: {
    accounts: fakeAccountsTable,
    categories: fakeCategoriesTable,
    goals: fakeGoalsTable,
    recurringItems: fakeRecurringItemsTable,
  },
}));

vi.mock("@/domain/financialState.ts", () => ({
  getSnapshot: fakeGetSnapshot,
  readTransactionsInRange: fakeReadTransactions,
}));

vi.mock("@/domain/currencyStore.ts", () => ({
  loadCurrencyContext: fakeLoadCurrencyContext,
  convertUsingContext: fakeConvertUsingContext,
}));

import {
  createAccount,
  updateAccount,
  archiveAccount,
  recordTransaction,
  createCategory,
  archiveCategory,
  createBudget,
  createGoal,
  recordGoalContribution,
  createRecurringItem,
  archiveRecurringItem,
  createDebtCredit,
  updateDebtCreditStatus,
  updateDebtCreditDueDate,
  updateTransaction,
  deleteTransaction,
  realiseRecurringOccurrence,
  recordTransfer,
  ValidationError,
} from "./index.ts";

const mkKey = { _brand: "MasterKey" as const, key: null as unknown as CryptoKey };

function snapshot(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const accounts = (overrides.accounts as Array<Record<string, unknown>> | undefined) ?? [];
  const goals = (overrides.goals as Array<Record<string, unknown>> | undefined) ?? [];
  return {
    asOfEventId: "snapshot-event",
    baseCurrency: "XOF",
    categories: [],
    budgets: [],
    recurringItems: [],
    plannedExpenses: [],
    debtCredits: [],
    ...overrides,
    accounts: accounts.map((account) => ({
      balance: { minorUnits: 0, currency: account.currency ?? "XOF" },
      ...account,
    })),
    goals: goals.map((goal) => ({
      accumulated: {
        minorUnits: 0,
        currency: (goal.targetAmount as { currency?: string } | undefined)?.currency ?? "XOF",
      },
      ...goal,
    })),
  };
}

beforeEach(() => {
  fakeAppendEvent.mockReset();
  fakeAppendEvents.mockReset();
  fakeGetSnapshot.mockReset();
  fakeAppendEvent.mockResolvedValue(undefined);
  fakeAppendEvents.mockResolvedValue(undefined);
  fakeGetSnapshot.mockResolvedValue(snapshot());
  fakeReadTransactions.mockReset();
  fakeReadTransactions.mockResolvedValue([]);
  fakeLoadCurrencyContext.mockReset();
  fakeLoadCurrencyContext.mockResolvedValue({ baseCurrency: "XOF", rates: new Map() });
  fakeConvertUsingContext.mockReset();
  fakeAccountsTable.clear();
  fakeCategoriesTable.clear();
  fakeGoalsTable.clear();
  fakeRecurringItemsTable.clear();
});

describe("createAccount", () => {
  it("emits account_created event with valid params", async () => {
    const id = await createAccount({
      name: "Checking",
      type: "checking",
      initialBalance: { minorUnits: 0, currency: "USD" },
      masterKey: mkKey,
    });

    expect(id).toBeDefined();
    expect(typeof id).toBe("string");
    expect(fakeAppendEvent).toHaveBeenCalledOnce();
    expect(fakeAppendEvent.mock.calls[0]![0].type).toBe("account_created");
    expect(fakeAppendEvent.mock.calls[0]![0].payload).toMatchObject({
      name: "Checking",
      type: "checking",
    });
  });

  it("throws ValidationError on missing name", async () => {
    await expect(
      createAccount({ name: "", type: "checking", initialBalance: { minorUnits: 0, currency: "USD" }, masterKey: mkKey })
    ).rejects.toThrow(ValidationError);
  });
});

describe("updateAccount", () => {
  it("emits account_updated event when account exists", async () => {
    fakeGetSnapshot.mockResolvedValue(snapshot({
      accounts: [{ id: "acct-1", currency: "USD", isActive: true, balance: { minorUnits: 0, currency: "USD" } }],
    }));

    await updateAccount({
      accountId: "acct-1",
      name: "Orange Money",
      type: "mobile_money",
      masterKey: mkKey,
    });

    expect(fakeAppendEvent.mock.calls[0]![0].type).toBe("account_updated");
    expect(fakeAppendEvent.mock.calls[0]![0].payload).toMatchObject({
      accountId: "acct-1",
      name: "Orange Money",
      type: "mobile_money",
    });
  });
});

describe("archiveAccount", () => {
  it("emits account_archived event when account exists", async () => {
    fakeGetSnapshot.mockResolvedValue(snapshot({
      accounts: [{ id: "acct-1", currency: "USD", isActive: true, balance: { minorUnits: 0, currency: "USD" } }],
    }));

    await archiveAccount({ accountId: "acct-1", masterKey: mkKey });

    expect(fakeAppendEvent.mock.calls[0]![0].type).toBe("account_archived");
    expect(fakeAppendEvent.mock.calls[0]![0].payload).toMatchObject({ accountId: "acct-1" });
  });

  it("rejects archiving an account while it still has a balance", async () => {
    fakeGetSnapshot.mockResolvedValue(snapshot({
      accounts: [{ id: "acct-1", currency: "USD", isActive: true, balance: { minorUnits: 100, currency: "USD" } }],
    }));

    await expect(archiveAccount({ accountId: "acct-1", masterKey: mkKey }))
      .rejects.toThrow(/balance must be zero/);
    expect(fakeAppendEvent).not.toHaveBeenCalled();
  });
});

describe("recordTransaction", () => {
  it("emits transaction_created event when account and category exist", async () => {
    fakeGetSnapshot.mockResolvedValue(snapshot({
      accounts: [{ id: "acct-1", currency: "USD", isActive: true }],
      categories: [{ id: "cat-1" }],
    }));

    const id = await recordTransaction({
      accountId: "acct-1",
      categoryId: "cat-1",
      amount: { minorUnits: 2500, currency: "USD" },
      direction: "expense",
      masterKey: mkKey,
    });

    expect(id).toBeDefined();
    expect(fakeAppendEvent.mock.calls[0]![0].type).toBe("transaction_created");
  });

  it("throws ValidationError when account does not exist (INV-EVT-03)", async () => {
    fakeGetSnapshot.mockResolvedValue(snapshot({
      categories: [{ id: "cat-1" }],
    }));

    await expect(
      recordTransaction({
        accountId: "nonexistent",
        categoryId: "cat-1",
        amount: { minorUnits: 100, currency: "USD" },
        direction: "expense",
        masterKey: mkKey,
      })
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError when category does not exist (INV-EVT-03)", async () => {
    fakeGetSnapshot.mockResolvedValue(snapshot({
      accounts: [{ id: "acct-1", currency: "USD", isActive: true }],
    }));

    await expect(
      recordTransaction({
        accountId: "acct-1",
        categoryId: "nonexistent",
        amount: { minorUnits: 100, currency: "USD" },
        direction: "expense",
        masterKey: mkKey,
      })
    ).rejects.toThrow(ValidationError);
  });

  it("rejects a transaction that would overflow the account balance", async () => {
    fakeGetSnapshot.mockResolvedValue(snapshot({
      accounts: [{
        id: "acct-1", currency: "USD", isActive: true,
        balance: { minorUnits: Number.MAX_SAFE_INTEGER, currency: "USD" },
      }],
      categories: [{ id: "cat-1" }],
    }));

    await expect(recordTransaction({
      accountId: "acct-1",
      categoryId: "cat-1",
      amount: { minorUnits: 1, currency: "USD" },
      direction: "income",
      masterKey: mkKey,
    })).rejects.toThrow(/safe integer range/);
    expect(fakeAppendEvent).not.toHaveBeenCalled();
  });
});

describe("transaction mutations", () => {
  const activeTransaction = {
    id: "tx-1",
    timestamp: 1,
    accountId: "acct-1",
    categoryId: "cat-1",
    amount: { minorUnits: 100, currency: "USD" },
    displayAmount: { minorUnits: 100, currency: "USD" },
    direction: "expense",
  };

  it("rejects an update for a transaction that does not exist", async () => {
    fakeGetSnapshot.mockResolvedValue(snapshot({
      accounts: [{ id: "acct-1", currency: "USD", isActive: true }],
      categories: [{ id: "cat-1" }],
    }));

    await expect(updateTransaction({
      originalEventId: "missing",
      accountId: "acct-1",
      categoryId: "cat-1",
      amount: { minorUnits: 100, currency: "USD" },
      direction: "expense",
      masterKey: mkKey,
    })).rejects.toThrow(ValidationError);
    expect(fakeAppendEvent).not.toHaveBeenCalled();
  });

  it("rejects deleting a transaction twice", async () => {
    fakeGetSnapshot.mockResolvedValue(snapshot({
      accounts: [{ id: "acct-1", currency: "USD", isActive: true }],
    }));
    fakeReadTransactions.mockResolvedValueOnce([activeTransaction]).mockResolvedValueOnce([]);

    await deleteTransaction({ originalEventId: "tx-1", masterKey: mkKey });
    await expect(deleteTransaction({ originalEventId: "tx-1", masterKey: mkKey }))
      .rejects.toThrow(ValidationError);
    expect(fakeAppendEvent).toHaveBeenCalledOnce();
  });

  it("rejects editing or deleting a transaction on an archived account", async () => {
    fakeGetSnapshot.mockResolvedValue(snapshot({
      accounts: [{ id: "acct-1", currency: "USD", isActive: false }],
      categories: [{ id: "cat-1" }],
    }));
    fakeReadTransactions.mockResolvedValue([activeTransaction]);

    await expect(updateTransaction({
      originalEventId: "tx-1",
      accountId: "acct-1",
      categoryId: "cat-1",
      amount: { minorUnits: 100, currency: "USD" },
      direction: "expense",
      masterKey: mkKey,
    })).rejects.toThrow(/archived accounts cannot be edited/);
    await expect(deleteTransaction({ originalEventId: "tx-1", masterKey: mkKey }))
      .rejects.toThrow(/archived accounts cannot be deleted/);
    expect(fakeAppendEvent).not.toHaveBeenCalled();
  });
});

describe("createCategory", () => {
  it("emits category_created event", async () => {
    const id = await createCategory({
      name: "Groceries",
      masterKey: mkKey,
    });

    expect(id).toBeDefined();
    expect(fakeAppendEvent.mock.calls[0]![0].type).toBe("category_created");
    expect(fakeAppendEvent.mock.calls[0]![0].payload).toMatchObject({
      name: "Groceries",
    });
  });
});

describe("archiveCategory", () => {
  it("emits category_archived event when category exists", async () => {
    fakeGetSnapshot.mockResolvedValue(snapshot({
      categories: [{ id: "cat-1" }],
    }));

    await archiveCategory({ categoryId: "cat-1", masterKey: mkKey });

    expect(fakeAppendEvent.mock.calls[0]![0].type).toBe("category_archived");
    expect(fakeAppendEvent.mock.calls[0]![0].payload).toMatchObject({ categoryId: "cat-1" });
  });

  it("rejects categories referenced by active budgets or recurring items", async () => {
    fakeGetSnapshot.mockResolvedValue(snapshot({
      categories: [{ id: "cat-1" }],
      budgets: [{ id: "budget-1", categoryId: "cat-1", isArchived: false }],
    }));
    await expect(archiveCategory({ categoryId: "cat-1", masterKey: mkKey }))
      .rejects.toThrow(/active budgets/);

    fakeGetSnapshot.mockResolvedValue(snapshot({
      categories: [{ id: "cat-1" }],
      recurringItems: [{ id: "recurring-1", categoryId: "cat-1", isArchived: false }],
    }));
    await expect(archiveCategory({ categoryId: "cat-1", masterKey: mkKey }))
      .rejects.toThrow(/recurring item/);
    expect(fakeAppendEvent).not.toHaveBeenCalled();
  });

  it("allows a category whose recurring items are archived", async () => {
    fakeGetSnapshot.mockResolvedValue(snapshot({
      categories: [{ id: "cat-1" }],
      recurringItems: [{ id: "recurring-1", categoryId: "cat-1", isArchived: true }],
    }));

    await archiveCategory({ categoryId: "cat-1", masterKey: mkKey });

    expect(fakeAppendEvent.mock.calls[0]![0].type).toBe("category_archived");
  });

  it("rejects categories with active children", async () => {
    fakeGetSnapshot.mockResolvedValue(snapshot({
      categories: [
        { id: "parent" },
        { id: "child", parentId: "parent", isArchived: false },
      ],
    }));

    await expect(archiveCategory({ categoryId: "parent", masterKey: mkKey }))
      .rejects.toThrow(/child categories/);
    expect(fakeAppendEvent).not.toHaveBeenCalled();
  });
});

describe("createBudget", () => {
  it("emits budget_created event when category exists", async () => {
    fakeGetSnapshot.mockResolvedValue(snapshot({
      categories: [{ id: "cat-1" }],
    }));

    const id = await createBudget({
      name: "Groceries",
      categoryId: "cat-1",
      limit: { minorUnits: 50000, currency: "USD" },
      periodMonth: "2026-06",
      masterKey: mkKey,
    });

    expect(id).toBeDefined();
    expect(fakeAppendEvent.mock.calls[0]![0].type).toBe("budget_created");
  });

  it("throws ValidationError when category does not exist (INV-EVT-03)", async () => {
    await expect(
      createBudget({
        name: "Groceries",
        categoryId: "nonexistent",
        limit: { minorUnits: 50000, currency: "USD" },
        periodMonth: "2026-06",
        masterKey: mkKey,
      })
    ).rejects.toThrow(ValidationError);
  });
});

describe("createGoal", () => {
  it("emits goal_created event", async () => {
    const id = await createGoal({
      name: "Emergency Fund",
      targetAmount: { minorUnits: 1000000, currency: "USD" },
      masterKey: mkKey,
    });

    expect(id).toBeDefined();
    expect(fakeAppendEvent.mock.calls[0]![0].type).toBe("goal_created");
  });
});

describe("recordGoalContribution", () => {
  it("emits goal_contribution event when goal exists", async () => {
    fakeGetSnapshot.mockResolvedValue(snapshot({
      goals: [{
        id: "goal-1",
        targetAmount: { minorUnits: 1000000, currency: "USD" },
        isArchived: false,
      }],
    }));

    const id = await recordGoalContribution({
      goalId: "goal-1",
      amount: { minorUnits: 10000, currency: "USD" },
      masterKey: mkKey,
    });

    expect(id).toBeDefined();
    expect(fakeAppendEvent.mock.calls[0]![0].type).toBe("goal_contribution");
  });

  it("throws ValidationError when goal does not exist", async () => {
    await expect(
      recordGoalContribution({
        goalId: "nonexistent",
        amount: { minorUnits: 10000, currency: "USD" },
        masterKey: mkKey,
      })
    ).rejects.toThrow(ValidationError);
  });
});

describe("createRecurringItem", () => {
  it("emits recurring_item_created event", async () => {
    fakeGetSnapshot.mockResolvedValue(snapshot({
      categories: [{ id: "cat-1" }],
    }));

    const id = await createRecurringItem({
      categoryId: "cat-1",
      label: "Netflix",
      amount: { minorUnits: 1599, currency: "USD" },
      direction: "expense",
      frequency: "monthly",
      startDate: Date.now(),
      masterKey: mkKey,
    });

    expect(id).toBeDefined();
    expect(fakeAppendEvent.mock.calls[0]![0].type).toBe("recurring_item_created");
  });
});

describe("archiveRecurringItem", () => {
  it("archives an active recurring item", async () => {
    fakeGetSnapshot.mockResolvedValue(snapshot({
      recurringItems: [{ id: "recur-1", isArchived: false }],
    }));

    await archiveRecurringItem({ itemId: "recur-1", masterKey: mkKey });

    expect(fakeAppendEvent.mock.calls[0]![0]).toMatchObject({
      type: "recurring_item_archived",
      payload: { itemId: "recur-1" },
    });
  });

  it("rejects missing or already archived recurring items", async () => {
    fakeGetSnapshot.mockResolvedValue(snapshot({
      recurringItems: [{ id: "recur-1", isArchived: true }],
    }));

    await expect(archiveRecurringItem({ itemId: "recur-1", masterKey: mkKey }))
      .rejects.toThrow(/not found/);
  });
});

describe("createDebtCredit", () => {
  it("emits debt_credit_created event with motive", async () => {
    const id = await createDebtCredit({
      kind: "receivable",
      partyName: "Awa",
      motive: "Avance transport",
      amount: { minorUnits: 15000, currency: "USD" },
      date: 1_720_000_000_000,
      status: "pending",
      dueDate: 1_725_000_000_000,
      masterKey: mkKey,
    });

    expect(id).toBeDefined();
    expect(fakeAppendEvent.mock.calls[0]![0].type).toBe("debt_credit_created");
    expect(fakeAppendEvent.mock.calls[0]![0].payload).toMatchObject({
      kind: "receivable",
      partyName: "Awa",
      motive: "Avance transport",
      status: "pending",
      dueDate: 1_725_000_000_000,
    });
  });

  it("throws ValidationError without motive", async () => {
    await expect(
      createDebtCredit({
        kind: "debt",
        partyName: "Koffi",
        motive: "",
        amount: { minorUnits: 20000, currency: "USD" },
        date: 1_720_000_000_000,
        status: "pending",
        masterKey: mkKey,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("normalizes an omitted due date to null and rejects invalid dates", async () => {
    await createDebtCredit({
      kind: "debt", partyName: "Koffi", motive: "Loan",
      amount: { minorUnits: 20_000, currency: "USD" }, date: 1_720_000_000_000,
      status: "pending", masterKey: mkKey,
    });
    expect(fakeAppendEvent.mock.calls[0]![0].payload).toMatchObject({ dueDate: null });

    await expect(createDebtCredit({
      kind: "debt", partyName: "Koffi", motive: "Loan",
      amount: { minorUnits: 20_000, currency: "USD" }, date: 1_720_000_000_000,
      status: "pending", dueDate: -1, masterKey: mkKey,
    })).rejects.toThrow(ValidationError);
  });
});

describe("recordTransfer", () => {
  it("records an internal transfer between active same-currency accounts", async () => {
    fakeGetSnapshot.mockResolvedValue(snapshot({
      accounts: [
        { id: "cash", currency: "XOF", isActive: true },
        { id: "savings", currency: "XOF", isActive: true },
      ],
    }));

    await recordTransfer({
      fromAccountId: "cash",
      toAccountId: "savings",
      amount: { minorUnits: 10_000, currency: "XOF" },
      note: "Emergency fund",
      masterKey: mkKey,
    });

    expect(fakeAppendEvent.mock.calls[0]![0]).toMatchObject({
      type: "transfer_created",
      entityId: "cash",
      payload: {
        fromAccountId: "cash",
        toAccountId: "savings",
        amount: { minorUnits: 10_000, currency: "XOF" },
        note: "Emergency fund",
      },
    });
  });

  it("rejects self-transfers", async () => {
    fakeGetSnapshot.mockResolvedValue(snapshot({
      accounts: [
        { id: "cash", currency: "XOF", isActive: true },
        { id: "usd", currency: "USD", isActive: true },
      ],
    }));

    await expect(recordTransfer({
      fromAccountId: "cash",
      toAccountId: "cash",
      amount: { minorUnits: 10_000, currency: "XOF" },
      masterKey: mkKey,
    })).rejects.toThrow(ValidationError);
    expect(fakeAppendEvent).not.toHaveBeenCalled();
  });

  it("persists the converted destination amount for a cross-currency transfer", async () => {
    fakeGetSnapshot.mockResolvedValue(snapshot({
      accounts: [
        { id: "cash", currency: "XOF", isActive: true, balance: { minorUnits: 100_000, currency: "XOF" } },
        { id: "usd", currency: "USD", isActive: true, balance: { minorUnits: 500, currency: "USD" } },
      ],
    }));
    fakeConvertUsingContext.mockReturnValue({ minorUnits: 1_650, currency: "USD" });

    await recordTransfer({
      fromAccountId: "cash",
      toAccountId: "usd",
      amount: { minorUnits: 10_000, currency: "XOF" },
      masterKey: mkKey,
    });

    expect(fakeLoadCurrencyContext).toHaveBeenCalledWith(mkKey, "XOF");
    expect(fakeAppendEvent.mock.calls[0]![0].payload).toMatchObject({
      fromAccountId: "cash",
      toAccountId: "usd",
      externalDestination: null,
      amount: { minorUnits: 10_000, currency: "XOF" },
      destinationAmount: { minorUnits: 1_650, currency: "USD" },
    });
  });

  it("does not append a cross-currency transfer when no rate is available", async () => {
    fakeGetSnapshot.mockResolvedValue(snapshot({
      accounts: [
        { id: "cash", currency: "XOF", isActive: true },
        { id: "usd", currency: "USD", isActive: true },
      ],
    }));
    fakeConvertUsingContext.mockReturnValue(null);

    await expect(recordTransfer({
      fromAccountId: "cash",
      toAccountId: "usd",
      amount: { minorUnits: 10_000, currency: "XOF" },
      masterKey: mkKey,
    })).rejects.toThrow(/exchange rate/i);
    expect(fakeAppendEvent).not.toHaveBeenCalled();
  });
});

describe("updateDebtCreditStatus", () => {
  it("emits debt_credit_status_updated event when record exists", async () => {
    fakeGetSnapshot.mockResolvedValue(snapshot({
      debtCredits: [{ id: "dc-1", status: "pending" }],
    }));

    await updateDebtCreditStatus({
      debtCreditId: "dc-1",
      status: "settled",
      masterKey: mkKey,
    });

    expect(fakeAppendEvent.mock.calls[0]![0].type).toBe("debt_credit_status_updated");
    expect(fakeAppendEvent.mock.calls[0]![0].payload).toMatchObject({
      debtCreditId: "dc-1",
      status: "settled",
    });
  });
});

describe("updateDebtCreditDueDate", () => {
  it("emits an optimistic-concurrency-safe due-date update", async () => {
    fakeGetSnapshot.mockResolvedValue(snapshot({
      debtCredits: [{ id: "dc-1", status: "pending", dueDate: null }],
    }));

    await updateDebtCreditDueDate({
      debtCreditId: "dc-1",
      dueDate: 1_800_000_000_000,
      masterKey: mkKey,
    });

    expect(fakeAppendEvent.mock.calls[0]![0]).toMatchObject({
      type: "debt_credit_due_date_updated",
      entityId: "dc-1",
      payload: { debtCreditId: "dc-1", dueDate: 1_800_000_000_000 },
      expectedLastEventId: "snapshot-event",
    });
  });

  it("allows clearing an existing due date", async () => {
    fakeGetSnapshot.mockResolvedValue(snapshot({
      debtCredits: [{ id: "dc-1", status: "pending", dueDate: 1_800_000_000_000 }],
    }));

    await updateDebtCreditDueDate({ debtCreditId: "dc-1", dueDate: null, masterKey: mkKey });
    expect(fakeAppendEvent.mock.calls[0]![0].payload).toEqual({ debtCreditId: "dc-1", dueDate: null });
  });

  it("rejects missing items and invalid due dates without writing", async () => {
    fakeGetSnapshot.mockResolvedValue(snapshot());

    await expect(updateDebtCreditDueDate({ debtCreditId: "missing", dueDate: 1, masterKey: mkKey }))
      .rejects.toThrow(ValidationError);
    await expect(updateDebtCreditDueDate({ debtCreditId: "missing", dueDate: -1, masterKey: mkKey }))
      .rejects.toThrow(ValidationError);
    expect(fakeAppendEvent).not.toHaveBeenCalled();
  });
});

describe("realiseRecurringOccurrence", () => {
  it("emits recurring_item_realised and transaction_created events", async () => {
    fakeGetSnapshot.mockResolvedValue(snapshot({
      accounts: [{ id: "acct-1", currency: "USD", isActive: true }],
      categories: [{ id: "cat-1" }],
      recurringItems: [{
        id: "recur-1",
        categoryId: "cat-1",
        amount: { minorUnits: 1599, currency: "USD" },
        direction: "expense",
      }],
    }));

    const txId = await realiseRecurringOccurrence({
      itemId: "recur-1",
      accountId: "acct-1",
      categoryId: "cat-1",
      amount: { minorUnits: 1599, currency: "USD" },
      direction: "expense",
      label: "Netflix",
      masterKey: mkKey,
    });

    expect(txId).toBeDefined();
    expect(fakeAppendEvents).toHaveBeenCalledOnce();
    expect(fakeAppendEvents.mock.calls[0]![0]).toMatchObject([
      { type: "recurring_item_realised" },
      { type: "transaction_created" },
    ]);
  });

  it("rejects a realised amount that differs from the recurring item", async () => {
    fakeGetSnapshot.mockResolvedValue(snapshot({
      accounts: [{ id: "acct-1", currency: "USD", isActive: true }],
      categories: [{ id: "cat-1" }],
      recurringItems: [{
        id: "recur-1",
        categoryId: "cat-1",
        amount: { minorUnits: 1599, currency: "USD" },
        direction: "expense",
      }],
    }));

    await expect(realiseRecurringOccurrence({
      itemId: "recur-1",
      accountId: "acct-1",
      categoryId: "cat-1",
      amount: { minorUnits: 999, currency: "USD" },
      direction: "expense",
      masterKey: mkKey,
    })).rejects.toThrow(ValidationError);
    expect(fakeAppendEvents).not.toHaveBeenCalled();
  });

  it("rejects a second realisation on the same local day", async () => {
    const today = new Date(2026, 6, 26, 9).getTime();
    fakeGetSnapshot.mockResolvedValue(snapshot({
      accounts: [{ id: "acct-1", currency: "USD", isActive: true }],
      categories: [{ id: "cat-1" }],
      recurringItems: [{
        id: "recur-1",
        categoryId: "cat-1",
        amount: { minorUnits: 1599, currency: "USD" },
        direction: "expense",
        lastRealised: today,
        isArchived: false,
      }],
    }));

    await expect(realiseRecurringOccurrence({
      itemId: "recur-1",
      accountId: "acct-1",
      categoryId: "cat-1",
      amount: { minorUnits: 1599, currency: "USD" },
      direction: "expense",
      date: today + 1000,
      masterKey: mkKey,
    })).rejects.toThrow(/already realised today/);
    expect(fakeAppendEvents).not.toHaveBeenCalled();
  });
});
