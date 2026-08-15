import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FinancialEventRecord, FxRateRecord } from "@/db/schema.ts";
import type { EncryptedEnvelope } from "@/crypto/envelope.ts";
import type { FinancialEventPayload, FinancialEventType } from "./eventStore.ts";
import type { CurrencyContext } from "./currencyStore.ts";

const { fakeEvents, fakeSnapshotStore, fakeFxRates, fakeAppSettings, fakeOpen, fakeSeal } = vi.hoisted(() => {
  class FakeEventsTable {
    private store = new Map<string, FinancialEventRecord>();
    add(r: FinancialEventRecord): Promise<string> { this.store.set(r.id, r); return Promise.resolve(r.id); }
    clear(): void { this.store.clear(); }
    get(id: string): Promise<FinancialEventRecord | undefined> { return Promise.resolve(this.store.get(id)); }
    orderBy(_field: string): { toArray: () => Promise<FinancialEventRecord[]>; last: () => Promise<FinancialEventRecord | undefined> } {
      const items = [...this.store.values()].sort((a, b) => a.timestamp - b.timestamp);
      return {
        toArray: () => Promise.resolve(items),
        last: () => Promise.resolve(items[items.length - 1]),
      };
    }
    where(field: string): {
      equals: (value: number) => { toArray: () => Promise<FinancialEventRecord[]> };
      between: (lower: [string, number], upper: [string, number]) => { toArray: () => Promise<FinancialEventRecord[]> };
    } {
      return {
        equals: (value) => ({
          toArray: () => Promise.resolve(
            [...this.store.values()].filter((event) => event.timestamp === value)
          ),
        }),
        between: (lower, upper) => ({
          toArray: () => Promise.resolve(
            [...this.store.values()].filter((event) =>
              field === "[type+timestamp]" &&
              event.type === lower[0] &&
              event.type === upper[0] &&
              event.timestamp >= lower[1] &&
              event.timestamp <= upper[1]
            )
          ),
        }),
      };
    }
    seed(records: FinancialEventRecord[]): void { for (const r of records) this.store.set(r.id, r); }
  }
  class FakeSnapshotTable {
    private store = new Map<string, { ciphertext: Uint8Array; iv: Uint8Array; asOfEventId?: string; asOfTimestamp?: number }>();
    get(id: string): Promise<Record<string, unknown> | undefined> { return Promise.resolve(this.store.get(id) as unknown as Record<string, unknown> | undefined); }
    put(record: Record<string, unknown>): Promise<string> {
      this.store.set(record.id as string, record as unknown as { ciphertext: Uint8Array; iv: Uint8Array; asOfEventId?: string; asOfTimestamp?: number });
      return Promise.resolve(record.id as string);
    }
    clear(): void { this.store.clear(); }
    peek(id: string): { ciphertext: Uint8Array; iv: Uint8Array } | undefined { return this.store.get(id); }
  }
  class FakeFxRateTable {
    private records: FxRateRecord[] = [];
    toArray(): Promise<FxRateRecord[]> { return Promise.resolve([...this.records]); }
    clear(): void { this.records = []; }
    seed(records: FxRateRecord[]): void { this.records = [...records]; }
  }
  class FakeAppSettingsTable {
    private record: Record<string, unknown> | undefined;
    get(): Promise<Record<string, unknown> | undefined> { return Promise.resolve(this.record); }
    put(record: Record<string, unknown>): Promise<string> { this.record = record; return Promise.resolve(record.id as string); }
    clear(): void { this.record = undefined; }
  }
  return {
    fakeEvents: new FakeEventsTable(),
    fakeSnapshotStore: new FakeSnapshotTable(),
    fakeFxRates: new FakeFxRateTable(),
    fakeAppSettings: new FakeAppSettingsTable(),
    fakeOpen: vi.fn<(env: EncryptedEnvelope) => Promise<Uint8Array>>(),
    fakeSeal: vi.fn<() => Promise<{ ciphertext: Uint8Array; iv: Uint8Array }>>(),
  };
});

vi.mock("@/db/schema.ts", () => ({
  db: {
    financialEvents: fakeEvents,
    financialStateSnapshot: fakeSnapshotStore,
    fxRates: fakeFxRates,
    appSettings: fakeAppSettings,
  },
}));

vi.mock("@/crypto/envelope.ts", () => ({
  open: fakeOpen,
  seal: fakeSeal,
}));

import { replayFromInception, readTransactionsInRange, computeProjectedOccurrences, isSnapshotFresh, getSnapshot, persistSnapshot, validateDecryptedEventSequence } from "./financialState.ts";
import type { FinancialStateSnapshot } from "./financialState.ts";

const mkKey = { _brand: "MasterKey" as const, key: null as unknown as CryptoKey };

function makeEvent(overrides: {
  id: string; timestamp: number; type: FinancialEventType; entityId?: string;
  payload: FinancialEventPayload;
}): FinancialEventRecord {
  const enc = new TextEncoder().encode(JSON.stringify(overrides.payload));
  return {
    id: overrides.id,
    timestamp: overrides.timestamp,
    type: overrides.type,
    entityId: overrides.entityId ?? overrides.id,
    ciphertext: new Uint8Array(enc),
    iv: new Uint8Array(12),
  };
}

function openReturnsCiphertext(): void {
  fakeOpen.mockImplementation((env: EncryptedEnvelope) => Promise.resolve(env.ciphertext.slice()));
}

function emptySnapshot(asOfEventId = "none", asOfTimestamp = 0): FinancialStateSnapshot {
  const date = new Date(asOfTimestamp);
  const periodStart = new Date(date.getFullYear(), date.getMonth(), 1).getTime();
  const periodEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
  return {
    version: 4,
    asOfEventId, asOfTimestamp,
    baseCurrency: "USD", currencyContextId: "USD", missingFxCurrencies: [],
    accounts: [], categories: [], budgets: [], goals: [], recurringItems: [], debtCredits: [], transfers: [], plannedExpenses: [],
    periodStart, periodEnd,
    totalBalance: { minorUnits: 0, currency: "USD" },
    periodIncome: { minorUnits: 0, currency: "USD" },
    periodExpenses: { minorUnits: 0, currency: "USD" },
    netCashFlow: { minorUnits: 0, currency: "USD" },
    categoryTotals: {}, budgetProgress: {}, goalProgress: {}, projectedRecurring: [],
  };
}

