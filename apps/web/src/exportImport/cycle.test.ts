import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MasterKey } from "@/crypto/envelope.ts";

const {
  mockEventsToArray,
  mockEventsClear,
  mockSnapshotClear,
  mockSettingGet,
  mockSettingPut,
  mockTransaction,
  mockOpen,
  mockSeal,
  mockGetSnapshot,
  mockReadTransactions,
  mockExportJSON,
} = vi.hoisted(() => ({
  mockEventsToArray: vi.fn(),
  mockEventsClear: vi.fn(),
  mockSnapshotClear: vi.fn(),
  mockSettingGet: vi.fn(),
  mockSettingPut: vi.fn(),
  mockTransaction: vi.fn(),
  mockOpen: vi.fn(),
  mockSeal: vi.fn(),
  mockGetSnapshot: vi.fn(),
  mockReadTransactions: vi.fn(),
  mockExportJSON: vi.fn(),
}));

vi.mock("@/db/schema.ts", () => {
  const financialEvents = { toArray: mockEventsToArray, clear: mockEventsClear };
  const financialStateSnapshot = { clear: mockSnapshotClear };
  const appSettings = { get: mockSettingGet, put: mockSettingPut };
  return {
    db: {
      financialEvents,
      financialStateSnapshot,
      appSettings,
      transaction: mockTransaction,
    },
  };
});

vi.mock("@/crypto/envelope.ts", () => ({ open: mockOpen, seal: mockSeal }));
vi.mock("@/domain/financialState.ts", () => ({
  getSnapshot: mockGetSnapshot,
  readTransactionsInRange: mockReadTransactions,
}));
vi.mock("@/domain/eventStore.ts", () => ({
  compareFinancialEvents: (a: { id: string; timestamp: number }, b: { id: string; timestamp: number }) =>
    a.timestamp - b.timestamp || a.id.localeCompare(b.id),
}));
vi.mock("./index.ts", () => ({ exportJSON: mockExportJSON }));

import { closeFinancialCycle, prepareCycleArchive, readCycleHistory, type CycleArchiveReceipt } from "./cycle.ts";

const masterKey = {} as MasterKey;
const events = [
  { id: "event-1", timestamp: 1_700_000_000_000, type: "account_created" },
  { id: "event-2", timestamp: 1_700_100_000_000, type: "transaction_created" },
];

const snapshot = {
  baseCurrency: "XOF",
  accounts: [{
    id: "account-1", name: "Compte principal", type: "cash", currency: "XOF", isActive: true,
    initialBalance: { minorUnits: 100_000, currency: "XOF" },
    balance: { minorUnits: 75_000, currency: "XOF" },
  }],
  categories: [{ id: "category-1", name: "Transport" }],
  budgets: [],
  goals: [],
  totalBalance: { minorUnits: 75_000, currency: "XOF" },
  periodIncome: { minorUnits: 0, currency: "XOF" },
  periodExpenses: { minorUnits: 25_000, currency: "XOF" },
  netCashFlow: { minorUnits: -25_000, currency: "XOF" },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockEventsToArray.mockResolvedValue(events);
  mockSettingGet.mockResolvedValue(undefined);
  mockTransaction.mockImplementation(async (_mode: string, _tables: unknown[], callback: () => Promise<void>) => callback());
  mockSeal.mockResolvedValue({ ciphertext: new Uint8Array([1, 2, 3]), iv: new Uint8Array(12) });
  mockGetSnapshot.mockResolvedValue(snapshot);
  mockReadTransactions.mockResolvedValue([{
    id: "transaction-1",
    timestamp: 1_700_050_000_000,
    accountId: "account-1",
    categoryId: "category-1",
    direction: "expense",
    merchant: "Taxi",
    note: "Déplacement",
    tags: ["travail"],
    amount: { minorUnits: 25_000, currency: "XOF" },
    displayAmount: { minorUnits: 25_000, currency: "XOF" },
  }]);
  mockExportJSON.mockResolvedValue(new Blob(["encrypted-backup"], { type: "application/octet-stream" }));
});

