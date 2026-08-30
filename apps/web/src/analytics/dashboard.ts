import type { FinancialStateSnapshot, MoneyDTO, TransactionDisplay } from "../domain/financialState.ts";
import type { FinancialOperation } from "../domain/financialOperations.ts";

export type DateRange = {
  start: number;
  end: number;
};

export type CashFlowPoint = {
  start: number;
  end: number;
  income: number;
  expenses: number;
  net: number;
};

export type BalancePoint = {
  timestamp: number;
  balance: number;
};

export type CategoryExpense = {
  categoryId: string;
  amount: MoneyDTO;
  share: number;
};

export type AccountDistribution = {
  accountId: string;
  name: string;
  amount: MoneyDTO;
  share: number | null;
};

export type UpcomingCommitment = {
  id: string;
  kind: "planned_expense" | "recurring_expense" | "debt" | "receivable";
  label: string;
  dueAt: number | null;
  amount: MoneyDTO;
};

export type DashboardAlert = {
  id: string;
  kind: "missing_fx" | "negative_cash_flow" | "spending_from_balance" | "budget_threshold";
  severity: "info" | "attention" | "critical";
  entityId: string;
  threshold: number | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function boundedRange(range: DateRange): DateRange {
  if (!Number.isFinite(range.start) || !Number.isFinite(range.end)) {
    throw new Error("date range must contain finite timestamps");
  }
  if (range.end < range.start) throw new Error("date range end must not precede its start");
  return range;
}

function percentage(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 10_000) / 100;
}

export function selectPeriodTransactions(
  transactions: readonly TransactionDisplay[],
  range: DateRange,
): TransactionDisplay[] {
  const validRange = boundedRange(range);
  return transactions.filter(
    (transaction) => transaction.timestamp >= validRange.start && transaction.timestamp <= validRange.end,
  );
}

/**
 * Narrows the transaction projection to one account and presents native values
 * in that account's currency. The original projection remains untouched.
 */
export function selectAccountTransactions(
  transactions: readonly TransactionDisplay[],
  accountId: string | null,
): TransactionDisplay[] {
  if (accountId == null) return [...transactions];
  return transactions
    .filter((transaction) => transaction.accountId === accountId)
    .map((transaction) => ({ ...transaction, displayAmount: transaction.amount }));
}

/** Keeps both sides of internal transfers when an account is selected. */
export function selectAccountOperations(
  operations: readonly FinancialOperation[],
  accountId: string | null,
): FinancialOperation[] {
  if (accountId == null) return [...operations];
  return operations
    .filter((operation) => operation.accountId === accountId || operation.toAccountId === accountId)
    .map((operation) => ({ ...operation, displayAmount: operation.amount }));
}

/**
 * Builds all cash-flow buckets in one pass. Transfers are intentionally absent:
 * they are not TransactionDisplay records and therefore never become income or expense.
 */
export function selectCashFlowTimeline(
  transactions: readonly TransactionDisplay[],
  range: DateRange,
  preferredBucketCount = 8,
): CashFlowPoint[] {
  const validRange = boundedRange(range);
  const bucketCount = Math.max(1, Math.min(31, Math.trunc(preferredBucketCount)));
  const inclusiveSpan = Math.max(1, validRange.end - validRange.start + 1);
  const bucketMs = Math.max(DAY_MS, Math.ceil(inclusiveSpan / bucketCount));
  const actualBucketCount = Math.max(1, Math.ceil(inclusiveSpan / bucketMs));
  const points = Array.from({ length: actualBucketCount }, (_, index): CashFlowPoint => {
    const start = validRange.start + index * bucketMs;
    return {
      start,
      end: Math.min(validRange.end, start + bucketMs - 1),
      income: 0,
      expenses: 0,
      net: 0,
    };
  });

  for (const transaction of transactions) {
    if (transaction.timestamp < validRange.start || transaction.timestamp > validRange.end) continue;
    const amount = transaction.displayAmount?.minorUnits;
    if (amount == null || !Number.isSafeInteger(amount)) continue;
    const index = Math.min(points.length - 1, Math.floor((transaction.timestamp - validRange.start) / bucketMs));
    const point = points[index];
    if (point == null) continue;
    const value = Math.abs(amount);
    if (transaction.direction === "income") {
      point.income += value;
      point.net += value;
    } else {
      point.expenses += value;
      point.net -= value;
    }
  }

  return points;
}

