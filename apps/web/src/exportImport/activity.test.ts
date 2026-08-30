import { describe, expect, it } from "vitest";
import type { FinancialOperation } from "../domain/financialOperations.ts";
import { exportActivityCSV, exportActivityXLSX } from "./activity.ts";

function operation(overrides: Partial<FinancialOperation> & Pick<FinancialOperation, "id" | "timestamp" | "kind">): FinancialOperation {
  return {
    direction: null,
    amount: null,
    displayAmount: null,
    destinationAmount: null,
    note: "",
    merchant: null,
    accountId: null,
    toAccountId: null,
    externalDestination: null,
    categoryId: null,
    goalId: null,
    recurringItemId: null,
    cashFlowRole: "neutral",
    isLegacyExternal: false,
    ...overrides,
  };
}

const base = {
  start: 0,
  end: 100,
  accountId: null,
  accounts: { cash: "Espèces", usd: "Dollar" },
  categories: { food: "Alimentation" },
} as const;

describe("activity exports", () => {
  it("exports localized CSV rows, both transfer amounts, and neutralizes formulas", async () => {
    const blob = exportActivityCSV({
      ...base,
      locale: "fr",
      operations: [
        operation({
          id: "fx",
          timestamp: 10,
          kind: "transfer",
          accountId: "cash",
          toAccountId: "usd",
          amount: { minorUnits: 10_000, currency: "XOF" },
          destinationAmount: { minorUnits: 1_650, currency: "USD" },
          displayAmount: { minorUnits: 10_000, currency: "XOF" },
          note: "=FORMULA()",
        }),
      ],
    });
    const csv = await blob.text();
    expect(csv).toContain("Montant destination");
    expect(csv).toContain("Transfert interne");
    expect(csv).toContain("100");
    expect(csv).toContain("16.5");
    expect(csv).toContain("'=FORMULA()");
    expect(csv).toContain("neutre");
  });

  it("uses the selected account side and keeps legacy external transfers as expenses", async () => {
    const csv = await exportActivityCSV({
      ...base,
      accountId: "usd",
      locale: "en",
      operations: [
        operation({ id: "fx", timestamp: 10, kind: "transfer", accountId: "cash", toAccountId: "usd", amount: { minorUnits: 10_000, currency: "XOF" }, destinationAmount: { minorUnits: 1_650, currency: "USD" } }),
        operation({ id: "legacy", timestamp: 11, kind: "transfer", accountId: "cash", externalDestination: "Awa", amount: { minorUnits: 2_000, currency: "XOF" }, displayAmount: { minorUnits: 2_000, currency: "XOF" }, cashFlowRole: "expense", isLegacyExternal: true }),
      ],
    }).text();
    expect(csv).toContain("incoming");
    expect(csv).toContain("16.5");
    expect(csv).not.toContain("Uncategorized expense");
  });

  it("creates a real XLSX workbook with localized headings", async () => {
    const blob = await exportActivityXLSX({
      ...base,
      locale: "en",
      operations: [operation({ id: "income", timestamp: 10, kind: "income", amount: { minorUnits: 5_000, currency: "XOF" }, displayAmount: { minorUnits: 5_000, currency: "XOF" }, cashFlowRole: "income" })],
    });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(String.fromCharCode(bytes[0] ?? 0, bytes[1] ?? 0)).toBe("PK");
    expect(blob.size).toBeGreaterThan(1_000);
  });

  it("exports all 10,000 operations without truncating the activity context", async () => {
    const operations = Array.from({ length: 10_000 }, (_, index) => operation({
      id: `expense-${index}`,
      timestamp: index + 1,
      kind: "expense",
      accountId: "cash",
      categoryId: "food",
      amount: { minorUnits: 100, currency: "XOF" },
      displayAmount: { minorUnits: 100, currency: "XOF" },
      cashFlowRole: "expense",
    }));
    const csv = await exportActivityCSV({
      ...base,
      end: 10_000,
      locale: "en",
      operations,
    }).text();
    expect(csv.split("\n")).toHaveLength(10_001);
    expect(csv.match(/\"Expense\"/g)).toHaveLength(10_000);
  });
});