beforeEach(() => {
  fakeEvents.clear();
  fakeSnapshotStore.clear();
  fakeFxRates.clear();
  fakeAppSettings.clear();
  fakeOpen.mockReset();
  fakeSeal.mockReset();
  fakeSeal.mockResolvedValue({ ciphertext: new Uint8Array([1, 2, 3]), iv: new Uint8Array([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]) });
  openReturnsCiphertext();
});

describe("replayFromInception", () => {
  it("returns empty snapshot when no events", async () => {
    const snapshot = await replayFromInception([], mkKey);
    expect(snapshot.asOfEventId).toBe("none");
    expect(snapshot.accounts).toEqual([]);
    expect(snapshot.totalBalance).toEqual({ minorUnits: 0, currency: "XOF" });
  });

  it("keeps legacy non-zero archived accounts active so their balance remains recoverable", async () => {
    const snapshot = await replayFromInception([
      makeEvent({
        id: "account", timestamp: 1000, type: "account_created",
        payload: { name: "Cash", type: "cash", initialBalance: { minorUnits: 5000, currency: "XOF" } },
      }),
      makeEvent({
        id: "legacy-archive", timestamp: 2000, type: "account_archived", entityId: "account",
        payload: { accountId: "account" },
      }),
    ], mkKey, 3000);

    expect(snapshot.accounts[0]?.isActive).toBe(true);
    expect(snapshot.totalBalance.minorUnits).toBe(5000);
  });

  it("keeps legacy archived categories active while active dependencies remain", async () => {
    const snapshot = await replayFromInception([
      makeEvent({ id: "category", timestamp: 1000, type: "category_created", payload: { name: "Housing" } }),
      makeEvent({
        id: "budget", timestamp: 2000, type: "budget_created", entityId: "category",
        payload: { name: "Rent", categoryId: "category", limit: { minorUnits: 1000, currency: "XOF" }, periodMonth: "2026-07" },
      }),
      makeEvent({
        id: "legacy-archive", timestamp: 3000, type: "category_archived", entityId: "category",
        payload: { categoryId: "category" },
      }),
    ], mkKey, new Date(2026, 6, 1).getTime());

    expect(snapshot.categories[0]?.isArchived).toBe(false);
    expect(snapshot.budgets[0]?.isArchived).toBe(false);
  });

  it("replays account_created event", async () => {
    const e1 = makeEvent({
      id: "acct-1", timestamp: 1000, type: "account_created",
      payload: { name: "Checking", type: "checking", initialBalance: { minorUnits: 10000, currency: "USD" } },
    });

    const snapshot = await replayFromInception([e1], mkKey);
    expect(snapshot.accounts).toHaveLength(1);
    expect(snapshot.accounts[0]!.name).toBe("Checking");
    expect(snapshot.accounts[0]!.balance).toEqual({ minorUnits: 10000, currency: "USD" });
    expect(snapshot.totalBalance).toEqual({ minorUnits: 10000, currency: "USD" });
  });

  it("rejects replay when aggregate money exceeds the safe integer range", async () => {
    await expect(replayFromInception([
      makeEvent({
        id: "account", timestamp: 1000, type: "account_created",
        payload: { name: "Cash", type: "cash", initialBalance: { minorUnits: Number.MAX_SAFE_INTEGER, currency: "USD" } },
      }),
      makeEvent({ id: "category", timestamp: 1100, type: "category_created", payload: { name: "Salary" } }),
      makeEvent({
        id: "income", timestamp: 1200, type: "transaction_created", entityId: "account",
        payload: { accountId: "account", categoryId: "category", amount: { minorUnits: 1, currency: "USD" }, direction: "income" },
      }),
    ], mkKey)).rejects.toThrow(/safe integer range/);
  });

  it("replays account update and archive events", async () => {
    const created = makeEvent({
      id: "acct-1", timestamp: 1000, type: "account_created",
      payload: { name: "Checking", type: "checking", initialBalance: { minorUnits: 0, currency: "USD" } },
    });
    const updated = makeEvent({
      id: "evt-2", timestamp: 2000, type: "account_updated", entityId: "acct-1",
      payload: { accountId: "acct-1", name: "Orange Money", type: "mobile_money" },
    });
    const archived = makeEvent({
      id: "evt-3", timestamp: 3000, type: "account_archived", entityId: "acct-1",
      payload: { accountId: "acct-1" },
    });

    const updatedSnapshot = await replayFromInception([created, updated], mkKey);
    expect(updatedSnapshot.accounts[0]!.name).toBe("Orange Money");
    expect(updatedSnapshot.accounts[0]!.type).toBe("mobile_money");

    const archivedSnapshot = await replayFromInception([created, updated, archived], mkKey);
    expect(archivedSnapshot.accounts[0]!.isActive).toBe(false);
    expect(archivedSnapshot.totalBalance.minorUnits).toBe(0);
  });

  it("uses canonical timestamp and id order regardless of input order", async () => {
    const created = makeEvent({
      id: "a", timestamp: 1000, type: "account_created",
      payload: { name: "Before", type: "checking", initialBalance: { minorUnits: 0, currency: "USD" } },
    });
    const updated = makeEvent({
      id: "b", timestamp: 1000, type: "account_updated", entityId: "a",
      payload: { accountId: "a", name: "After", type: "savings" },
    });

    const snapshot = await replayFromInception([updated, created], mkKey);
    expect(snapshot.accounts[0]?.name).toBe("After");
    expect(snapshot.asOfEventId).toBe("b");
  });

  it("computes the period for the requested as-of timestamp", async () => {
    const event = makeEvent({
      id: "a", timestamp: Date.UTC(2024, 0, 2), type: "account_created",
      payload: { name: "Checking", type: "checking", initialBalance: { minorUnits: 0, currency: "USD" } },
    });
    const requested = Date.UTC(2025, 5, 15);

    const snapshot = await replayFromInception([event], mkKey, requested);
    expect(new Date(snapshot.periodStart).getMonth()).toBe(5);
    expect(new Date(snapshot.periodStart).getFullYear()).toBe(2025);
  });

  it("replays transaction and updates balance", async () => {
    const e1 = makeEvent({
      id: "acct-1", timestamp: 1000, type: "account_created",
      payload: { name: "Checking", type: "checking", initialBalance: { minorUnits: 100000, currency: "USD" } },
    });
    const e2 = makeEvent({
      id: "e2", timestamp: 2000, type: "transaction_created", entityId: "acct-1",
      payload: { accountId: "acct-1", categoryId: "cat-1", amount: { minorUnits: 2500, currency: "USD" }, direction: "expense" },
    });
    const category = makeEvent({ id: "cat-1", timestamp: 1500, type: "category_created", payload: { name: "Food" } });

    const snapshot = await replayFromInception([e1, category, e2], mkKey);
    expect(snapshot.accounts[0]!.balance).toEqual({ minorUnits: 97500, currency: "USD" });
    expect(snapshot.totalBalance).toEqual({ minorUnits: 97500, currency: "USD" });
  });

  it("normalizes signed transaction amounts from older callers", async () => {
    const e1 = makeEvent({
      id: "acct-1", timestamp: 1000, type: "account_created",
      payload: { name: "Checking", type: "checking", initialBalance: { minorUnits: 100000, currency: "USD" } },
    });
    const e2 = makeEvent({
      id: "e2", timestamp: 2000, type: "transaction_created", entityId: "acct-1",
      payload: { accountId: "acct-1", categoryId: "cat-1", amount: { minorUnits: -2500, currency: "USD" }, direction: "expense" },
    });
    const category = makeEvent({ id: "cat-1", timestamp: 1500, type: "category_created", payload: { name: "Food" } });

    const snapshot = await replayFromInception([e1, category, e2], mkKey);
    expect(snapshot.accounts[0]!.balance).toEqual({ minorUnits: 97500, currency: "USD" });
    expect(snapshot.periodExpenses).toEqual({ minorUnits: 2500, currency: "USD" });
  });

  it("retains an archived category for historical labels", async () => {
    const created = makeEvent({
      id: "cat-1", timestamp: 1000, type: "category_created",
      payload: { name: "Groceries", parentId: null, isSystemDefault: false },
    });
    const archived = makeEvent({
      id: "evt-2", timestamp: 2000, type: "category_archived", entityId: "cat-1",
      payload: { categoryId: "cat-1" },
    });

    const snapshot = await replayFromInception([created, archived], mkKey);
    expect(snapshot.categories.find((category) => category.id === "cat-1")).toMatchObject({
      name: "Groceries",
      isArchived: true,
    });
  });

  it("computes period income for current-month transactions", async () => {
    const now = Date.now();
    const e1 = makeEvent({
      id: "acct-1", timestamp: now - 86400000, type: "account_created",
      payload: { name: "Checking", type: "checking", initialBalance: { minorUnits: 0, currency: "USD" } },
    });
    const e2 = makeEvent({
      id: "e2", timestamp: now, type: "transaction_created", entityId: "acct-1",
      payload: { accountId: "acct-1", categoryId: "cat-1", amount: { minorUnits: 50000, currency: "USD" }, direction: "income" },
    });
    const category = makeEvent({ id: "cat-1", timestamp: now - 1, type: "category_created", payload: { name: "Salary" } });

    const snapshot = await replayFromInception([e1, category, e2], mkKey);
    expect(snapshot.accounts[0]!.balance).toEqual({ minorUnits: 50000, currency: "USD" });
    expect(snapshot.periodIncome.minorUnits).toBeGreaterThanOrEqual(50000);
  });

  it("accumulates goal contributions (INV-EVT-04)", async () => {
    const e1 = makeEvent({
      id: "goal-1", timestamp: 1000, type: "goal_created",
      payload: { name: "Emergency Fund", targetAmount: { minorUnits: 1000000, currency: "USD" } },
    });
    const e2 = makeEvent({
      id: "c1", timestamp: 2000, type: "goal_contribution", entityId: "goal-1",
      payload: { goalId: "goal-1", amount: { minorUnits: 25000, currency: "USD" } },
    });
    const e3 = makeEvent({
      id: "c2", timestamp: 3000, type: "goal_contribution", entityId: "goal-1",
      payload: { goalId: "goal-1", amount: { minorUnits: 15000, currency: "USD" } },
    });

    const snapshot = await replayFromInception([e1, e2, e3], mkKey);
    expect(snapshot.goalProgress["goal-1"]).toBeDefined();
    expect(snapshot.goalProgress["goal-1"]!.accumulated).toEqual({ minorUnits: 40000, currency: "USD" });
    expect(snapshot.goalProgress["goal-1"]!.target).toEqual({ minorUnits: 1000000, currency: "USD" });
  });

  it("computes each budget from its own month", async () => {
    const june = new Date(2026, 5, 15, 12).getTime();
    const july = new Date(2026, 6, 15, 12).getTime();
    const events = [
      makeEvent({ id: "account", timestamp: june, type: "account_created", payload: { name: "Main", type: "checking", initialBalance: { minorUnits: 0, currency: "USD" } } }),
      makeEvent({ id: "category", timestamp: june + 1, type: "category_created", payload: { name: "Food" } }),
      makeEvent({ id: "budget", timestamp: june + 2, type: "budget_created", payload: { name: "June food", categoryId: "category", limit: { minorUnits: 10_000, currency: "USD" }, periodMonth: "2026-06" } }),
      makeEvent({ id: "june-tx", timestamp: june + 3, type: "transaction_created", payload: { accountId: "account", categoryId: "category", amount: { minorUnits: 2_000, currency: "USD" }, direction: "expense" } }),
      makeEvent({ id: "july-tx", timestamp: july, type: "transaction_created", payload: { accountId: "account", categoryId: "category", amount: { minorUnits: 5_000, currency: "USD" }, direction: "expense" } }),
    ];

    const snapshot = await replayFromInception(events, mkKey, july);
    expect(snapshot.budgets[0]?.spent.minorUnits).toBe(2_000);
    expect(snapshot.budgetProgress.budget).toBeUndefined();
    expect(snapshot.periodExpenses.minorUnits).toBe(5_000);
  });

  it("converts multi-currency aggregates into the selected base currency", async () => {
    const now = new Date(2026, 6, 15, 12).getTime();
    const currencyContext: CurrencyContext = {
      baseCurrency: "XOF",
      fingerprint: "XOF|USD/XOF:1:600",
      rates: new Map([["USD/XOF", {
        id: "USD/XOF",
        baseCurrency: "USD",
        quoteCurrency: "XOF",
        rate: "600",
        lastUpdated: 1,
      }]]),
    };
    const events = [
      makeEvent({ id: "usd", timestamp: now - 3, type: "account_created", payload: { name: "USD", type: "checking", initialBalance: { minorUnits: 100, currency: "USD" } } }),
      makeEvent({ id: "xof", timestamp: now - 2, type: "account_created", payload: { name: "XOF", type: "cash", initialBalance: { minorUnits: 600, currency: "XOF" } } }),
      makeEvent({ id: "food", timestamp: now - 1, type: "category_created", payload: { name: "Food" } }),
      makeEvent({ id: "expense", timestamp: now, type: "transaction_created", payload: { accountId: "usd", categoryId: "food", amount: { minorUnits: 100, currency: "USD" }, direction: "expense" } }),
    ];

    const snapshot = await replayFromInception(events, mkKey, now, currencyContext);
    expect(snapshot.totalBalance).toEqual({ minorUnits: 600, currency: "XOF" });
    expect(snapshot.periodExpenses).toEqual({ minorUnits: 600, currency: "XOF" });
    expect(snapshot.categoryTotals.food).toEqual({ minorUnits: 600, currency: "XOF" });
    expect(snapshot.missingFxCurrencies).toEqual([]);
  });

  it("reports currencies excluded because no FX rate exists", async () => {
    const now = Date.now();
    const event = makeEvent({
      id: "eur", timestamp: now, type: "account_created",
      payload: { name: "EUR", type: "checking", initialBalance: { minorUnits: 100, currency: "EUR" } },
    });
    const context: CurrencyContext = {
      baseCurrency: "USD",
      fingerprint: "USD",
      rates: new Map(),
    };

    const snapshot = await replayFromInception([event], mkKey, now, context);
    expect(snapshot.totalBalance).toEqual({ minorUnits: 0, currency: "USD" });
    expect(snapshot.missingFxCurrencies).toEqual(["EUR"]);
  });

  it("tracks recurring item last realisation date (INV-EVT-05)", async () => {
    const category = makeEvent({
      id: "cat-1", timestamp: 1000, type: "category_created", payload: { name: "Subscriptions" },
    });
    const e1 = makeEvent({
      id: "recur-1", timestamp: 2000, type: "recurring_item_created",
      payload: { categoryId: "cat-1", label: "Netflix", amount: { minorUnits: 1599, currency: "USD" }, direction: "expense", frequency: "monthly", startDate: Date.now() },
    });
    const e2 = makeEvent({
      id: "r2", timestamp: 3000, type: "recurring_item_realised", entityId: "recur-1",
      payload: { itemId: "recur-1", amount: { minorUnits: 1599, currency: "USD" }, date: 3000 },
    });

    const snapshot = await replayFromInception([category, e1, e2], mkKey);
    expect(snapshot.recurringItems.find((r) => r.id === "recur-1")).toBeDefined();
    expect(snapshot.recurringItems.find((r) => r.id === "recur-1")!.lastRealised).toBe(3000);
  });

  it("archives recurring items and removes their projections", async () => {
    const startDate = new Date(2026, 0, 1, 9).getTime();
    const snapshot = await replayFromInception([
      makeEvent({ id: "cat-1", timestamp: 1000, type: "category_created", payload: { name: "Subscriptions" } }),
      makeEvent({
        id: "recur-1", timestamp: 2000, type: "recurring_item_created",
        payload: { categoryId: "cat-1", label: "Netflix", amount: { minorUnits: 1599, currency: "USD" }, direction: "expense", frequency: "monthly", startDate },
      }),
      makeEvent({
        id: "archive-1", timestamp: 3000, type: "recurring_item_archived", entityId: "recur-1",
        payload: { itemId: "recur-1" },
      }),
    ], mkKey, new Date(2026, 6, 1, 9).getTime());

    expect(snapshot.recurringItems[0]?.isArchived).toBe(true);
    expect(snapshot.projectedRecurring).toEqual([]);
  });

  it("projects transfers with their date and note while updating both balances", async () => {
    const snapshot = await replayFromInception([
      makeEvent({
        id: "account-a", timestamp: 1000, type: "account_created",
        payload: { name: "Cash", type: "cash", initialBalance: { minorUnits: 10_000, currency: "USD" } },
      }),
      makeEvent({
        id: "account-b", timestamp: 1100, type: "account_created",
        payload: { name: "Savings", type: "savings", initialBalance: { minorUnits: 0, currency: "USD" } },
      }),
      makeEvent({
        id: "transfer-a", timestamp: 2000, type: "transfer_created",
        payload: {
          fromAccountId: "account-a",
          toAccountId: "account-b",
          externalDestination: null,
          amount: { minorUnits: 2500, currency: "USD" },
          note: "Emergency fund",
        },
      }),
    ], mkKey, 3000);

    expect(snapshot.accounts.find((account) => account.id === "account-a")?.balance.minorUnits).toBe(7500);
    expect(snapshot.accounts.find((account) => account.id === "account-b")?.balance.minorUnits).toBe(2500);
    expect(snapshot.transfers).toEqual([{
      id: "transfer-a",
      timestamp: 2000,
      fromAccountId: "account-a",
      toAccountId: "account-b",
      externalDestination: null,
      amount: { minorUnits: 2500, currency: "USD" },
      note: "Emergency fund",
    }]);
  });

  it("rejects imported transfers whose currency does not match both accounts", () => {
    expect(() => validateDecryptedEventSequence([
      {
        id: "account-a", timestamp: 1000, type: "account_created",
        payload: { name: "Cash", type: "cash", initialBalance: { minorUnits: 10_000, currency: "XOF" } },
      },
      {
        id: "account-b", timestamp: 1100, type: "account_created",
        payload: { name: "Savings", type: "savings", initialBalance: { minorUnits: 0, currency: "USD" } },
      },
      {
        id: "transfer-a", timestamp: 2000, type: "transfer_created",
        payload: {
          fromAccountId: "account-a", toAccountId: "account-b", externalDestination: null,
          amount: { minorUnits: 2500, currency: "XOF" }, note: null,
        },
      },
    ])).toThrow(/transfer currency mismatch/);
  });

  it("rejects imported goal contributions in another currency or after archival", () => {
    const goal = {
      id: "goal-a", timestamp: 1000, type: "goal_created" as const,
      payload: { name: "Emergency", targetAmount: { minorUnits: 100_000, currency: "XOF" }, targetDate: null },
    };
    expect(() => validateDecryptedEventSequence([goal, {
      id: "contribution-a", timestamp: 2000, type: "goal_contribution",
      payload: { goalId: "goal-a", amount: { minorUnits: 1000, currency: "USD" } },
    }])).toThrow(/goal contribution currency mismatch/);

    expect(() => validateDecryptedEventSequence([goal, {
      id: "archive-a", timestamp: 1500, type: "goal_archived", payload: { goalId: "goal-a" },
    }, {
      id: "contribution-a", timestamp: 2000, type: "goal_contribution",
      payload: { goalId: "goal-a", amount: { minorUnits: 1000, currency: "XOF" } },
    }])).toThrow(/goal .* is archived/);
  });
});