describe("cycle archive preparation", () => {
  it("generates a restorable backup receipt and a real XLSX statement", async () => {
    const archive = await prepareCycleArchive(masterKey, "Activité 2026", "strong-passphrase", {
      id: "archive-1",
      now: 1_700_200_000_000,
      locale: "fr",
    });

    expect(mockExportJSON).toHaveBeenCalledWith(masterKey, true, "strong-passphrase");
    expect(archive).toMatchObject({
      version: 1,
      id: "archive-1",
      label: "Activité 2026",
      eventCount: 2,
      activityCount: 2,
      startedAt: events[0]!.timestamp,
      endedAt: events[1]!.timestamp,
      lastEventId: "event-2",
      backupFilename: "wisemoney-activite-2026-2023-11-17.wmexport",
      reportFilename: "wisemoney-activite-2026-2023-11-17.xlsx",
    });
    expect(archive.backupSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(archive.report.type).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    const signature = new Uint8Array(await archive.report.slice(0, 4).arrayBuffer());
    expect(String.fromCharCode(...signature)).toBe("PK\u0003\u0004");
  });

  it("does not create empty archives", async () => {
    mockEventsToArray.mockResolvedValue([]);

    await expect(prepareCycleArchive(masterKey, "Empty", "strong-passphrase"))
      .rejects.toThrow(/no financial data/);
    expect(mockExportJSON).not.toHaveBeenCalled();
  });
});

describe("cycle closure", () => {
  const receipt: CycleArchiveReceipt = {
    version: 1,
    id: "archive-1",
    label: "Activité 2026",
    archivedAt: 1_700_200_000_000,
    eventCount: 2,
    activityCount: 2,
    startedAt: events[0]!.timestamp,
    endedAt: events[1]!.timestamp,
    lastEventId: "event-2",
    backupSha256: "a".repeat(64),
    backupFilename: "wisemoney-activite-2026-2023-11-17.wmexport",
    reportFilename: "wisemoney-activite-2026-2023-11-17.xlsx",
  };

  it("atomically clears financial data and stores an encrypted receipt", async () => {
    let sealedHistory = "";
    mockSeal.mockImplementationOnce((plaintext: Uint8Array) => {
      sealedHistory = new TextDecoder().decode(plaintext);
      return Promise.resolve({ ciphertext: new Uint8Array([1, 2, 3]), iv: new Uint8Array(12) });
    });

    await closeFinancialCycle(masterKey, {
      ...receipt,
      backup: new Blob(["backup"]),
      report: new Blob(["report"]),
    } as CycleArchiveReceipt);

    expect(mockEventsClear).toHaveBeenCalledOnce();
    expect(mockSnapshotClear).toHaveBeenCalledOnce();
    expect(mockSettingPut).toHaveBeenCalledWith({
      id: "cycleHistory",
      ciphertext: new Uint8Array([1, 2, 3]),
      iv: new Uint8Array(12),
    });
    expect(JSON.parse(sealedHistory)).toEqual([receipt]);
  });

  it("refuses to reset when data changed after archive generation", async () => {
    mockEventsToArray.mockResolvedValue([...events, { id: "event-3", timestamp: 1_700_150_000_000, type: "transaction_created" }]);

    await expect(closeFinancialCycle(masterKey, receipt)).rejects.toThrow(/data changed/);
    expect(mockEventsClear).not.toHaveBeenCalled();
    expect(mockSnapshotClear).not.toHaveBeenCalled();
    expect(mockSettingPut).not.toHaveBeenCalled();
  });

  it("rejects corrupted encrypted history instead of discarding traceability", async () => {
    mockSettingGet.mockResolvedValue({ ciphertext: new Uint8Array([1]), iv: new Uint8Array(12) });
    mockOpen.mockResolvedValue(new TextEncoder().encode(JSON.stringify([{ version: 99 }])));

    await expect(readCycleHistory(masterKey)).rejects.toThrow(/invalid stored history/);
  });
});
