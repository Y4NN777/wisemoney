import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MasterKey } from "@/crypto/envelope.ts";

const {
  mockToArray, mockOpen, mockIsFinancialEventType, mockReplaceAllEvents,
  mockValidateSequence, mockValidatePayload, mockLoadCurrencyContext,
  mockReplay, mockPersist,
  mockSeal, mockDeriveMasterKey,
} = vi.hoisted(() => ({
  mockToArray: vi.fn(),
  mockOpen: vi.fn(),
  mockIsFinancialEventType: vi.fn(),
  mockReplaceAllEvents: vi.fn(),
  mockValidateSequence: vi.fn(),
  mockValidatePayload: vi.fn(),
  mockLoadCurrencyContext: vi.fn(),
  mockReplay: vi.fn(),
  mockPersist: vi.fn(),
  mockSeal: vi.fn(),
  mockDeriveMasterKey: vi.fn(),
}));

vi.mock("@/domain/financialState.ts", () => ({
  persistSnapshot: mockPersist,
  replayFromInception: mockReplay,
  validateDecryptedEventSequence: mockValidateSequence,
}));

vi.mock("@/db/schema.ts", () => ({
  db: { financialEvents: { orderBy: () => ({ toArray: mockToArray }) } },
}));

vi.mock("@/crypto/envelope.ts", () => ({ open: mockOpen, seal: mockSeal }));
vi.mock("@/crypto/keyManagement.ts", () => ({ deriveMasterKey: mockDeriveMasterKey }));
vi.mock("@/domain/eventStore.ts", () => ({
  isFinancialEventType: mockIsFinancialEventType,
  replaceAllEvents: mockReplaceAllEvents,
}));
vi.mock("@/domain/currencyStore.ts", () => ({
  loadCurrencyContext: mockLoadCurrencyContext,
}));
vi.mock("@/domain/eventPayload.ts", () => ({ validateFinancialEventPayload: mockValidatePayload }));

import { exportCSV, exportJSON, exportXLSX, importJSON } from "./index.ts";

const masterKey = {} as MasterKey;

beforeEach(() => {
  mockToArray.mockReset();
  mockOpen.mockReset();
  mockIsFinancialEventType.mockReset();
  mockReplaceAllEvents.mockReset();
  mockValidateSequence.mockReset();
  mockValidatePayload.mockReset();
  mockLoadCurrencyContext.mockReset();
  mockReplay.mockReset();
  mockPersist.mockReset();
  mockSeal.mockReset();
  mockDeriveMasterKey.mockReset();
  mockToArray.mockResolvedValue([{
    id: "=FORMULA()",
    timestamp: 1_700_000_000_000,
    type: "debt_credit_created",
    entityId: "debt-1",
    ciphertext: new Uint8Array([1]),
    iv: new Uint8Array(12),
  }]);
  mockOpen.mockResolvedValue(new TextEncoder().encode(JSON.stringify({
    kind: "debt",
    partyName: "Lender",
    motive: "Equipment",
    amount: { minorUnits: 1250, currency: "XOF" },
    date: 1_700_000_000_000,
    status: "pending",
  })));
  mockIsFinancialEventType.mockReturnValue(true);
  mockLoadCurrencyContext.mockResolvedValue({ baseCurrency: "XOF", rates: new Map(), fingerprint: "XOF" });
  mockReplay.mockResolvedValue({ snapshot: true });
  mockSeal.mockResolvedValue({ ciphertext: new Uint8Array([1, 2, 3]), iv: new Uint8Array(12).fill(4) });
  mockDeriveMasterKey.mockResolvedValue({ masterKey, salt: new Uint8Array(16).fill(5) });
});

