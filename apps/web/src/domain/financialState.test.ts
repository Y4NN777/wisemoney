import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FinancialEventRecord } from "@/db/schema.ts";
import type { EncryptedEnvelope } from "@/crypto/envelope.ts";
import type { FinancialEventPayload, FinancialEventType } from "./eventStore.ts";

const { fakeEvents, fakeSnapshotStore, fakeOpen, fakeSeal } = vi.hoisted(() => {
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
  return {
    fakeEvents: new FakeEventsTable(),
    fakeSnapshotStore: new FakeSnapshotTable(),
    fakeOpen: vi.fn<(env: EncryptedEnvelope) => Promise<Uint8Array>>(),
    fakeSeal: vi.fn<() => Promise<{ ciphertext: Uint8Array; iv: Uint8Array }>>(),
  };
});

vi.mock("@/db/schema.ts", () => ({
  db: {
    financialEvents: fakeEvents,
    financialStateSnapshot: fakeSnapshotStore,
  },
}));

vi.mock("@/crypto/envelope.ts", () => ({
  open: fakeOpen,
  seal: fakeSeal,
}));

import { replayFromInception, applyEventToSnapshot, isSnapshotFresh, getSnapshot, persistSnapshot } from "./financialState.ts";
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
  fakeOpen.mockImplementation((env: EncryptedEnvelope) => Promise.resolve(env.ciphertext));
}

function emptySnapshot(asOfEventId = "none", asOfTimestamp = 0): FinancialStateSnapshot {
  return {
    asOfEventId, asOfTimestamp,
    accounts: [], categories: [], budgets: [], goals: [], recurringItems: [], debtCredits: [],
    periodStart: 0, periodEnd: 0,
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
    expect(snapshot.totalBalance).toEqual({ minorUnits: 0, currency: "USD" });
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

  it("replays account update and archive events", async () => {
    const created = makeEvent({
      id: "acct-1", timestamp: 1000, type: "account_created",
      payload: { name: "Checking", type: "checking", initialBalance: { minorUnits: 10000, currency: "USD" } },
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

    const snapshot = await replayFromInception([e1, e2], mkKey);
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

    const snapshot = await replayFromInception([e1, e2], mkKey);
    expect(snapshot.accounts[0]!.balance).toEqual({ minorUnits: 97500, currency: "USD" });
    expect(snapshot.periodExpenses).toEqual({ minorUnits: 2500, currency: "USD" });
  });

  it("replays category archive event", async () => {
    const created = makeEvent({
      id: "cat-1", timestamp: 1000, type: "category_created",
      payload: { name: "Groceries", parentId: null, isSystemDefault: false },
    });
    const archived = makeEvent({
      id: "evt-2", timestamp: 2000, type: "category_archived", entityId: "cat-1",
      payload: { categoryId: "cat-1" },
    });

    const snapshot = await replayFromInception([created, archived], mkKey);
    expect(snapshot.categories.find((category) => category.id === "cat-1")).toBeUndefined();
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

    const snapshot = await replayFromInception([e1, e2], mkKey);
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

  it("tracks recurring item last realisation date (INV-EVT-05)", async () => {
    const e1 = makeEvent({
      id: "recur-1", timestamp: 2000, type: "recurring_item_created",
      payload: { categoryId: "cat-1", label: "Netflix", amount: { minorUnits: 1599, currency: "USD" }, direction: "expense", frequency: "monthly", startDate: Date.now() },
    });
    const e2 = makeEvent({
      id: "r2", timestamp: 3000, type: "recurring_item_realised", entityId: "recur-1",
      payload: { itemId: "recur-1", date: 3000 },
    });

    const snapshot = await replayFromInception([e1, e2], mkKey);
    expect(snapshot.recurringItems.find((r) => r.id === "recur-1")).toBeDefined();
    expect(snapshot.recurringItems.find((r) => r.id === "recur-1")!.lastRealised).toBe(3000);
  });
});

describe("applyEventToSnapshot", () => {
  it("applies a new transaction event to an existing snapshot", async () => {
    const snapshot = emptySnapshot("e1", 1000);
    snapshot.accounts = [{ id: "acct-1", name: "Checking", type: "checking", currency: "USD", isActive: true, balance: { minorUnits: 100000, currency: "USD" }, initialBalance: { minorUnits: 100000, currency: "USD" } }];

    const e2 = makeEvent({
      id: "e2", timestamp: 2000, type: "transaction_created", entityId: "acct-1",
      payload: { accountId: "acct-1", categoryId: "cat-1", amount: { minorUnits: 5000, currency: "USD" }, direction: "expense" },
    });

    const result = await applyEventToSnapshot(snapshot, e2, mkKey);
    expect(result.asOfEventId).toBe("e2");
    expect(result.accounts.find((a) => a.id === "acct-1")!.balance).toEqual({ minorUnits: 95000, currency: "USD" });
  });
});

describe("isSnapshotFresh", () => {
  it("returns true when asOfEventId matches last event", async () => {
    fakeEvents.seed([makeEvent({ id: "e1", timestamp: 1000, type: "account_created", payload: { name: "Test", type: "checking", initialBalance: { minorUnits: 0, currency: "USD" } } })]);
    expect(await isSnapshotFresh(emptySnapshot("e1", 1000))).toBe(true);
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
});

describe("persistSnapshot", () => {
  it("seals and writes to snapshot store", async () => {
    await persistSnapshot(emptySnapshot("e1", 1000), mkKey);
    expect(fakeSeal).toHaveBeenCalledOnce();
    expect(fakeSnapshotStore.peek("current")).toBeDefined();
  });
});
