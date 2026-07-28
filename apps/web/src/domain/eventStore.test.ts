import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FinancialEventRecord } from "@/db/schema.ts";
import type { MasterKey, EncryptedEnvelope } from "@/crypto/envelope.ts";

const { fakeFinancialEvents, fakeSeal, fakeSnapshotClear, fakeFxClear, fakeFxBulkAdd, fakeSettingsClear, fakeSettingsAdd } = vi.hoisted(() => {
  type AnyRecord = { id: string };
  class FakeTable<T extends AnyRecord> {
    readonly name = "financialEvents";
    private store = new Map<string, T>();
    get(id: string): Promise<T | undefined> {
      return Promise.resolve(this.store.get(id));
    }
    add(record: T & AnyRecord): Promise<string> {
      if (this.store.has(record.id)) {
        const err = new Error("ConstraintError") as Error & { name: string };
        err.name = "ConstraintError";
        throw err;
      }
      this.store.set(record.id, record);
      return Promise.resolve(record.id);
    }
    bulkAdd(records: T[]): Promise<string> {
      if (records.some((record) => this.store.has(record.id))) {
        const err = new Error("BulkError") as Error & { name: string };
        err.name = "BulkError";
        throw err;
      }
      for (const record of records) this.store.set(record.id, record);
      return Promise.resolve(records.at(-1)?.id ?? "");
    }
    put(record: T): Promise<string> {
      this.store.set(record.id, record);
      return Promise.resolve(record.id);
    }
    orderBy(_field: string): { toArray: () => Promise<T[]>; last: () => Promise<T | undefined> } {
      const items = [...this.store.values()].sort((a, b) => {
        const aTs = (a as unknown as FinancialEventRecord).timestamp;
        const bTs = (b as unknown as FinancialEventRecord).timestamp;
        return aTs - bTs;
      });
      return {
        toArray: () => Promise.resolve(items),
        last: () => Promise.resolve(items[items.length - 1]),
      };
    }
    where(_field: string): { above: (v: number) => { toArray: () => Promise<T[]> }; equals: (v: number) => { toArray: () => Promise<T[]> } } {
      return {
        above: (v: number) => ({
          toArray: () => Promise.resolve(
            [...this.store.values()].filter(
              (r) => (r as unknown as FinancialEventRecord).timestamp > v
            ),
          ),
        }),
        equals: (v: number) => ({
          toArray: () => Promise.resolve(
            [...this.store.values()].filter(
              (r) => (r as unknown as FinancialEventRecord).timestamp === v
            ),
          ),
        }),
      };
    }
    clear(): void {
      this.store.clear();
    }
    peek(id: string): T | undefined {
      return this.store.get(id);
    }
  }
  const fakeFinancialEvents = new FakeTable<FinancialEventRecord>();
  const fakeSeal = vi.fn<(...args: Array<unknown>) => Promise<EncryptedEnvelope>>();
  const fakeSnapshotClear = vi.fn<() => Promise<void>>();
  const fakeFxClear = vi.fn<() => Promise<void>>();
  const fakeFxBulkAdd = vi.fn<() => Promise<void>>();
  const fakeSettingsClear = vi.fn<() => Promise<void>>();
  const fakeSettingsAdd = vi.fn<() => Promise<void>>();
  return { fakeFinancialEvents, fakeSeal, fakeSnapshotClear, fakeFxClear, fakeFxBulkAdd, fakeSettingsClear, fakeSettingsAdd };
});

vi.mock("@/db/schema.ts", () => ({
  db: {
    financialEvents: fakeFinancialEvents,
    financialStateSnapshot: { clear: fakeSnapshotClear },
    fxRates: { clear: fakeFxClear, bulkAdd: fakeFxBulkAdd },
    appSettings: { clear: fakeSettingsClear, add: fakeSettingsAdd },
    transaction: (_mode: string, _tables: unknown, callback: () => Promise<void>) => callback(),
  },
}));

vi.mock("@/crypto/envelope.ts", () => ({
  seal: fakeSeal,
}));

