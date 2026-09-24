import { DEFAULT_INCOME_CATEGORY_NAMES } from "./categoryHints.ts";

/** Minimal structural category shape shared with the financial snapshot. */
export type CaptureCategory = {
  id: string;
  name: string;
  isSystemDefault: boolean;
  isArchived: boolean;
};

/** Minimal transaction shape needed for recency ordering. */
export type CaptureRecencyTransaction = {
  categoryId: string | null;
  accountId: string;
  timestamp: number;
};

function isIncomeHintCategory(category: CaptureCategory): boolean {
  return category.isSystemDefault && DEFAULT_INCOME_CATEGORY_NAMES.includes(category.name);
}

function lastUseIndex(
  transactions: readonly CaptureRecencyTransaction[],
  pick: (transaction: CaptureRecencyTransaction) => string | null,
): Map<string, number> {
  const lastUse = new Map<string, number>();
  for (const transaction of transactions) {
    const id = pick(transaction);
    if (id == null) continue;
    const current = lastUse.get(id);
    if (current == null || transaction.timestamp > current) {
      lastUse.set(id, transaction.timestamp);
    }
  }
  return lastUse;
}

function mostRecentIds(lastUse: Map<string, number>, limit: number): string[] {
  return [...lastUse.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([id]) => id);
}

/** Category ids most recently used, newest first, capped at `limit`. */
export function recentCategoryIds(
  transactions: readonly CaptureRecencyTransaction[],
  limit = 6,
): string[] {
  return mostRecentIds(lastUseIndex(transactions, (transaction) => transaction.categoryId), limit);
}

/** Account ids most recently used, newest first, capped at `limit`. */
export function recentAccountIds(
  transactions: readonly CaptureRecencyTransaction[],
  limit = 3,
): string[] {
  return mostRecentIds(lastUseIndex(transactions, (transaction) => transaction.accountId), limit);
}

/**
 * Categories ordered for a capture direction:
 * - expense mode hides seeded income categories (the picker never offers Salary
 *   for a purchase); income mode shows everything;
 * - recently used categories come first in both modes;
 * - ties fall back to income-hint categories first (income mode), then name.
 */
export function orderCategoriesForDirection(
  categories: readonly CaptureCategory[],
  direction: "income" | "expense",
  recentIds: readonly string[] = [],
): CaptureCategory[] {
  const recentIndex = new Map(recentIds.map((id, index) => [id, index]));
  return categories
    .filter((category) => !(category.isArchived || (direction === "expense" && isIncomeHintCategory(category))))
    .sort((left, right) => {
      const leftRecent = recentIndex.get(left.id) ?? Number.MAX_SAFE_INTEGER;
      const rightRecent = recentIndex.get(right.id) ?? Number.MAX_SAFE_INTEGER;
      if (leftRecent !== rightRecent) return leftRecent - rightRecent;
      if (direction === "income") {
        const leftIncome = isIncomeHintCategory(left) ? 0 : 1;
        const rightIncome = isIncomeHintCategory(right) ? 0 : 1;
        if (leftIncome !== rightIncome) return leftIncome - rightIncome;
      }
      return left.name.localeCompare(right.name);
    });
}
