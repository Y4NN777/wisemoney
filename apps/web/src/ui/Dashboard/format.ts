

import type { } from "../../domain/financialOperations.ts";

import type { } from "../../pillars/intelligence/index.ts";

import { formatMoney as formatMoneyValue } from "../../types/money.ts";

export function formatMoney(minorUnits: number, currency: string): string {
  return formatMoneyValue({ minorUnits, currency });
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(document.documentElement.lang || undefined, { month: "short", day: "numeric" });
}

export function computePrevPeriod(year: number, month: number): { year: number; month: number } {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

export function formatSignedMoney(minorUnits: number, currency: string): string {
  if (minorUnits === 0) return formatMoney(0, currency);
  return `${minorUnits > 0 ? "+" : "−"}${formatMoney(Math.abs(minorUnits), currency)}`;
}