import { appendEvent, appendEvents, replaceAllEvents, readAllEvents, readEventsSince, AppendEventError } from "./eventStore.ts";

function makeMasterKey(): MasterKey {
  return { _brand: "MasterKey" as const, key: null as unknown as CryptoKey };
}

const mkKey = makeMasterKey();
const accountPayload = { name: "Account", type: "cash", initialBalance: { minorUnits: 0, currency: "XOF" } };
let sealedPlaintext: Uint8Array | null = null;

beforeEach(() => {
  fakeFinancialEvents.clear();
  fakeSeal.mockReset();
  fakeSnapshotClear.mockReset();
  fakeFxClear.mockReset();
  fakeFxBulkAdd.mockReset();
  fakeSettingsClear.mockReset();
  fakeSettingsAdd.mockReset();
  fakeSnapshotClear.mockResolvedValue(undefined);
  fakeFxClear.mockResolvedValue(undefined);
  fakeFxBulkAdd.mockResolvedValue(undefined);
  fakeSettingsClear.mockResolvedValue(undefined);
  fakeSettingsAdd.mockResolvedValue(undefined);
  sealedPlaintext = null;
  fakeSeal.mockImplementation((input) => {
    sealedPlaintext = (input as Uint8Array).slice();
    return Promise.resolve({
      ciphertext: new Uint8Array([1, 2, 3]),
      iv: new Uint8Array([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]),
    });
  });
});

describe("appendEvent", () => {
  it("seals payload and writes to db", async () => {
    await appendEvent({
      id: "evt-1",
      timestamp: 1000,
      type: "account_created",
      entityId: "acct-1",
      payload: { name: "Checking", type: "checking", initialBalance: { minorUnits: 1000, currency: "USD" } },
      masterKey: mkKey,
    });

    expect(fakeSeal).toHaveBeenCalledOnce();
    const decoded = JSON.parse(new TextDecoder().decode(sealedPlaintext!)) as Record<string, unknown>;
    expect(decoded).toEqual({
      name: "Checking",
      type: "checking",
      initialBalance: { minorUnits: 1000, currency: "USD" },
    });

    const record = fakeFinancialEvents.peek("evt-1");
    expect(record).toBeDefined();
    expect(record!.id).toBe("evt-1");
    expect(record!.timestamp).toBe(1000);
    expect(record!.type).toBe("account_created");
    expect(record!.entityId).toBe("acct-1");
  });

  it("throws AppendEventError on duplicate id", async () => {
    await appendEvent({
      id: "dup",
      timestamp: 1000,
      type: "account_created",
      entityId: "a",
      payload: accountPayload,
      masterKey: mkKey,
    });

    await expect(
      appendEvent({
        id: "dup",
        timestamp: 2000,
        type: "account_created",
        entityId: "a",
        payload: accountPayload,
        masterKey: mkKey,
      })
    ).rejects.toThrow(AppendEventError);
  });

  it("throws AppendEventError with DUPLICATE_ID code on constraint violation", async () => {
    await appendEvent({
      id: "dup2",
      timestamp: 1000,
      type: "account_created",
      entityId: "a",
      payload: accountPayload,
      masterKey: mkKey,
    });

    try {
      await appendEvent({
        id: "dup2",
        timestamp: 2000,
        type: "account_created",
        entityId: "a",
        payload: accountPayload,
        masterKey: mkKey,
      });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(AppendEventError);
      expect((err as AppendEventError).code).toBe("DUPLICATE_ID");
      expect((err as AppendEventError).eventId).toBe("dup2");
    }
  });

  it("rejects a write validated against a stale snapshot", async () => {
    await appendEvent({
      id: "current", timestamp: 1000, type: "account_created", entityId: "a",
      payload: accountPayload, masterKey: mkKey,
    });

    await expect(appendEvent({
      id: "stale-write", timestamp: 2000, type: "account_created", entityId: "b",
      payload: accountPayload, masterKey: mkKey, expectedLastEventId: "older",
    })).rejects.toMatchObject({ code: "STALE_SNAPSHOT" });
    expect(fakeFinancialEvents.peek("stale-write")).toBeUndefined();
  });

  it("accepts a write validated against the current snapshot", async () => {
    await appendEvent({
      id: "current", timestamp: 1000, type: "account_created", entityId: "a",
      payload: accountPayload, masterKey: mkKey,
    });

    await appendEvent({
      id: "next", timestamp: 2000, type: "account_created", entityId: "b",
      payload: accountPayload, masterKey: mkKey, expectedLastEventId: "current",
    });
    expect(fakeFinancialEvents.peek("next")).toBeDefined();
  });
});

