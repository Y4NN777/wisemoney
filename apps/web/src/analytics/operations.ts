import type { FinancialOperation, FinancialOperationKind } from "../domain/financialOperations.ts";
import type { MoneyDTO } from "../domain/financialState.ts";

export type OperationFilters = {
  query: string;
  kind: FinancialOperationKind | "all";
  accountId: string;
  categoryId: string;
  start: number;
  end: number;
};

export type OperationSearchIndex = {
  accounts: Readonly<Record<string, string>>;
  categories: Readonly<Record<string, string>>;
  goals: Readonly<Record<string, string>>;
};

function searchable(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().trim();
}

export function filterFinancialOperations(
  operations: readonly FinancialOperation[],
  filters: OperationFilters,
  index: OperationSearchIndex,
): FinancialOperation[] {
  const query = searchable(filters.query);
  return operations.filter((operation) => {
    if (operation.timestamp < filters.start || operation.timestamp > filters.end) return false;
    if (filters.kind === "expense" && operation.kind !== "expense" && !operation.isLegacyExternal) return false;
    if (filters.kind === "transfer" && (operation.kind !== "transfer" || operation.isLegacyExternal)) return false;
    if (filters.kind !== "all" && filters.kind !== "expense" && filters.kind !== "transfer" && operation.kind !== filters.kind) return false;
    if (filters.accountId !== "all" && operation.accountId !== filters.accountId && operation.toAccountId !== filters.accountId) return false;
    if (filters.categoryId !== "all" && operation.categoryId !== filters.categoryId) return false;
    if (query === "") return true;
    const haystack = searchable([
      operation.note,
      operation.merchant ?? "",
      operation.externalDestination ?? "",
      operation.accountId == null ? "" : index.accounts[operation.accountId] ?? "",
      operation.toAccountId == null ? "" : index.accounts[operation.toAccountId] ?? "",
      operation.categoryId == null ? "" : index.categories[operation.categoryId] ?? "",
      operation.goalId == null ? "" : index.goals[operation.goalId] ?? "",
    ].join(" "));
    return haystack.includes(query);
  });
}

export type MonthlyActivitySummary = {
  received: MoneyDTO;
  spent: MoneyDTO;
  difference: MoneyDTO;
  uncategorizedSpent: MoneyDTO;
  missingCurrencies: string[];
  isPartial: boolean;
};

export type MonthlyActivityInput = {
  operations: readonly FinancialOperation[];
  start: number;
  end: number;
  accountId: string | null;
  displayCurrency: string;
};

function safeAdd(left: number, right: number): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) throw new RangeError("activity total exceeds the safe integer range");
  return result;
}

export function operationEffect(
  operation: FinancialOperation,
  accountId: string | null,
): "incoming" | "outgoing" | "neutral" {
  if (operation.kind === "transfer" && !operation.isLegacyExternal) {
    if (accountId == null) return "neutral";
    if (operation.accountId === accountId) return "outgoing";
    if (operation.toAccountId === accountId) return "incoming";
    return "neutral";
  }
  if (operation.cashFlowRole === "income") return "incoming";
  if (operation.cashFlowRole === "expense") return "outgoing";
  return "neutral";
}

export function operationAmountForAccount(
  operation: FinancialOperation,
  accountId: string | null,
): MoneyDTO | null {
  if (accountId == null) return operation.displayAmount;
  if (operation.kind === "transfer" && operation.toAccountId === accountId) {
    return operation.destinationAmount ?? operation.amount;
  }
  return operation.amount;
}

export function summarizeMonthlyActivity(input: MonthlyActivityInput): MonthlyActivitySummary {
  if (!Number.isSafeInteger(input.start) || !Number.isSafeInteger(input.end) || input.start < 0 || input.end < input.start) {
    throw new RangeError("activity date range is invalid");
  }
  let received = 0;
  let spent = 0;
  let uncategorizedSpent = 0;
  const missingCurrencies = new Set<string>();

  for (const operation of input.operations) {
    if (operation.timestamp < input.start || operation.timestamp > input.end) continue;
    if (input.accountId != null && operation.accountId !== input.accountId && operation.toAccountId !== input.accountId) continue;
    const effect = operationEffect(operation, input.accountId);
    if (effect === "neutral") continue;
    const amount = operationAmountForAccount(operation, input.accountId);
    if (amount == null || amount.currency !== input.displayCurrency) {
      const source = input.accountId != null && operation.toAccountId === input.accountId
        ? operation.destinationAmount ?? operation.amount
        : operation.amount;
      if (source != null) missingCurrencies.add(source.currency);
      continue;
    }
    const value = Math.abs(amount.minorUnits);
    if (effect === "incoming") received = safeAdd(received, value);
    if (effect === "outgoing") {
      spent = safeAdd(spent, value);
      if (operation.categoryId == null) uncategorizedSpent = safeAdd(uncategorizedSpent, value);
    }
  }

  return {
    received: { minorUnits: received, currency: input.displayCurrency },
    spent: { minorUnits: spent, currency: input.displayCurrency },
    difference: { minorUnits: safeAdd(received, -spent), currency: input.displayCurrency },
    uncategorizedSpent: { minorUnits: uncategorizedSpent, currency: input.displayCurrency },
    missingCurrencies: [...missingCurrencies].sort(),
    isPartial: missingCurrencies.size > 0,
  };
}

export function operationCashTotals(operations: readonly FinancialOperation[], currency: string): { income: number; expenses: number; net: number } {
  const summary = summarizeMonthlyActivity({
    operations,
    start: 0,
    end: Number.MAX_SAFE_INTEGER,
    accountId: null,
    displayCurrency: currency,
  });
  return { income: summary.received.minorUnits, expenses: summary.spent.minorUnits, net: summary.difference.minorUnits };
}

export function groupOperationsByLocalDay(operations: readonly FinancialOperation[]): Array<{ day: string; operations: FinancialOperation[] }> {
  const groups = new Map<string, FinancialOperation[]>();
  for (const operation of operations) {
    const date = new Date(operation.timestamp);
    const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const group = groups.get(day) ?? [];
    group.push(operation);
    groups.set(day, group);
  }
  return [...groups].map(([day, grouped]) => ({ day, operations: grouped }));
}
