export type PeriodAmountComparison =
  | { kind: "no-activity"; difference: 0 }
  | { kind: "same"; difference: 0 }
  | { kind: "new"; difference: number }
  | { kind: "stopped"; difference: number }
  | { kind: "increase"; difference: number }
  | { kind: "decrease"; difference: number };

/**
 * Compare non-negative period totals without inventing a percentage when the
 * previous period was zero. The absolute difference is easier to relate to the
 * amounts displayed elsewhere on the dashboard.
 */
export function comparePeriodAmounts(current: number, previous: number): PeriodAmountComparison {
  if (!Number.isSafeInteger(current) || !Number.isSafeInteger(previous) || current < 0 || previous < 0) {
    throw new Error("comparePeriodAmounts: expected non-negative safe integers");
  }
  if (current === 0 && previous === 0) return { kind: "no-activity", difference: 0 };
  if (current === previous) return { kind: "same", difference: 0 };
  if (previous === 0) return { kind: "new", difference: current };
  if (current === 0) return { kind: "stopped", difference: previous };
  if (current > previous) return { kind: "increase", difference: current - previous };
  return { kind: "decrease", difference: previous - current };
}