describe("debt and receivable due-date projection", () => {
  it("defaults legacy creations to no due date and replays subsequent updates", async () => {
    const legacy = makeEvent({
      id: "legacy-debt", timestamp: 100, type: "debt_credit_created",
      payload: {
        kind: "debt", partyName: "Bank", motive: "Equipment",
        amount: { minorUnits: 50_000, currency: "XOF" }, date: 90, status: "pending",
      },
    });
    const dated = makeEvent({
      id: "dated-receivable", timestamp: 110, type: "debt_credit_created",
      payload: {
        kind: "receivable", partyName: "Client", motive: "Invoice",
        amount: { minorUnits: 25_000, currency: "XOF" }, date: 95, status: "partial", dueDate: 500,
      },
    });
    const addLegacyDueDate = makeEvent({
      id: "add-due", timestamp: 120, type: "debt_credit_due_date_updated", entityId: "legacy-debt",
      payload: { debtCreditId: "legacy-debt", dueDate: 400 },
    });
    const clearDueDate = makeEvent({
      id: "clear-due", timestamp: 130, type: "debt_credit_due_date_updated", entityId: "dated-receivable",
      payload: { debtCreditId: "dated-receivable", dueDate: null },
    });

    const initial = await replayFromInception([legacy, dated], mkKey, 115);
    expect(initial.debtCredits).toEqual([
      expect.objectContaining({ id: "legacy-debt", dueDate: null }),
      expect.objectContaining({ id: "dated-receivable", dueDate: 500 }),
    ]);

    const updated = await replayFromInception([clearDueDate, addLegacyDueDate, dated, legacy], mkKey, 140);
    expect(updated.debtCredits).toEqual([
      expect.objectContaining({ id: "legacy-debt", dueDate: 400 }),
      expect.objectContaining({ id: "dated-receivable", dueDate: null }),
    ]);
  });

  it("rejects a due-date update for an unknown item", () => {
    expect(() => validateDecryptedEventSequence([{
      id: "missing-update", timestamp: 100, type: "debt_credit_due_date_updated",
      payload: { debtCreditId: "missing", dueDate: 200 },
    }])).toThrow(/missing debt or receivable/);
  });
});