function cashEffect(operation: FinancialOperation, currency: string, accountId?: string): number {
  const amount = accountId == null ? operation.displayAmount : operation.amount;
  if (amount?.currency !== currency) return 0;
  if (operation.kind === "income") return amount.minorUnits;
  if (operation.kind === "expense" || operation.kind === "planned_expense") return -amount.minorUnits;
  if (operation.kind === "recurring_realisation") {
    return operation.direction === "income" ? amount.minorUnits : operation.direction === "expense" ? -amount.minorUnits : 0;
  }
  if (operation.kind === "transfer") {
    if (accountId == null) return operation.toAccountId == null ? -amount.minorUnits : 0;
    if (operation.accountId === accountId) return -amount.minorUnits;
    if (operation.toAccountId === accountId) return amount.minorUnits;
  }
  return 0;
}

/** Reconstructs the balance path backwards from the authoritative closing balance. */
export function selectBalanceTimeline(
  closingBalance: MoneyDTO,
  operations: readonly FinancialOperation[],
  range: DateRange,
  preferredPointCount = 10,
  accountId?: string,
): BalancePoint[] {
  const validRange = boundedRange(range);
  const relevant = operations.filter((operation) => operation.timestamp >= validRange.start && operation.timestamp <= validRange.end);
  const totalEffect = relevant.reduce((sum, operation) => sum + cashEffect(operation, closingBalance.currency, accountId), 0);
  let balance = closingBalance.minorUnits - totalEffect;
  const pointCount = Math.max(2, Math.min(31, Math.trunc(preferredPointCount)));
  const inclusiveSpan = Math.max(1, validRange.end - validRange.start + 1);
  const bucketMs = Math.max(DAY_MS, Math.ceil(inclusiveSpan / (pointCount - 1)));
  const points: BalancePoint[] = [{ timestamp: validRange.start, balance }];
  let cursor = validRange.start + bucketMs;
  while (cursor <= validRange.end) {
    for (const operation of relevant) {
      if (operation.timestamp >= cursor - bucketMs && operation.timestamp < cursor) {
        balance += cashEffect(operation, closingBalance.currency, accountId);
      }
    }
    points.push({ timestamp: cursor, balance });
    cursor += bucketMs;
  }
  for (const operation of relevant) {
    const lastTimestamp = points.at(-1)?.timestamp ?? validRange.start;
    if (operation.timestamp >= lastTimestamp) balance += cashEffect(operation, closingBalance.currency, accountId);
  }
  if (points.at(-1)?.timestamp !== validRange.end) points.push({ timestamp: validRange.end, balance: closingBalance.minorUnits });
  else points[points.length - 1] = { timestamp: validRange.end, balance: closingBalance.minorUnits };
  return points;
}

export function selectExpensesByCategory(
  transactions: readonly TransactionDisplay[],
  range: DateRange,
  displayCurrency: string,
): CategoryExpense[] {
  const totals = new Map<string, number>();
  for (const transaction of selectPeriodTransactions(transactions, range)) {
    if (transaction.direction !== "expense") continue;
    const amount = transaction.displayAmount;
    if (amount == null || amount.currency !== displayCurrency) continue;
    totals.set(transaction.categoryId, (totals.get(transaction.categoryId) ?? 0) + Math.abs(amount.minorUnits));
  }
  const total = [...totals.values()].reduce((sum, value) => sum + value, 0);
  return [...totals]
    .map(([categoryId, minorUnits]) => ({
      categoryId,
      amount: { minorUnits, currency: displayCurrency },
      share: percentage(minorUnits, total),
    }))
    .sort((left, right) => right.amount.minorUnits - left.amount.minorUnits || left.categoryId.localeCompare(right.categoryId));
}

export function selectAccountDistribution(snapshot: FinancialStateSnapshot): AccountDistribution[] {
  const active = snapshot.accounts.filter((account) => account.isActive);
  const convertible = active.every((account) => account.balance.currency === snapshot.totalBalance.currency);
  const positiveTotal = convertible
    ? active.reduce((sum, account) => sum + Math.max(0, account.balance.minorUnits), 0)
    : 0;
  return active
    .map((account) => ({
      accountId: account.id,
      name: account.name,
      amount: account.balance,
      share: convertible ? percentage(Math.max(0, account.balance.minorUnits), positiveTotal) : null,
    }))
    .sort((left, right) => right.amount.minorUnits - left.amount.minorUnits || left.accountId.localeCompare(right.accountId));
}

