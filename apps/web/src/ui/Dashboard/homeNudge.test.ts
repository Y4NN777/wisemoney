import { describe, expect, it } from "vitest";
import type { FinancialStateSnapshot } from "../../domain/financialState.ts";
import type { FinancialOperation } from "../../domain/financialOperations.ts";
import { homeNudge } from "./homeNudge.ts";

const NOW = new Date(2026, 9, 17, 12, 0).getTime();
const DAY = 24 * 60 * 60 * 1000;
const XOF = (minorUnits: number) => ({ minorUnits, currency: "XOF" });

function snapshot(parts: Partial<FinancialStateSnapshot> = {}): FinancialStateSnapshot {
  return { baseCurrency: "XOF", plannedExpenses: [], recurringItems: [], debtCredits: [], ...parts } as unknown as FinancialStateSnapshot;
}
const debt = (kind: "debt" | "receivable", partyName: string, dueDate: number | null, status = "pending") =>
  ({ id: partyName, kind, partyName, motive: "", amount: XOF(12_500), date: NOW - 10 * DAY, status, dueDate });
const op = (timestamp: number, direction: "income" | "expense", minorUnits: number) =>
  ({ id: String(timestamp), timestamp, direction, amount: XOF(minorUnits), displayAmount: XOF(minorUnits) }) as unknown as FinancialOperation;

describe("home nudge", () => {
  it("puts something to pay today first, and says how many more", () => {
    const state = snapshot({
      plannedExpenses: [{ label: "Loyer", status: "pending", dueDate: NOW } as never],
      debtCredits: [debt("debt", "Issa", NOW + 1000) as never, debt("receivable", "Awa", NOW + DAY) as never],
    });
    expect(homeNudge(state, [], NOW)).toEqual({ kind: "due", label: "Loyer", overdue: false, more: 1, href: "/planned-expenses" });
  });

  it("says overdue for a past due date", () => {
    const state = snapshot({ debtCredits: [debt("debt", "Issa", NOW - 3 * DAY) as never] });
    expect(homeNudge(state, [], NOW)).toMatchObject({ kind: "due", label: "Issa", overdue: true, href: "/debts" });
  });

  it("then a receivable due within three days, with the days left", () => {
    const state = snapshot({ debtCredits: [debt("receivable", "Awa", NOW + 2 * DAY) as never, debt("receivable", "Moussa", NOW + 9 * DAY) as never] });
    expect(homeNudge(state, [], NOW)).toEqual({ kind: "receivable", party: "Awa", amount: XOF(12_500), days: 2 });
  });

  it("ignores settled items", () => {
    const state = snapshot({ debtCredits: [debt("debt", "Issa", NOW, "settled") as never] });
    expect(homeNudge(state, [], NOW).kind).toBe("nothingToday");
  });

  it("then nothing recorded today, otherwise today's spending", () => {
    expect(homeNudge(snapshot(), [op(NOW - DAY, "expense", 500)], NOW)).toEqual({ kind: "nothingToday" });
    expect(homeNudge(snapshot(), [op(NOW - 1000, "expense", 500), op(NOW - 2000, "expense", 250), op(NOW - 3000, "income", 9000)], NOW))
      .toEqual({ kind: "today", count: 2, spent: XOF(750) });
  });
});