describe("planned expense projection", () => {
  const category = makeEvent({
    id: "category", timestamp: 100, type: "category_created", payload: { name: "Equipment" },
  });
  const account = makeEvent({
    id: "account", timestamp: 110, type: "account_created",
    payload: { name: "Cash", type: "cash", initialBalance: { minorUnits: 10_000, currency: "XOF" } },
  });
  const planned = makeEvent({
    id: "planned", timestamp: 120, type: "planned_expense_created",
    payload: {
      label: "Laptop", estimatedAmount: { minorUnits: 2_000, currency: "XOF" },
      categoryId: "category", priority: "high", dueDate: 500, note: "For work",
    },
  });

  it("projects creation without affecting any financial aggregate", async () => {
    const snapshot = await replayFromInception([category, account, planned], mkKey, 600);

    expect(snapshot.version).toBe(4);
    expect(snapshot.plannedExpenses).toEqual([{
      id: "planned",
      label: "Laptop",
      estimatedAmount: { minorUnits: 2_000, currency: "XOF" },
      categoryId: "category",
      priority: "high",
      dueDate: 500,
      note: "For work",
      status: "pending",
      createdAt: 120,
      updatedAt: 120,
      completedAt: null,
      cancelledAt: null,
      transactionId: null,
      completedAccountId: null,
      actualAmount: null,
    }]);
    expect(snapshot.accounts[0]?.balance.minorUnits).toBe(10_000);
    expect(snapshot.periodExpenses.minorUnits).toBe(0);
    expect(snapshot.categoryTotals).toEqual({});
  });

  it("fully replaces editable fields while preserving creation metadata", async () => {
    const otherCategory = makeEvent({
      id: "other-category", timestamp: 130, type: "category_created", payload: { name: "Office" },
    });
    const update = makeEvent({
      id: "planned-update", timestamp: 140, type: "planned_expense_updated", entityId: "planned",
      payload: {
        plannedExpenseId: "planned", label: "Desk", estimatedAmount: { minorUnits: 3_000, currency: "USD" },
        categoryId: "other-category", priority: "low", dueDate: null, note: "Ergonomic",
      },
    });

    const snapshot = await replayFromInception([update, planned, category, otherCategory], mkKey, 200);
    expect(snapshot.plannedExpenses[0]).toMatchObject({
      id: "planned", label: "Desk", estimatedAmount: { minorUnits: 3_000, currency: "USD" },
      categoryId: "other-category", priority: "low", dueDate: null, note: "Ergonomic",
      status: "pending", createdAt: 120, updatedAt: 140,
    });
  });

  it("cancels without creating a transaction or changing balances", async () => {
    const cancelled = makeEvent({
      id: "cancel", timestamp: 130, type: "planned_expense_cancelled", entityId: "planned",
      payload: { plannedExpenseId: "planned" },
    });
    const snapshot = await replayFromInception([category, account, planned, cancelled], mkKey, 200);

    expect(snapshot.plannedExpenses[0]).toMatchObject({
      status: "cancelled", updatedAt: 130, cancelledAt: 130, transactionId: null,
    });
    expect(snapshot.accounts[0]?.balance.minorUnits).toBe(10_000);
    expect(snapshot.periodExpenses.minorUnits).toBe(0);
  });

  it("rejects every transition from a closed planned expense", () => {
    const cancelled = {
      id: "cancel", timestamp: 130, type: "planned_expense_cancelled" as const,
      payload: { plannedExpenseId: "planned" },
    };
    expect(() => validateDecryptedEventSequence([
      { id: "category", timestamp: 100, type: "category_created", payload: { name: "Equipment" } },
      { id: "planned", timestamp: 120, type: "planned_expense_created", payload: plannedPayload() },
      cancelled,
      {
        id: "update", timestamp: 140, type: "planned_expense_updated",
        payload: { plannedExpenseId: "planned", ...plannedPayload(), priority: "medium" },
      },
    ])).toThrow(/not pending/);
    expect(() => validateDecryptedEventSequence([
      { id: "category", timestamp: 100, type: "category_created", payload: { name: "Equipment" } },
      { id: "planned", timestamp: 120, type: "planned_expense_created", payload: plannedPayload() },
      cancelled,
      { id: "cancel-again", timestamp: 140, type: "planned_expense_cancelled", payload: { plannedExpenseId: "planned" } },
    ])).toThrow(/not pending/);
    expect(() => validateDecryptedEventSequence([
      { id: "category", timestamp: 100, type: "category_created", payload: { name: "Equipment" } },
      { id: "planned", timestamp: 120, type: "planned_expense_created", payload: plannedPayload() },
      cancelled,
      {
        id: "complete-after-cancel", timestamp: 140, type: "planned_expense_completed",
        payload: { plannedExpenseId: "planned", transactionId: "transaction", accountId: "account", actualAmount: { minorUnits: 2_000, currency: "XOF" }, occurredAt: 125 },
      },
    ])).toThrow(/not pending/);
  });

  it("keeps completed planned expenses immutable", () => {
    const completedPrefix = [
      { id: "category", timestamp: 100, type: "category_created" as const, payload: { name: "Equipment" } },
      { id: "account", timestamp: 110, type: "account_created" as const, payload: { name: "Cash", type: "cash", initialBalance: { minorUnits: 10_000, currency: "XOF" } } },
      { id: "planned", timestamp: 120, type: "planned_expense_created" as const, payload: plannedPayload() },
      { id: "transaction", timestamp: 130, type: "transaction_created" as const, payload: { accountId: "account", categoryId: "category", amount: { minorUnits: 2_000, currency: "XOF" }, direction: "expense", occurredAt: 125 } },
      { id: "complete", timestamp: 140, type: "planned_expense_completed" as const, payload: { plannedExpenseId: "planned", transactionId: "transaction", accountId: "account", actualAmount: { minorUnits: 2_000, currency: "XOF" }, occurredAt: 125 } },
    ];
    const forbidden = [
      { id: "update", timestamp: 150, type: "planned_expense_updated" as const, payload: { plannedExpenseId: "planned", ...plannedPayload() } },
      { id: "cancel", timestamp: 150, type: "planned_expense_cancelled" as const, payload: { plannedExpenseId: "planned" } },
      { id: "complete-again", timestamp: 150, type: "planned_expense_completed" as const, payload: { plannedExpenseId: "planned", transactionId: "other", accountId: "account", actualAmount: { minorUnits: 2_000, currency: "XOF" }, occurredAt: 125 } },
    ];

    for (const event of forbidden) {
      expect(() => validateDecryptedEventSequence([...completedPrefix, event])).toThrow(/not pending/);
    }
  });

  it("blocks category archival only while a planned expense is pending", async () => {
    const archive = makeEvent({
      id: "archive", timestamp: 140, type: "category_archived", entityId: "category",
      payload: { categoryId: "category" },
    });
    const pendingSnapshot = await replayFromInception([category, planned, archive], mkKey, 200);
    expect(pendingSnapshot.categories[0]?.isArchived).toBe(false);

    const cancelled = makeEvent({
      id: "cancel", timestamp: 130, type: "planned_expense_cancelled", entityId: "planned",
      payload: { plannedExpenseId: "planned" },
    });
    const cancelledSnapshot = await replayFromInception([category, planned, cancelled, archive], mkKey, 200);
    expect(cancelledSnapshot.categories[0]?.isArchived).toBe(true);
  });

  it("completes from a matching expense transaction and uses occurredAt for aggregates", async () => {
    const budget = makeEvent({
      id: "budget", timestamp: 115, type: "budget_created",
      payload: {
        name: "Equipment", categoryId: "category", limit: { minorUnits: 5_000, currency: "XOF" },
        periodMonth: "1970-01",
      },
    });
    const transaction = makeEvent({
      id: "transaction", timestamp: 10_000, type: "transaction_created",
      payload: {
        accountId: "account", categoryId: "category", amount: { minorUnits: 1_500, currency: "XOF" },
        direction: "expense", occurredAt: 500, note: "Laptop", tags: ["planned-expense"], merchant: null,
      },
    });
    const completed = makeEvent({
      id: "complete", timestamp: 10_001, type: "planned_expense_completed", entityId: "planned",
      payload: {
        plannedExpenseId: "planned", transactionId: "transaction", accountId: "account",
        actualAmount: { minorUnits: 1_500, currency: "XOF" }, occurredAt: 500,
      },
    });
    const snapshot = await replayFromInception([completed, transaction, planned, budget, account, category], mkKey, 600);

    expect(snapshot.plannedExpenses[0]).toMatchObject({
      status: "completed", updatedAt: 10_001, completedAt: 500,
      transactionId: "transaction", completedAccountId: "account",
      actualAmount: { minorUnits: 1_500, currency: "XOF" },
    });
    expect(snapshot.accounts[0]?.balance.minorUnits).toBe(8_500);
    expect(snapshot.periodExpenses.minorUnits).toBe(1_500);
    expect(snapshot.categoryTotals.category?.minorUnits).toBe(1_500);
    expect(snapshot.budgets[0]?.spent.minorUnits).toBe(1_500);
    expect(snapshot.budgetProgress.budget?.spent.minorUnits).toBe(1_500);
  });

  it("does not block category archival after completion", async () => {
    const transaction = makeEvent({
      id: "transaction", timestamp: 130, type: "transaction_created",
      payload: { accountId: "account", categoryId: "category", amount: { minorUnits: 2_000, currency: "XOF" }, direction: "expense", occurredAt: 125 },
    });
    const completed = makeEvent({
      id: "complete", timestamp: 140, type: "planned_expense_completed",
      payload: { plannedExpenseId: "planned", transactionId: "transaction", accountId: "account", actualAmount: { minorUnits: 2_000, currency: "XOF" }, occurredAt: 125 },
    });
    const archive = makeEvent({
      id: "archive", timestamp: 150, type: "category_archived", payload: { categoryId: "category" },
    });

    const snapshot = await replayFromInception([category, account, planned, transaction, completed, archive], mkKey, 200);
    expect(snapshot.categories[0]?.isArchived).toBe(true);
  });

  it("rejects completion when its transaction does not exactly match", () => {
    expect(() => validateDecryptedEventSequence([
      { id: "category", timestamp: 100, type: "category_created", payload: { name: "Equipment" } },
      { id: "account", timestamp: 110, type: "account_created", payload: { name: "Cash", type: "cash", initialBalance: { minorUnits: 10_000, currency: "XOF" } } },
      { id: "planned", timestamp: 120, type: "planned_expense_created", payload: plannedPayload() },
      { id: "transaction", timestamp: 130, type: "transaction_created", payload: { accountId: "account", categoryId: "category", amount: { minorUnits: 1_000, currency: "XOF" }, direction: "expense", occurredAt: 125 } },
      { id: "complete", timestamp: 140, type: "planned_expense_completed", payload: { plannedExpenseId: "planned", transactionId: "transaction", accountId: "account", actualAmount: { minorUnits: 2_000, currency: "XOF" }, occurredAt: 125 } },
    ])).toThrow(/does not match/);
  });

  function plannedPayload(): FinancialEventPayload {
    return {
      label: "Laptop", estimatedAmount: { minorUnits: 2_000, currency: "XOF" },
      categoryId: "category", priority: "high", dueDate: null, note: "For work",
    };
  }
});

