import { readTransactionsInRange, replayUpTo, type FinancialStateSnapshot } from "@/domain/financialState.ts";
import type { FullEgressContext } from "@/consent/redaction.ts";
import type { MasterKey } from "@/crypto/envelope.ts";

/**
 * Build a full egress context from the current financial state snapshot.
 *
 * Computes aggregated context from the snapshot fields, and decrypts
 * individual transactions from the event store when full detail is needed.
 */
export async function buildContext(
  snapshot: FinancialStateSnapshot,
  masterKey: MasterKey
): Promise<FullEgressContext> {
  const periodTotalsPerCategory: Record<string, { minorUnits: number; currency: string }> =
    {};

  for (const [catId, total] of Object.entries(snapshot.categoryTotals)) {
    periodTotalsPerCategory[catId] = total;
  }

  const budgetStatusPercent: Record<string, number> = {};
  for (const [budgetId, bp] of Object.entries(snapshot.budgetProgress)) {
    budgetStatusPercent[budgetId] = bp.percentage;
  }

  const goalProgressPercent: Record<string, number> = {};
  for (const [goalId, gp] of Object.entries(snapshot.goalProgress)) {
    goalProgressPercent[goalId] = gp.percentage;
  }

  const transactions = await loadRecentTransactions(snapshot, masterKey);
  const previousSnapshot = snapshot.periodStart > 0
    ? await replayUpTo(snapshot.periodStart - 1, masterKey)
    : null;

  return {
    periodTotalsPerCategory,
    totalIncome: snapshot.periodIncome,
    totalExpenses: snapshot.periodExpenses,
    netCashFlow: snapshot.netCashFlow,
    budgetStatusPercent,
    goalProgressPercent,
    trendDirection: computeTrends(
      periodTotalsPerCategory,
      previousSnapshot?.categoryTotals ?? {}
    ),
    transactions,
  };
}

/**
 * Load the most recent transactions within the snapshot's period window.
 * Decrypts each event's payload to extract transaction details.
 */
async function loadRecentTransactions(
  snapshot: FinancialStateSnapshot,
  masterKey: MasterKey
): Promise<
  Array<{
    id: string;
    timestamp: number;
    amount: { minorUnits: number; currency: string };
    categoryId: string;
    note: string;
  }>
> {
  const transactions = await readTransactionsInRange(
    snapshot.periodStart,
    snapshot.periodEnd,
    masterKey
  );
  return transactions.slice(0, 100).map((transaction) => ({
    id: transaction.id,
    timestamp: transaction.timestamp,
    amount: transaction.amount,
    categoryId: transaction.categoryId,
    note: transaction.note,
  }));
}

/**
 * Compute trend direction per category against the immediately preceding month.
 */
export function computeTrends(
  current: Record<string, { minorUnits: number; currency: string }>,
  previous: Record<string, { minorUnits: number; currency: string }>
): Record<string, "up" | "down" | "stable"> {
  const trends: Record<string, "up" | "down" | "stable"> = {};
  const categoryIds = new Set([...Object.keys(current), ...Object.keys(previous)]);
  for (const catId of categoryIds) {
    const currentAmount = current[catId]?.minorUnits ?? 0;
    const previousAmount = previous[catId]?.minorUnits ?? 0;
    if (currentAmount > previousAmount) {
      trends[catId] = "up";
    } else if (currentAmount < previousAmount) {
      trends[catId] = "down";
    } else {
      trends[catId] = "stable";
    }
  }
  return trends;
}
