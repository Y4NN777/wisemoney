import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import type { FinancialOperationKind } from "../domain/financialOperations.ts";
import { Route as rootRoute } from "./__root.tsx";

const operationKinds: readonly FinancialOperationKind[] = [
  "income",
  "expense",
  "planned_expense",
  "transfer",
  "goal_contribution",
  "recurring_realisation",
];

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim().slice(0, 120) : undefined;
}

function optionalTimestamp(value: unknown): number | undefined {
  const number = typeof value === "string" ? Number(value) : value;
  return Number.isSafeInteger(number) && (number as number) >= 0 ? number as number : undefined;
}

export type OperationsSearch = {
  q?: string;
  kind?: FinancialOperationKind;
  accountId?: string;
  categoryId?: string;
  start?: number;
  end?: number;
};

export function parseOperationsSearch(search: Record<string, unknown>): OperationsSearch {
  const kind = operationKinds.find((candidate) => candidate === search.kind);
  const start = optionalTimestamp(search.start);
  const end = optionalTimestamp(search.end);
  const q = optionalText(search.q);
  const accountId = optionalText(search.accountId);
  const categoryId = optionalText(search.categoryId);
  const result: OperationsSearch = {};
  if (q != null) result.q = q;
  if (kind != null) result.kind = kind;
  if (accountId != null) result.accountId = accountId;
  if (categoryId != null) result.categoryId = categoryId;
  if (start != null) result.start = start;
  if (end != null && (start == null || end >= start)) result.end = end;
  return result;
}

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/operations",
  validateSearch: parseOperationsSearch,
  component: lazyRouteComponent(() => import("../ui/Operations/index.tsx")),
});
