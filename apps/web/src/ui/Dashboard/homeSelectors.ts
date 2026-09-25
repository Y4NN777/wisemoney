import type { FinancialOperation } from "../../domain/financialOperations.ts";
import type { TransactionDisplay } from "../../domain/financialState.ts";
import { selectAccountOperations } from "../../analytics/dashboard.ts";

/** Five compact rows fit under the two summary cards on a 375×812 viewport; three leave it half empty. */
export const RECENT_MOVEMENT_LIMIT = 5;

/**
 * Latest movements for Home, from the same operations projection Activity renders so both agree.
 * No lower bound on purpose: "recent" means the latest known movements up to `end`, even on the 1st.
 */
export function selectRecentMovements(
  operations: readonly FinancialOperation[],
  input: { accountId: string | null; end: number; limit: number },
): FinancialOperation[] {
  return selectAccountOperations(operations, input.accountId)
    .filter((operation) => operation.timestamp <= input.end)
    .sort((a, b) => b.timestamp - a.timestamp || b.id.localeCompare(a.id))
    .slice(0, input.limit);
}

export function indexTransactionsById(transactions: readonly TransactionDisplay[]): ReadonlyMap<string, TransactionDisplay> {
  return new Map(transactions.map((transaction) => [transaction.id, transaction]));
}

export type HomeSectionId =
  | "summary"
  | "firstSteps"
  | "quickActions"
  | "attention"
  | "recentMovements"
  | "assistant"
  | "charts"
  | "planningCards"
  | "aiInsight";

export type HomeLayout = { aboveFold: HomeSectionId[]; belowFold: HomeSectionId[] };

/**
 * First viewport = where do I stand, what happened, what needs me (ux-simplification decision 2);
 * everything else stays reachable under one fold. Nothing is dropped.
 */
export function selectHomeLayout(input: { canMutate: boolean }): HomeLayout {
  return {
    aboveFold: input.canMutate
      ? ["summary", "firstSteps", "quickActions", "attention", "recentMovements", "assistant"]
      : ["summary", "firstSteps", "attention", "recentMovements", "assistant"],
    belowFold: ["charts", "planningCards", "aiInsight"],
  };
}