describe("appendEvents", () => {
  it("seals and appends every event as one batch", async () => {
    await appendEvents([
      { id: "one", timestamp: 1000, type: "account_created", entityId: "r", payload: accountPayload, masterKey: mkKey },
      { id: "two", timestamp: 1000, type: "account_created", entityId: "a", payload: accountPayload, masterKey: mkKey },
    ]);

    expect(fakeSeal).toHaveBeenCalledTimes(2);
    expect(fakeFinancialEvents.peek("one")).toBeDefined();
    expect(fakeFinancialEvents.peek("two")).toBeDefined();
  });

  it("assigns strictly increasing timestamps in batch order", async () => {
    await appendEvents([
      { id: "z-first", timestamp: 1000, type: "account_created", entityId: "a", payload: accountPayload, masterKey: mkKey },
      { id: "a-second", timestamp: 1000, type: "account_created", entityId: "b", payload: accountPayload, masterKey: mkKey },
    ]);

    expect(fakeFinancialEvents.peek("z-first")?.timestamp).toBe(1000);
    expect(fakeFinancialEvents.peek("a-second")?.timestamp).toBe(1001);
    expect((await readAllEvents()).map((event) => event.id)).toEqual(["z-first", "a-second"]);
  });

  it("does not write a partial batch when an id already exists", async () => {
    await appendEvent({ id: "existing", timestamp: 1, type: "account_created", entityId: "a", payload: accountPayload, masterKey: mkKey });

    await expect(appendEvents([
      { id: "new", timestamp: 2, type: "account_created", entityId: "b", payload: accountPayload, masterKey: mkKey },
      { id: "existing", timestamp: 3, type: "account_created", entityId: "c", payload: accountPayload, masterKey: mkKey },
    ])).rejects.toMatchObject({ code: "DUPLICATE_ID" });
    expect(fakeFinancialEvents.peek("new")).toBeUndefined();
  });

  it("rejects an entire batch when its validated snapshot is stale", async () => {
    await appendEvent({ id: "current", timestamp: 1, type: "account_created", entityId: "a", payload: accountPayload, masterKey: mkKey });

    await expect(appendEvents([
      { id: "one", timestamp: 2, type: "account_created", entityId: "b", payload: accountPayload, masterKey: mkKey, expectedLastEventId: "older" },
      { id: "two", timestamp: 2, type: "account_created", entityId: "c", payload: accountPayload, masterKey: mkKey, expectedLastEventId: "older" },
    ])).rejects.toMatchObject({ code: "STALE_SNAPSHOT" });
    expect(fakeFinancialEvents.peek("one")).toBeUndefined();
    expect(fakeFinancialEvents.peek("two")).toBeUndefined();
  });
});

