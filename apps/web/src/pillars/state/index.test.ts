import { describe, it, expect, vi, beforeEach } from "vitest";

const { fakeAppendEvent, fakeAccountsTable, fakeCategoriesTable, fakeGoalsTable, fakeRecurringItemsTable } = vi.hoisted(() => {
  const fakeAppendEvent = vi.fn<(args: { type: string; payload: Record<string, unknown>; masterKey: unknown }) => Promise<void>>();
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
  return { fakeAppendEvent, fakeAccountsTable, fakeCategoriesTable, fakeGoalsTable, fakeRecurringItemsTable };
});

vi.mock("@/domain/eventStore.ts", () => ({
  appendEvent: fakeAppendEvent,
}));

vi.mock("@/db/schema.ts", () => ({
  db: {
    accounts: fakeAccountsTable,
    categories: fakeCategoriesTable,
    goals: fakeGoalsTable,
    recurringItems: fakeRecurringItemsTable,
  },
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
  realiseRecurringOccurrence,
  ValidationError,
} from "./index.ts";

const mkKey = { _brand: "MasterKey" as const, key: null as unknown as CryptoKey };

beforeEach(() => {
  fakeAppendEvent.mockReset();
  fakeAppendEvent.mockResolvedValue(undefined);
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
    fakeAccountsTable.seed({ id: "acct-1" });

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
    fakeAccountsTable.seed({ id: "acct-1" });

    await archiveAccount({ accountId: "acct-1", masterKey: mkKey });

    expect(fakeAppendEvent.mock.calls[0]![0].type).toBe("account_archived");
    expect(fakeAppendEvent.mock.calls[0]![0].payload).toMatchObject({ accountId: "acct-1" });
  });
});

describe("recordTransaction", () => {
  it("emits transaction_created event when account and category exist", async () => {
    fakeAccountsTable.seed({ id: "acct-1" });
    fakeCategoriesTable.seed({ id: "cat-1" });

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
    fakeCategoriesTable.seed({ id: "cat-1" });

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
    fakeAccountsTable.seed({ id: "acct-1" });

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
    fakeCategoriesTable.seed({ id: "cat-1" });

    await archiveCategory({ categoryId: "cat-1", masterKey: mkKey });

    expect(fakeAppendEvent.mock.calls[0]![0].type).toBe("category_archived");
    expect(fakeAppendEvent.mock.calls[0]![0].payload).toMatchObject({ categoryId: "cat-1" });
  });
});

describe("createBudget", () => {
  it("emits budget_created event when category exists", async () => {
    fakeCategoriesTable.seed({ id: "cat-1" });

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
    fakeGoalsTable.seed({ id: "goal-1" });

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
    fakeCategoriesTable.seed({ id: "cat-1" });

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

describe("realiseRecurringOccurrence", () => {
  it("emits recurring_item_realised and transaction_created events", async () => {
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
    expect(fakeAppendEvent).toHaveBeenCalledTimes(2);
    expect(fakeAppendEvent.mock.calls[0]![0].type).toBe("recurring_item_realised");
    expect(fakeAppendEvent.mock.calls[1]![0].type).toBe("transaction_created");
  });
});
