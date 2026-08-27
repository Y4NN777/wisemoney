import type { FinancialOperation, FinancialOperationKind } from "../domain/financialOperations.ts";

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
    if (filters.kind !== "all" && operation.kind !== filters.kind) return false;
    if (filters.accountId !== "all" && operation.accountId !== filters.accountId && operation.toAccountId !== filters.accountId) return false;
    if (filters.categoryId !== "all" && operation.categoryId !== filters.categoryId) return false;
    if (query === "") return true;
    const haystack = searchable([
      operation.note,
      operation.externalDestination ?? "",
      operation.accountId == null ? "" : index.accounts[operation.accountId] ?? "",
      operation.toAccountId == null ? "" : index.accounts[operation.toAccountId] ?? "",
      operation.categoryId == null ? "" : index.categories[operation.categoryId] ?? "",
      operation.goalId == null ? "" : index.goals[operation.goalId] ?? "",
    ].join(" "));
    return haystack.includes(query);
  });
}

export function operationCashTotals(operations: readonly FinancialOperation[], currency: string): { income: number; expenses: number; net: number } {
  let income = 0;
  let expenses = 0;
  for (const operation of operations) {
    if (operation.displayAmount?.currency !== currency) continue;
    if (operation.kind === "income") income += operation.displayAmount.minorUnits;
    if (operation.kind === "expense" || operation.kind === "planned_expense") expenses += operation.displayAmount.minorUnits;
    if (operation.kind === "recurring_realisation" && operation.direction === "income") income += operation.displayAmount.minorUnits;
    if (operation.kind === "recurring_realisation" && operation.direction === "expense") expenses += operation.displayAmount.minorUnits;
  }
  return { income, expenses, net: income - expenses };
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
