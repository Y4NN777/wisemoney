import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FinancialEventRecord } from "@/db/schema.ts";
import type { MasterKey, EncryptedEnvelope } from "@/crypto/envelope.ts";

const { fakeFinancialEvents, fakeSeal } = vi.hoisted(() => {
  type AnyRecord = { id: string };
  class FakeTable<T extends AnyRecord> {
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
  return { fakeFinancialEvents, fakeSeal };
});

vi.mock("@/db/schema.ts", () => ({
  db: { financialEvents: fakeFinancialEvents },
}));

vi.mock("@/crypto/envelope.ts", () => ({
  seal: fakeSeal,
}));

import { appendEvent, readAllEvents, readEventsSince, AppendEventError } from "./eventStore.ts";

function makeMasterKey(): MasterKey {
  return { _brand: "MasterKey" as const, key: null as unknown as CryptoKey };
}

const mkKey = makeMasterKey();

beforeEach(() => {
  fakeFinancialEvents.clear();
  fakeSeal.mockReset();
  fakeSeal.mockResolvedValue({
    ciphertext: new Uint8Array([1, 2, 3]),
    iv: new Uint8Array([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]),
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
    const callArg = fakeSeal.mock.calls[0]![0]! as Uint8Array;
    const decoded = JSON.parse(new TextDecoder().decode(callArg)) as Record<string, unknown>;
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
      payload: {},
      masterKey: mkKey,
    });

    await expect(
      appendEvent({
        id: "dup",
        timestamp: 2000,
        type: "transaction_created",
        entityId: "a",
        payload: {},
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
      payload: {},
      masterKey: mkKey,
    });

    try {
      await appendEvent({
        id: "dup2",
        timestamp: 2000,
        type: "transaction_created",
        entityId: "a",
        payload: {},
        masterKey: mkKey,
      });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(AppendEventError);
      expect((err as AppendEventError).code).toBe("DUPLICATE_ID");
      expect((err as AppendEventError).eventId).toBe("dup2");
    }
  });
});

describe("readAllEvents", () => {
  it("returns events in timestamp order", async () => {
    await appendEvent({ id: "e2", timestamp: 2000, type: "account_created", entityId: "a", payload: {}, masterKey: mkKey });
    await appendEvent({ id: "e1", timestamp: 1000, type: "account_created", entityId: "b", payload: {}, masterKey: mkKey });
    await appendEvent({ id: "e3", timestamp: 3000, type: "account_created", entityId: "c", payload: {}, masterKey: mkKey });

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
    await appendEvent({ id: "e1", timestamp: 1000, type: "account_created", entityId: "a", payload: {}, masterKey: mkKey });
    await appendEvent({ id: "e2", timestamp: 2000, type: "transaction_created", entityId: "b", payload: {}, masterKey: mkKey });
    await appendEvent({ id: "e3", timestamp: 3000, type: "transaction_created", entityId: "c", payload: {}, masterKey: mkKey });

    const events = await readEventsSince("e1");
    expect(events.map((e) => e.id)).toEqual(["e2", "e3"]);
  });

  it("excludes the afterEventId event", async () => {
    await appendEvent({ id: "e1", timestamp: 1000, type: "account_created", entityId: "a", payload: {}, masterKey: mkKey });
    await appendEvent({ id: "e2", timestamp: 1000, type: "transaction_created", entityId: "b", payload: {}, masterKey: mkKey });

    const events = await readEventsSince("e1");
    expect(events.find((e) => e.id === "e1")).toBeUndefined();
  });

  it("returns all events when afterEventId is not found", async () => {
    await appendEvent({ id: "e1", timestamp: 1000, type: "account_created", entityId: "a", payload: {}, masterKey: mkKey });
    await appendEvent({ id: "e2", timestamp: 2000, type: "transaction_created", entityId: "b", payload: {}, masterKey: mkKey });

    const events = await readEventsSince("nonexistent");
    expect(events.map((e) => e.id)).toEqual(["e1", "e2"]);
  });
});