describe("readTransactionsInRange", () => {
  it("uses occurredAt as the business date and preserves it after updates", async () => {
    fakeEvents.seed([
      makeEvent({
        id: "backdated", timestamp: 10_000, type: "transaction_created",
        payload: {
          accountId: "account-a", categoryId: "category-a", amount: { minorUnits: 100, currency: "USD" },
          direction: "expense", occurredAt: 1_000,
        },
      }),
      makeEvent({
        id: "later-update", timestamp: 20_000, type: "transaction_updated",
        payload: {
          originalEventId: "backdated", accountId: "account-a", categoryId: "category-b",
          amount: { minorUnits: 250, currency: "USD" }, direction: "expense",
        },
      }),
    ]);

    const transactions = await readTransactionsInRange(900, 1_100, mkKey);
    expect(transactions).toHaveLength(1);
    expect(transactions[0]).toMatchObject({
      id: "backdated", timestamp: 1_000, categoryId: "category-b",
      amount: { minorUnits: 250, currency: "USD" },
    });
    expect(await readTransactionsInRange(9_000, 11_000, mkKey)).toEqual([]);
  });

  it("keeps the structural timestamp for legacy transactions without occurredAt", async () => {
    fakeEvents.seed([makeEvent({
      id: "legacy", timestamp: 1_000, type: "transaction_created",
      payload: {
        accountId: "account-a", categoryId: "category-a", amount: { minorUnits: 100, currency: "USD" },
        direction: "expense",
      },
    })]);

    expect((await readTransactionsInRange(900, 1_100, mkKey))[0]?.timestamp).toBe(1_000);
  });

  it("applies updates and deletions before returning active transactions", async () => {
    fakeEvents.seed([
      makeEvent({
        id: "tx-a", timestamp: 1000, type: "transaction_created",
        payload: { accountId: "account-a", categoryId: "category-a", amount: { minorUnits: 100, currency: "USD" }, direction: "expense" },
      }),
      makeEvent({
        id: "update-a", timestamp: 2000, type: "transaction_updated",
        payload: { originalEventId: "tx-a", accountId: "account-a", categoryId: "category-b", amount: { minorUnits: 250, currency: "USD" }, direction: "expense" },
      }),
      makeEvent({
        id: "tx-b", timestamp: 1500, type: "transaction_created",
        payload: { accountId: "account-a", categoryId: "category-a", amount: { minorUnits: 500, currency: "USD" }, direction: "income" },
      }),
      makeEvent({
        id: "delete-b", timestamp: 2500, type: "transaction_deleted",
        payload: { originalEventId: "tx-b" },
      }),
    ]);

    const transactions = await readTransactionsInRange(0, 3000, mkKey);

    expect(transactions).toEqual([{
      id: "tx-a",
      timestamp: 1000,
      accountId: "account-a",
      categoryId: "category-b",
      amount: { minorUnits: 250, currency: "USD" },
      displayAmount: { minorUnits: 250, currency: "USD" },
      direction: "expense",
      note: "",
      tags: [],
      merchant: "",
    }]);
  });

  it("converts display amounts to the configured base currency", async () => {
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => key === "wisemoney_default_currency" ? "XOF" : null,
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
    fakeFxRates.seed([{
      id: "USD/XOF",
      baseCurrency: "USD",
      quoteCurrency: "XOF",
      lastUpdated: 1,
      ciphertext: new TextEncoder().encode("600"),
      iv: new Uint8Array(12),
    }]);
    fakeEvents.seed([makeEvent({
      id: "tx-usd", timestamp: 1000, type: "transaction_created",
      payload: { accountId: "account-usd", categoryId: "category", amount: { minorUnits: 100, currency: "USD" }, direction: "income" },
    })]);

    const [transaction] = await readTransactionsInRange(0, 2000, mkKey);

    expect(transaction?.amount).toEqual({ minorUnits: 100, currency: "USD" });
    expect(transaction?.displayAmount).toEqual({ minorUnits: 600, currency: "XOF" });
    vi.unstubAllGlobals();
  });
});

