import { describe, expect, it } from "vitest";

import type { DebtCreditState } from "@/domain/financialState.ts";
import { createDebtCreditCalendar, parseOptionalDueDate } from "./index.tsx";

describe("parseOptionalDueDate", () => {
  it("treats an empty field as no due date", () => {
    expect(parseOptionalDueDate("")).toBeNull();
  });

  it("parses a local calendar date without shifting the day", () => {
    const timestamp = parseOptionalDueDate("2026-08-31");
    expect(timestamp).toBeTypeOf("number");
    expect(timestamp == null ? null : new Date(timestamp).getFullYear()).toBe(2026);
    expect(timestamp == null ? null : new Date(timestamp).getMonth()).toBe(7);
    expect(timestamp == null ? null : new Date(timestamp).getDate()).toBe(31);
  });

  it("distinguishes invalid input from an intentionally empty field", () => {
    expect(parseOptionalDueDate("not-a-date")).toBeUndefined();
  });
});

describe("createDebtCreditCalendar", () => {
  const item: DebtCreditState = {
    id: "debt-1",
    kind: "debt",
    partyName: "Coopérative",
    motive: "Matériel agricole",
    amount: { minorUnits: 99_999_999, currency: "XOF" },
    date: new Date(2026, 7, 1, 12).getTime(),
    dueDate: new Date(2026, 7, 31, 12).getTime(),
    status: "pending",
  };

  it("creates an amount-free calendar item with a seven-day alarm", () => {
    const calendar = createDebtCreditCalendar(item, "fr");

    expect(calendar.content).toContain("SUMMARY:Rappel WiseMoney: Coopérative: Matériel agricole");
    expect(calendar.content).toContain("TRIGGER:-PT10080M");
    expect(calendar.content).not.toContain("99999999");
    expect(calendar.content).not.toContain("XOF");
  });

  it("requires a due date", () => {
    expect(() => createDebtCreditCalendar({ ...item, dueDate: null }, "en")).toThrow(/no due date/);
  });
});