describe("lossless import", () => {
  const event = {
    id: "event-1",
    timestamp: 1_700_000_000_000,
    type: "debt_credit_created",
    entityId: "debt-1",
    payload: { motive: "Equipment" },
  };

  function exportBlob(overrides: Record<string, unknown> = {}): Blob {
    return new Blob([JSON.stringify({
      version: 1,
      exportedAt: 1_700_000_000_000,
      financialEvents: [event],
      ...overrides,
    })], { type: "application/json" });
  }

  it("rejects malformed documents before replacing local events", async () => {
    await expect(importJSON(exportBlob({ version: 3 }), masterKey)).rejects.toThrow(/invalid export structure/);
    expect(mockReplaceAllEvents).not.toHaveBeenCalled();
  });

  it("rejects inconsistent event sequences before replacing local events", async () => {
    mockValidateSequence.mockImplementation(() => { throw new Error("missing account"); });

    await expect(importJSON(exportBlob(), masterKey)).rejects.toThrow(/sequence is inconsistent/);
    expect(mockReplaceAllEvents).not.toHaveBeenCalled();
  });

  it("replaces, replays, and persists only after complete validation", async () => {
    await importJSON(exportBlob(), masterKey);

    expect(mockValidatePayload).toHaveBeenCalledWith(event.type, event.payload);
    expect(mockValidateSequence).toHaveBeenCalledWith([event]);
    expect(mockReplaceAllEvents).toHaveBeenCalledWith([{ ...event, masterKey }]);
    expect(mockReplay).toHaveBeenCalled();
    expect(mockPersist).toHaveBeenCalledWith({ snapshot: true }, masterKey);
  });

  it("restores planned expenses through journal validation and replay", async () => {
    const plannedEvent = {
      id: "planned-event-1",
      timestamp: 1_700_000_000_000,
      type: "planned_expense_created",
      entityId: "planned-1",
      payload: {
        label: "Révision moto",
        estimatedAmount: { minorUnits: 12_500, currency: "XOF" },
        categoryId: "category-1",
        priority: "high",
        dueDate: null,
        note: "",
      },
    };

    await importJSON(exportBlob({ financialEvents: [plannedEvent] }), masterKey);

    expect(mockValidatePayload).toHaveBeenCalledWith(plannedEvent.type, plannedEvent.payload);
    expect(mockValidateSequence).toHaveBeenCalledWith([plannedEvent]);
    expect(mockReplaceAllEvents).toHaveBeenCalledWith([{ ...plannedEvent, masterKey }]);
    expect(mockReplay).toHaveBeenCalled();
    expect(mockPersist).toHaveBeenCalledWith({ snapshot: true }, masterKey);
  });

  it("validates encrypted envelope parameters before deriving or decrypting", async () => {
    const encrypted = new Blob([JSON.stringify({
      ciphertext: [1],
      iv: Array(12).fill(1),
      salt: Array(16).fill(1),
      params: { memory: 1, iterations: 1, parallelism: 1 },
    })]);

    await expect(importJSON(encrypted, masterKey, "passphrase")).rejects.toThrow(/unsupported encrypted export parameters/);
    expect(mockOpen).not.toHaveBeenCalled();
    expect(mockReplaceAllEvents).not.toHaveBeenCalled();
  });

  it("imports compact base64 encrypted envelopes", async () => {
    mockOpen.mockResolvedValueOnce(new TextEncoder().encode(JSON.stringify({
      version: 1,
      exportedAt: 1_700_000_000_000,
      financialEvents: [event],
    })));
    const encrypted = new Blob([JSON.stringify({
      version: 2,
      encoding: "base64",
      ciphertext: "AQID",
      iv: "BAQEBAQEBAQEBAQE",
      salt: "BQUFBQUFBQUFBQUFBQUFBQ==",
      params: { memory: 65536, iterations: 3, parallelism: 2 },
    })]);

    await importJSON(encrypted, masterKey, "passphrase");

    expect(mockReplaceAllEvents).toHaveBeenCalledWith([{ ...event, masterKey }]);
  });

  it("restores version 2 currency settings and rates", async () => {
    const blob = exportBlob({
      version: 2,
      baseCurrency: "EUR",
      fxRates: [{
        id: "EUR/XOF", baseCurrency: "EUR", quoteCurrency: "XOF",
        rate: "655.957", lastUpdated: 1_700_000_000_000,
      }],
    });

    await importJSON(blob, masterKey);

    expect(mockReplaceAllEvents).toHaveBeenCalledWith(
      [{ ...event, masterKey }],
      [{
        id: "EUR/XOF", baseCurrency: "EUR", quoteCurrency: "XOF",
        rate: "655.957", lastUpdated: 1_700_000_000_000, masterKey,
      }],
      { id: "baseCurrency", value: "EUR", masterKey },
    );
  });
});