describe("computeProjectedOccurrences", () => {
  it("does not project archived items", () => {
    expect(computeProjectedOccurrences([{
      id: "old-rent",
      categoryId: "housing",
      label: "Old rent",
      amount: { minorUnits: 100_000, currency: "XOF" },
      direction: "expense",
      frequency: "monthly",
      startDate: 1,
      lastRealised: null,
      isArchived: true,
    }], Date.now())).toEqual([]);
  });

  it("returns future occurrences for an old recurring item", () => {
    const now = new Date(2026, 6, 13, 12).getTime();
    const occurrences = computeProjectedOccurrences([{
      id: "rent",
      categoryId: "housing",
      label: "Rent",
      amount: { minorUnits: 100_000, currency: "USD" },
      direction: "expense",
      frequency: "monthly",
      startDate: new Date(2020, 0, 31, 12).getTime(),
      lastRealised: null,
      isArchived: false,
    }], now);

    expect(occurrences).toHaveLength(5);
    expect(occurrences.every((occurrence) => occurrence.dueDate > now)).toBe(true);
    expect(occurrences[0]?.dueDate).toBeLessThan(occurrences[1]?.dueDate ?? 0);
  });

  it("keeps the original monthly anchor when an occurrence is realised late", () => {
    const start = new Date(2026, 0, 1, 9).getTime();
    const realisedLate = new Date(2026, 6, 5, 9).getTime();
    const now = new Date(2026, 6, 6, 9).getTime();
    const occurrences = computeProjectedOccurrences([{
      id: "rent",
      categoryId: "housing",
      label: "Rent",
      amount: { minorUnits: 100_000, currency: "XOF" },
      direction: "expense",
      frequency: "monthly",
      startDate: start,
      lastRealised: realisedLate,
      isArchived: false,
    }], now);

    expect(new Date(occurrences[0]!.dueDate).getDate()).toBe(1);
    expect(new Date(occurrences[0]!.dueDate).getMonth()).toBe(7);
  });
});

