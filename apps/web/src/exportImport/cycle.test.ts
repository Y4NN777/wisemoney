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

import {
  closeFinancialCycle,
  createDebtCreditReportSheet,
  createPlannedExpenseReportSheet,
  prepareCycleArchive,
  readCycleHistory,
  type CycleArchiveReceipt,
} from "./cycle.ts";

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
  plannedExpenses: [{
    id: "planned-1",
    label: "Révision moto",
    priority: "high" as const,
    estimatedAmount: { minorUnits: 12_500, currency: "XOF" },
    categoryId: "category-1",
    dueDate: 1_700_150_000_000,
    note: "Avant le trajet",
    status: "pending" as const,
    createdAt: 1_700_025_000_000,
    updatedAt: 1_700_025_000_000,
    completedAt: null,
    cancelledAt: null,
    transactionId: null,
    completedAccountId: null,
    actualAmount: null,
  }],
  debtCredits: [{
    id: "debt-1",
    kind: "debt" as const,
    partyName: "Coopérative",
    motive: "Matériel",
    amount: { minorUnits: 30_000, currency: "XOF" },
    date: 1_700_010_000_000,
    dueDate: 1_700_190_000_000,
    status: "partial" as const,
  }],
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
  it("builds a bilingual debt and receivable sheet including due dates", () => {
    const frenchSheet = createDebtCreditReportSheet(snapshot.debtCredits, "fr");
    const englishSheet = createDebtCreditReportSheet(snapshot.debtCredits, "en");

    expect(frenchSheet.sheet).toBe("Dettes & Créances");
    expect(frenchSheet.data[0]!.map((cell) => cell.value)).toEqual([
      "Type", "Personne", "Motif", "Montant", "Date", "Échéance", "Statut",
    ]);
    expect(frenchSheet.data[1]![0]!.value).toBe("Dette");
    expect(frenchSheet.data[1]![1]!.value).toBe("Coopérative");
    expect(frenchSheet.data[1]![5]!.value).not.toBe("—");
    expect(frenchSheet.data[1]![6]!.value).toBe("Partiellement payé");

    expect(englishSheet.sheet).toBe("Debts & Receivables");
    expect(englishSheet.data[1]![0]!.value).toBe("Debt");
    expect(englishSheet.data[1]![6]!.value).toBe("Partially paid");
  });

  it("builds a bilingual planned-expense sheet with estimated and actual values", () => {
    const completed = {
      ...snapshot.plannedExpenses[0]!,
      status: "completed" as const,
      priority: "medium" as const,
      actualAmount: { minorUnits: 13_000, currency: "XOF" },
      completedAt: 1_700_180_000_000,
    };

    const frenchSheet = createPlannedExpenseReportSheet(
      [snapshot.plannedExpenses[0]!, completed],
      "fr",
    );
    const englishSheet = createPlannedExpenseReportSheet([completed], "en");

    expect(frenchSheet.sheet).toBe("Dépenses prévues");
    expect(frenchSheet.data[0]!.map((cell) => cell.value)).toEqual([
      "Libellé", "Priorité", "Montant estimé", "Échéance", "Statut", "Montant réel", "Date de réalisation",
    ]);
    expect(frenchSheet.data[1]![0]!.value).toBe("Révision moto");
    expect(frenchSheet.data[1]![1]!.value).toBe("Haute");
    expect(frenchSheet.data[1]![4]!.value).toBe("En attente");
    expect(frenchSheet.data[1]![5]!.value).toBe("—");
    expect(frenchSheet.data[1]![6]!.value).toBe("—");
    expect(frenchSheet.data[2]![1]!.value).toBe("Moyenne");
    expect(frenchSheet.data[2]![4]!.value).toBe("Réalisée");
    expect(String(frenchSheet.data[2]![5]!.value)).toContain("13");

    expect(englishSheet.sheet).toBe("Planned expenses");
    expect(englishSheet.data[0]!.map((cell) => cell.value)).toEqual([
      "Label", "Priority", "Estimated amount", "Due date", "Status", "Actual amount", "Completion date",
    ]);
    expect(englishSheet.data[1]![1]!.value).toBe("Medium");
    expect(englishSheet.data[1]![4]!.value).toBe("Completed");
  });

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

  it("does not clear the cycle when readable report generation fails", async () => {
    mockGetSnapshot.mockRejectedValueOnce(new Error("report failed"));

    await expect(prepareCycleArchive(masterKey, "Activité 2026", "strong-passphrase"))
      .rejects.toThrow("report failed");

    expect(mockExportJSON).toHaveBeenCalledOnce();
    expect(mockEventsClear).not.toHaveBeenCalled();
    expect(mockSnapshotClear).not.toHaveBeenCalled();
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
    backupSha256: "54d00d867758cef816bc4685f58e327b949712b07ebd17c3485f3ffc9e9f5133",
    backupFilename: "wisemoney-activite-2026-2023-11-17.wmexport",
    reportFilename: "wisemoney-activite-2026-2023-11-17.xlsx",
  };
  const preparedReceipt = {
    ...receipt,
    backup: new Blob(["backup"]),
    report: new Blob(["PK\u0003\u0004report"]),
  };

  it("atomically clears financial data and stores an encrypted receipt", async () => {
    let sealedHistory = "";
    mockSeal.mockImplementationOnce((plaintext: Uint8Array) => {
      sealedHistory = new TextDecoder().decode(plaintext);
      return Promise.resolve({ ciphertext: new Uint8Array([1, 2, 3]), iv: new Uint8Array(12) });
    });

    await closeFinancialCycle(masterKey, preparedReceipt);

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

    await expect(closeFinancialCycle(masterKey, preparedReceipt)).rejects.toThrow(/data changed/);
    expect(mockEventsClear).not.toHaveBeenCalled();
    expect(mockSnapshotClear).not.toHaveBeenCalled();
    expect(mockSettingPut).not.toHaveBeenCalled();
  });

  it("refuses to reset without the successfully generated backup and report", async () => {
    await expect(closeFinancialCycle(masterKey, {
      ...preparedReceipt,
      report: new Blob(["not an xlsx"]),
    })).rejects.toThrow(/invalid XLSX report/);

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