export function selectUpcomingCommitments(snapshot: FinancialStateSnapshot): UpcomingCommitment[] {
  const items: UpcomingCommitment[] = [];
  for (const planned of snapshot.plannedExpenses) {
    if (planned.status !== "pending") continue;
    items.push({
      id: `planned:${planned.id}`,
      kind: "planned_expense",
      label: planned.label,
      dueAt: planned.dueDate,
      amount: planned.estimatedAmount,
    });
  }
  for (const recurring of snapshot.recurringItems) {
    if (recurring.isArchived || recurring.direction !== "expense") continue;
    const projected = snapshot.projectedRecurring.find((item) => item.label === recurring.label);
    items.push({
      id: `recurring:${recurring.id}`,
      kind: "recurring_expense",
      label: recurring.label,
      dueAt: projected?.dueDate ?? null,
      amount: recurring.amount,
    });
  }
  for (const item of snapshot.debtCredits) {
    if (item.status === "settled") continue;
    items.push({
      id: `${item.kind}:${item.id}`,
      kind: item.kind,
      label: item.partyName,
      dueAt: item.dueDate,
      amount: item.amount,
    });
  }
  return items.sort((left, right) =>
    (left.dueAt ?? Number.MAX_SAFE_INTEGER) - (right.dueAt ?? Number.MAX_SAFE_INTEGER) ||
    left.id.localeCompare(right.id)
  );
}

export function selectAvailableAfterCommitments(snapshot: FinancialStateSnapshot): MoneyDTO | null {
  const commitments = selectUpcomingCommitments(snapshot).filter(
    (item) => item.kind === "planned_expense" || item.kind === "recurring_expense" || item.kind === "debt",
  );
  if (commitments.some((item) => item.amount.currency !== snapshot.totalBalance.currency)) return null;
  const committed = commitments.reduce((sum, item) => sum + item.amount.minorUnits, 0);
  if (!Number.isSafeInteger(committed) || !Number.isSafeInteger(snapshot.totalBalance.minorUnits - committed)) return null;
  return {
    minorUnits: snapshot.totalBalance.minorUnits - committed,
    currency: snapshot.totalBalance.currency,
  };
}

export function selectDashboardAlerts(snapshot: FinancialStateSnapshot): DashboardAlert[] {
  const alerts: DashboardAlert[] = [];
  if (snapshot.missingFxCurrencies.length > 0) {
    const currencies = [...new Set(snapshot.missingFxCurrencies)].sort().join(",");
    alerts.push({
      id: `missing-fx:${snapshot.baseCurrency}:${currencies}`,
      kind: "missing_fx",
      severity: "attention",
      entityId: currencies,
      threshold: null,
    });
  }
  if (snapshot.netCashFlow.minorUnits < 0) {
    const periodKey = new Date(snapshot.periodStart).toISOString().slice(0, 7);
    const spendingFromExistingBalance = snapshot.periodIncome.minorUnits === 0 && snapshot.periodExpenses.minorUnits > 0;
    alerts.push({
      id: `${spendingFromExistingBalance ? "spending-from-balance" : "negative-cash-flow"}:${periodKey}`,
      kind: spendingFromExistingBalance ? "spending_from_balance" : "negative_cash_flow",
      severity: spendingFromExistingBalance ? "info" : "attention",
      entityId: periodKey,
      threshold: null,
    });
  }
  for (const budget of snapshot.budgets) {
    if (budget.isArchived) continue;
    const progress = snapshot.budgetProgress[budget.id];
    if (progress == null || progress.percentage < 70) continue;
    const threshold = progress.percentage >= 100 ? 100 : progress.percentage >= 90 ? 90 : 70;
    alerts.push({
      id: `budget-threshold:${budget.id}:${budget.periodMonth}:${threshold}`,
      kind: "budget_threshold",
      severity: threshold >= 100 ? "critical" : "attention",
      entityId: budget.id,
      threshold,
    });
  }
  const rank = { critical: 0, attention: 1, info: 2 } as const;
  return alerts.sort((left, right) => rank[left.severity] - rank[right.severity] || left.id.localeCompare(right.id));
}
