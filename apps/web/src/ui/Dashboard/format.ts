

import type { } from "../../domain/financialOperations.ts";

import type { } from "../../pillars/intelligence/index.ts";

import { formatMoney as formatMoneyValue } from "../../types/money.ts";

export function formatMoney(minorUnits: number, currency: string): string {
  return formatMoneyValue({ minorUnits, currency });
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(document.documentElement.lang || undefined, { month: "short", day: "numeric" });
}

export function formatFilterDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(document.documentElement.lang || undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function formatFilterRange(start: number, end: number): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (startDate.toDateString() === endDate.toDateString()) return formatFilterDate(end);
  const locale = document.documentElement.lang || undefined;
  const startLabel = startDate.toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: startDate.getFullYear() === endDate.getFullYear() ? undefined : "numeric",
  });
  return `${startLabel} – ${formatFilterDate(end)}`;
}

export function computePrevPeriod(year: number, month: number): { year: number; month: number } {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

export function formatSignedMoney(minorUnits: number, currency: string): string {
  if (minorUnits === 0) return formatMoney(0, currency);
  return `${minorUnits > 0 ? "+" : "−"}${formatMoney(Math.abs(minorUnits), currency)}`;
}