describe("human-readable exports", () => {
  it("includes debt due-date updates in the lossless backup", async () => {
    mockToArray.mockResolvedValueOnce([{
      id: "debt-due-event",
      timestamp: 1_700_000_000_000,
      type: "debt_credit_due_date_updated",
      entityId: "debt-1",
      ciphertext: new Uint8Array([1]),
      iv: new Uint8Array(12),
    }]);
    mockOpen.mockResolvedValueOnce(new TextEncoder().encode(JSON.stringify({
      debtCreditId: "debt-1",
      dueDate: 1_800_000_000_000,
    })));

    const document = JSON.parse(await (await exportJSON(masterKey, false)).text()) as {
      financialEvents: Array<Record<string, unknown>>;
    };

    expect(document.financialEvents[0]).toMatchObject({
      type: "debt_credit_due_date_updated",
      payload: { debtCreditId: "debt-1", dueDate: 1_800_000_000_000 },
    });
  });

  it("includes pending planned-expense events in the lossless backup", async () => {
    mockToArray.mockResolvedValueOnce([{
      id: "planned-event-1",
      timestamp: 1_700_000_000_000,
      type: "planned_expense_created",
      entityId: "planned-1",
      ciphertext: new Uint8Array([1]),
      iv: new Uint8Array(12),
    }]);
    mockOpen.mockResolvedValueOnce(new TextEncoder().encode(JSON.stringify({
      label: "Révision moto",
      estimatedAmount: { minorUnits: 12_500, currency: "XOF" },
      categoryId: "category-1",
      priority: "high",
      dueDate: null,
      note: "",
    })));

    const document = JSON.parse(await (await exportJSON(masterKey, false)).text()) as {
      financialEvents: Array<Record<string, unknown>>;
    };

    expect(document.financialEvents).toHaveLength(1);
    expect(document.financialEvents[0]).toMatchObject({
      id: "planned-event-1",
      type: "planned_expense_created",
      entityId: "planned-1",
      payload: { label: "Révision moto", priority: "high" },
    });
  });

  it("includes currency settings in lossless version 2 exports", async () => {
    mockLoadCurrencyContext.mockResolvedValue({
      baseCurrency: "EUR",
      fingerprint: "EUR|EUR/XOF:1:655.957",
      rates: new Map([["EUR/XOF", {
        id: "EUR/XOF", baseCurrency: "EUR", quoteCurrency: "XOF",
        rate: "655.957", lastUpdated: 1,
      }]]),
    });

    const document = JSON.parse(await (await exportJSON(masterKey, false)).text()) as Record<string, unknown>;

    expect(document).toMatchObject({
      version: 2,
      baseCurrency: "EUR",
      fxRates: [{ id: "EUR/XOF", rate: "655.957" }],
    });
  });

  it("uses compact base64 for encrypted export envelopes", async () => {
    const envelope = JSON.parse(await (await exportJSON(masterKey, true, "backup-passphrase")).text()) as Record<string, unknown>;

    expect(envelope).toMatchObject({ version: 2, encoding: "base64" });
    expect(envelope.ciphertext).toBe("AQID");
    expect(envelope.iv).toBe("BAQEBAQEBAQEBAQE");
    expect(envelope.salt).toBe("BQUFBQUFBQUFBQUFBQUFBQ==");
  });

  it("neutralizes spreadsheet formulas in CSV cells", async () => {
    const csv = await (await exportCSV(masterKey)).text();
    expect(csv).toContain(`"'=FORMULA()"`);
    expect(csv).toContain("debt_credit_created");
    expect(csv).toContain("Equipment");
  });

  it("emits a real OOXML workbook rather than HTML disguised as XLSX", async () => {
    const blob = await exportXLSX(masterKey);
    const bytes = new Uint8Array(await blob.arrayBuffer());

    expect(blob.type).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("PK\u0003\u0004");
    expect(new TextDecoder().decode(bytes.slice(0, 20))).not.toContain("<html");
  });
});