describe("isSnapshotFresh", () => {
  it("returns true when asOfEventId matches last event", async () => {
    fakeEvents.seed([makeEvent({ id: "e1", timestamp: 1000, type: "account_created", payload: { name: "Test", type: "checking", initialBalance: { minorUnits: 0, currency: "USD" } } })]);
    expect(await isSnapshotFresh(emptySnapshot("e1", Date.now()))).toBe(true);
  });

  it("returns false when asOfEventId differs from last event", async () => {
    fakeEvents.seed([
      makeEvent({ id: "e1", timestamp: 1000, type: "account_created", payload: { name: "Test", type: "checking", initialBalance: { minorUnits: 0, currency: "USD" } } }),
      makeEvent({ id: "e2", timestamp: 2000, type: "transaction_created", entityId: "acct-1", payload: { accountId: "acct-1", categoryId: "c", amount: { minorUnits: 100, currency: "USD" }, direction: "expense" } }),
    ]);
    expect(await isSnapshotFresh(emptySnapshot("e1", 1000))).toBe(false);
  });
});

describe("getSnapshot", () => {
  it("returns cached snapshot when fresh", async () => {
    const e1 = makeEvent({ id: "e1", timestamp: 1000, type: "account_created", payload: { name: "Test", type: "checking", initialBalance: { minorUnits: 0, currency: "USD" } } });
    fakeEvents.seed([e1]);

    const snapshot = emptySnapshot("e1", 1000);
    snapshot.accounts = [{ id: "a", name: "Checking", type: "checking", currency: "USD", isActive: true, balance: { minorUnits: 0, currency: "USD" }, initialBalance: { minorUnits: 0, currency: "USD" } }];

    const snapshotCiphertext = new TextEncoder().encode(JSON.stringify(snapshot));
    await fakeSnapshotStore.put({ id: "current", asOfEventId: "e1", asOfTimestamp: 1000, ciphertext: snapshotCiphertext, iv: new Uint8Array(12) });

    const result = await getSnapshot(mkKey);
    expect(result.asOfEventId).toBe("e1");
  });

  it("triggers replay when cached snapshot is stale", async () => {
    const e1 = makeEvent({ id: "e1", timestamp: 1000, type: "account_created", payload: { name: "Checking", type: "checking", initialBalance: { minorUnits: 50000, currency: "USD" } } });
    fakeEvents.seed([e1]);

    const stale = emptySnapshot("stale", 500);
    const staleCiphertext = new TextEncoder().encode(JSON.stringify(stale));
    await fakeSnapshotStore.put({ id: "current", asOfEventId: "stale", asOfTimestamp: 500, ciphertext: staleCiphertext, iv: new Uint8Array(12) });

    const result = await getSnapshot(mkKey);
    expect(result.accounts).toHaveLength(1);
    expect(result.accounts[0]!.balance).toEqual({ minorUnits: 50000, currency: "USD" });
  });

  it("replays a healthy journal when the decrypted cache is invalid JSON", async () => {
    fakeEvents.seed([makeEvent({
      id: "e1", timestamp: 1000, type: "account_created",
      payload: { name: "Cash", type: "cash", initialBalance: { minorUnits: 1000, currency: "USD" } },
    })]);
    await fakeSnapshotStore.put({
      id: "current", asOfEventId: "e1", asOfTimestamp: 1000,
      ciphertext: new TextEncoder().encode("not-json"), iv: new Uint8Array(12),
    });

    const result = await getSnapshot(mkKey);

    expect(result.accounts[0]?.name).toBe("Cash");
  });

  it("invalidates a version 3 snapshot and rebuilds version 4 from the journal", async () => {
    fakeEvents.seed([makeEvent({
      id: "e1", timestamp: 1000, type: "account_created",
      payload: { name: "Cash", type: "cash", initialBalance: { minorUnits: 1000, currency: "USD" } },
    })]);
    const legacy = { ...emptySnapshot("e1", 1000), version: 3, accounts: [] };
    await fakeSnapshotStore.put({
      id: "current", asOfEventId: "e1", asOfTimestamp: 1000,
      ciphertext: new TextEncoder().encode(JSON.stringify(legacy)), iv: new Uint8Array(12),
    });

    const result = await getSnapshot(mkKey);

    expect(result.version).toBe(4);
    expect(result.accounts[0]?.name).toBe("Cash");
  });
});

describe("persistSnapshot", () => {
  it("seals and writes to snapshot store", async () => {
    await persistSnapshot(emptySnapshot("e1", 1000), mkKey);
    expect(fakeSeal).toHaveBeenCalledOnce();
    expect(fakeSnapshotStore.peek("current")).toBeDefined();
  });
});
