import type { FinancialStateSnapshot } from "@/domain/financialState.ts";
import type { FullEgressContext } from "@/consent/redaction.ts";
import { db } from "@/db/schema.ts";
import { open } from "@/crypto/envelope.ts";
import type { MasterKey } from "@/crypto/envelope.ts";

export type { EgressContext } from "@/consent/redaction.ts";

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

  return {
    periodTotalsPerCategory,
    totalIncome: snapshot.periodIncome,
    totalExpenses: snapshot.periodExpenses,
    netCashFlow: snapshot.netCashFlow,
    budgetStatusPercent,
    goalProgressPercent,
    trendDirection: computeTrends(snapshot, periodTotalsPerCategory),
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
  const events = await db.financialEvents
    .where("timestamp")
    .between(snapshot.periodStart, snapshot.periodEnd)
    .toArray();

  const results: Array<{
    id: string;
    timestamp: number;
    amount: { minorUnits: number; currency: string };
    categoryId: string;
    note: string;
  }> = [];

  for (const event of events) {
    if (event.type !== "transaction_created") continue;

    try {
      const plaintext = await open(
        { ciphertext: event.ciphertext, iv: event.iv },
        masterKey
      );
      const payload = JSON.parse(
        new TextDecoder().decode(plaintext)
      ) as {
        accountId: string;
        categoryId: string;
        amount: { minorUnits: number; currency: string };
        direction: string;
        note?: string;
      };

      results.push({
        id: event.id,
        timestamp: event.timestamp,
        amount: payload.amount,
        categoryId: payload.categoryId,
        note: payload.note ?? "",
      });
    } catch {
      // Skip events that fail to decrypt — may be a key rotation in progress.
    }
  }

  results.sort((a, b) => b.timestamp - a.timestamp);
  return results.slice(0, 100);
}

/**
 * Compute trend direction per category by comparing the current period against
 * a simple heuristic: any non-zero total trends "up" if it exceeds a threshold.
 *
 * TODO (FR-AI-01): replace with real period-over-period comparison once we
 * have historical snapshot persistence.
 */
function computeTrends(
  _snapshot: FinancialStateSnapshot,
  totals: Record<string, { minorUnits: number; currency: string }>
): Record<string, "up" | "down" | "stable"> {
  const trends: Record<string, "up" | "down" | "stable"> = {};
  for (const [catId, total] of Object.entries(totals)) {
    if (total.minorUnits > 0) {
      trends[catId] = "up";
    } else if (total.minorUnits < 0) {
      trends[catId] = "down";
    } else {
      trends[catId] = "stable";
    }
  }
  return trends;
}