describe("replaceAllEvents", () => {
  it("replaces the event log after every replacement event is sealed", async () => {
    await appendEvent({ id: "old", timestamp: 1, type: "account_created", entityId: "old", payload: accountPayload, masterKey: mkKey });

    await replaceAllEvents([
      { id: "new", timestamp: 2, type: "account_created", entityId: "new", payload: accountPayload, masterKey: mkKey },
    ]);

    expect(fakeFinancialEvents.peek("old")).toBeUndefined();
    expect(fakeFinancialEvents.peek("new")).toBeDefined();
    expect(fakeSnapshotClear).toHaveBeenCalledOnce();
    expect(fakeFxClear).not.toHaveBeenCalled();
  });

  it("atomically replaces FX rates when a version 2 backup supplies them", async () => {
    await replaceAllEvents([], [{
      id: "EUR/XOF",
      baseCurrency: "EUR",
      quoteCurrency: "XOF",
      rate: "655.957",
      lastUpdated: 1000,
      masterKey: mkKey,
    }]);

    expect(fakeFxClear).toHaveBeenCalledOnce();
    expect(fakeFxBulkAdd).toHaveBeenCalledWith([expect.objectContaining({
      id: "EUR/XOF",
      baseCurrency: "EUR",
      quoteCurrency: "XOF",
      lastUpdated: 1000,
    })]);
  });

  it("replaces the encrypted base-currency setting in the same transaction", async () => {
    await replaceAllEvents([], [], {
      id: "baseCurrency",
      value: "EUR",
      masterKey: mkKey,
    });

    expect(fakeSettingsClear).toHaveBeenCalledOnce();
    expect(fakeSettingsAdd).toHaveBeenCalledWith(expect.objectContaining({
      id: "baseCurrency",
      ciphertext: new Uint8Array([1, 2, 3]),
      iv: new Uint8Array([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]),
    }));
  });
});

describe("readAllEvents", () => {
  it("returns events in timestamp order", async () => {
    await appendEvent({ id: "e2", timestamp: 2000, type: "account_created", entityId: "a", payload: accountPayload, masterKey: mkKey });
    await appendEvent({ id: "e1", timestamp: 1000, type: "account_created", entityId: "b", payload: accountPayload, masterKey: mkKey });
    await appendEvent({ id: "e3", timestamp: 3000, type: "account_created", entityId: "c", payload: accountPayload, masterKey: mkKey });

    const events = await readAllEvents();
    expect(events.map((e) => e.id)).toEqual(["e1", "e2", "e3"]);
  });

  it("returns empty array when no events", async () => {
    const events = await readAllEvents();
    expect(events).toEqual([]);
  });
});

describe("readEventsSince", () => {
  it("returns events after the given event", async () => {
    await appendEvent({ id: "e1", timestamp: 1000, type: "account_created", entityId: "a", payload: accountPayload, masterKey: mkKey });
    await appendEvent({ id: "e2", timestamp: 2000, type: "account_created", entityId: "b", payload: accountPayload, masterKey: mkKey });
    await appendEvent({ id: "e3", timestamp: 3000, type: "account_created", entityId: "c", payload: accountPayload, masterKey: mkKey });

    const events = await readEventsSince("e1");
    expect(events.map((e) => e.id)).toEqual(["e2", "e3"]);
  });

  it("excludes the afterEventId event", async () => {
    await appendEvent({ id: "e1", timestamp: 1000, type: "account_created", entityId: "a", payload: accountPayload, masterKey: mkKey });
    await appendEvent({ id: "e2", timestamp: 1000, type: "account_created", entityId: "b", payload: accountPayload, masterKey: mkKey });

    const events = await readEventsSince("e1");
    expect(events.find((e) => e.id === "e1")).toBeUndefined();
  });

  it("returns only later ids when events share a timestamp", async () => {
    await appendEvent({ id: "a", timestamp: 1000, type: "account_created", entityId: "a", payload: accountPayload, masterKey: mkKey });
    await appendEvent({ id: "b", timestamp: 1000, type: "account_created", entityId: "b", payload: accountPayload, masterKey: mkKey });
    await appendEvent({ id: "c", timestamp: 1000, type: "account_created", entityId: "c", payload: accountPayload, masterKey: mkKey });

    const events = await readEventsSince("b");
    expect(events.map((event) => event.id)).toEqual(["c"]);
  });

  it("returns all events when afterEventId is not found", async () => {
    await appendEvent({ id: "e1", timestamp: 1000, type: "account_created", entityId: "a", payload: accountPayload, masterKey: mkKey });
    await appendEvent({ id: "e2", timestamp: 2000, type: "account_created", entityId: "b", payload: accountPayload, masterKey: mkKey });

    const events = await readEventsSince("nonexistent");
    expect(events.map((e) => e.id)).toEqual(["e1", "e2"]);
  });
});
