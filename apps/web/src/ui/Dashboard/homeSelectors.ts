

import type { } from "../../domain/financialOperations.ts";

import type { } from "../../pillars/intelligence/index.ts";

export type TransactionFilter = "day" | "week" | "month" | "all";

export function getTransactionFilterBounds(
  filter: TransactionFilter,
  asOfTimestamp: number,
  periodStart: number,
  periodEnd: number,
): { start: number; end: number } {
  switch (filter) {
    case "day":
      return { start: new Date(asOfTimestamp).setHours(0, 0, 0, 0), end: asOfTimestamp };
    case "week":
      return { start: asOfTimestamp - 7 * 24 * 60 * 60 * 1000, end: asOfTimestamp };
    case "month":
      return { start: periodStart, end: Math.min(periodEnd, asOfTimestamp) };
    case "all":
      return { start: 0, end: asOfTimestamp };
  }
}
