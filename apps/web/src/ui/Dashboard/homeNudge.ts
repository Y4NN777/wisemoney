import type { FinancialStateSnapshot, MoneyDTO } from "../../domain/financialState.ts";
import type { FinancialOperation } from "../../domain/financialOperations.ts";
import { nextRecurringDue } from "../../reminders/index.ts";

/**
 * The one line under the Home greeting (G1, 2026-10-17): computed from the user's own data, with one
 * action. The first rule that applies wins, so the same data always gives the same line:
 *   1. something to pay today or overdue (planned expense, recurring item, debt);
 *   2. a receivable due within three days, or overdue;
 *   3. nothing recorded today;
 *   4. otherwise, today's spending.
 * Budgets are left to the attention card, which already shows thresholds.
 */
export type HomeNudge =
  | { kind: "due"; label: string; overdue: boolean; more: number; href: "/planned-expenses" | "/recurring" | "/debts" }
  | { kind: "receivable"; party: string; amount: MoneyDTO; days: number }
  | { kind: "nothingToday" }
  | { kind: "today"; count: number; spent: MoneyDTO };

const DAY_MS = 24 * 60 * 60 * 1000;
const RECEIVABLE_HORIZON_DAYS = 3;

function startOfDay(now: number): number {
  const date = new Date(now);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

type Due = { label: string; dueAt: number; href: "/planned-expenses" | "/recurring" | "/debts" };

function dueItems(snapshot: FinancialStateSnapshot, now: number, endOfToday: number): Due[] {
  const items: Due[] = [];
  for (const item of snapshot.plannedExpenses) {
    if (item.status === "pending" && item.dueDate != null && item.dueDate <= endOfToday) items.push({ label: item.label, dueAt: item.dueDate, href: "/planned-expenses" });
  }
  for (const item of snapshot.recurringItems) {
    if (item.isArchived) continue;
    const dueAt = nextRecurringDue(item.frequency, item.startDate, item.lastRealised, now);
    if (dueAt != null && dueAt <= endOfToday) items.push({ label: item.label, dueAt, href: "/recurring" });
  }
  for (const item of snapshot.debtCredits) {
    if (item.kind === "debt" && item.status !== "settled" && item.dueDate != null && item.dueDate <= endOfToday) {
      items.push({ label: item.partyName, dueAt: item.dueDate, href: "/debts" });
    }
  }
  return items.sort((left, right) => left.dueAt - right.dueAt || left.label.localeCompare(right.label));
}

export function homeNudge(snapshot: FinancialStateSnapshot, operations: readonly FinancialOperation[], now: number): HomeNudge {
  const today = startOfDay(now);
  const endOfToday = today + DAY_MS - 1;

  const due = dueItems(snapshot, now, endOfToday);
  const [first] = due;
  if (first != null) return { kind: "due", label: first.label, overdue: first.dueAt < today, more: due.length - 1, href: first.href };

  const receivable = snapshot.debtCredits
    .filter((item) => item.kind === "receivable" && item.status !== "settled" && item.dueDate != null && item.dueDate <= today + RECEIVABLE_HORIZON_DAYS * DAY_MS + DAY_MS - 1)
    .sort((left, right) => (left.dueDate ?? 0) - (right.dueDate ?? 0))[0];
  if (receivable?.dueDate != null) {
    return { kind: "receivable", party: receivable.partyName, amount: receivable.amount, days: Math.floor((startOfDay(receivable.dueDate) - today) / DAY_MS) };
  }

  const todays = operations.filter((operation) => operation.timestamp >= today && operation.timestamp <= endOfToday && operation.direction != null);
  if (todays.length === 0) return { kind: "nothingToday" };
  const spending = todays.filter((operation) => operation.direction === "expense");
  const spent = spending.reduce((sum, operation) => sum + ((operation.displayAmount ?? operation.amount)?.minorUnits ?? 0), 0);
  return { kind: "today", count: spending.length, spent: { minorUnits: spent, currency: snapshot.baseCurrency } };
}
