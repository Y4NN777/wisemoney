import { Link } from "@tanstack/react-router";
import { ArrowRightLeft, List, Pencil, PiggyBank, Repeat, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card.tsx";
import { Skeleton } from "../../components/ui/skeleton.tsx";
import type { FinancialOperation } from "../../domain/financialOperations.ts";
import type { FinancialStateSnapshot, TransactionDisplay } from "../../domain/financialState.ts";
import { categoryDisplayName } from "../../lib/categoryName.ts";
import type { OperationsSearch } from "../../routes/operations.tsx";
import { operationTitle } from "../Operations/index.tsx";
import { formatDate, formatMoney } from "./format.ts";

/**
 * The first-viewport list: the latest movements from the operations projection, so Home
 * and Activity always agree. Income and expense rows keep the edit and delete actions of
 * the full list when the underlying transaction is loaded; other kinds link to Activity.
 */
export default function RecentMovements({
  snapshot,
  movements,
  transactionsById,
  canMutate,
  loading,
  activityContext,
  onEdit,
  onDelete,
}: {
  snapshot: FinancialStateSnapshot;
  movements: readonly FinancialOperation[];
  transactionsById: ReadonlyMap<string, TransactionDisplay>;
  canMutate: boolean;
  loading: boolean;
  activityContext: OperationsSearch;
  onEdit: (transaction: TransactionDisplay) => void;
  onDelete: (transaction: TransactionDisplay) => void;
}) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">{t("dashboard.recentMovements")}</CardTitle>
        <Button asChild variant="ghost" size="sm">
          <Link to="/operations" search={activityContext}>{t("dashboard.viewAll")}</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-12 w-full" />)}
          </div>
        ) : movements.length === 0 ? (
          <div className="py-6 text-center">
            <List className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">{t("dashboard.noActivityTitle")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("dashboard.noTransactions")}</p>
          </div>
        ) : (
          <ul className="space-y-1">
            {movements.map((operation) => {
              const transaction = transactionsById.get(operation.id);
              if (transaction != null && (operation.kind === "income" || operation.kind === "expense")) {
                return (
                  <TransactionRow
                    key={operation.id}
                    snapshot={snapshot}
                    transaction={transaction}
                    canMutate={canMutate}
                    onEdit={onEdit}
                    onDelete={onDelete}
                  />
                );
              }
              return <OperationRow key={operation.id} snapshot={snapshot} operation={operation} />;
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function TransactionRow({
  snapshot,
  transaction,
  canMutate,
  onEdit,
  onDelete,
}: {
  snapshot: FinancialStateSnapshot;
  transaction: TransactionDisplay;
  canMutate: boolean;
  onEdit: (transaction: TransactionDisplay) => void;
  onDelete: (transaction: TransactionDisplay) => void;
}) {
  const { t } = useTranslation();
  const category = snapshot.categories.find((item) => item.id === transaction.categoryId);
  const isIncome = transaction.direction === "income";
  return (
    <li className="flex items-center justify-between border-b py-2 last:border-0">
      <div className="flex min-w-0 items-center gap-2">
        <div className={`h-2 w-2 shrink-0 rounded-full ${isIncome ? "bg-positive" : "bg-negative"}`} />
        <div className="min-w-0">
          <p className="truncate text-sm">{category == null ? t("common.unknown") : categoryDisplayName(category, t)}</p>
          <p className="text-xs text-muted-foreground">
            {formatDate(transaction.timestamp)}{transaction.note ? ` · ${transaction.note}` : ""}
          </p>
        </div>
      </div>
      <div className="ml-2 flex shrink-0 items-center gap-1">
        <span className={`text-sm font-medium ${isIncome ? "text-positive" : "text-negative"}`}>
          {isIncome ? "+" : "-"}{formatMoney(Math.abs(transaction.amount.minorUnits), transaction.amount.currency)}
        </span>
        {canMutate && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label={t("dashboard.transactionActions.editAria", { date: formatDate(transaction.timestamp) })}
              title={t("dashboard.transactionActions.edit")}
              onClick={() => onEdit(transaction)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              aria-label={t("dashboard.transactionActions.deleteAria", { date: formatDate(transaction.timestamp) })}
              title={t("dashboard.transactionActions.delete")}
              onClick={() => onDelete(transaction)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

function OperationRow({ snapshot, operation }: { snapshot: FinancialStateSnapshot; operation: FinancialOperation }) {
  const { t } = useTranslation();
  const Icon = operation.kind === "transfer" ? ArrowRightLeft : operation.kind === "goal_contribution" ? PiggyBank : Repeat;
  const amount = operation.displayAmount ?? operation.amount;
  return (
    <li className="flex items-center justify-between gap-3 border-b py-2 last:border-0">
      <div className="flex min-w-0 items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="truncate text-sm">{operationTitle(operation, snapshot, t)}</p>
          <p className="text-xs text-muted-foreground">{formatDate(operation.timestamp)}{operation.note ? ` · ${operation.note}` : ""}</p>
        </div>
      </div>
      {amount != null && <span className="shrink-0 text-sm font-medium">{formatMoney(amount.minorUnits, amount.currency)}</span>}
    </li>
  );
}
