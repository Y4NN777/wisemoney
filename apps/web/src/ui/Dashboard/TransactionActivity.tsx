import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card.tsx";

import { Skeleton } from "../../components/ui/skeleton.tsx";
import { Button } from "../../components/ui/button.tsx";

import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs.tsx";
import {
  List, ArrowRightLeft, Pencil, Trash2,
  PlusCircle, } from "lucide-react";
import type { FinancialStateSnapshot, TransactionDisplay } from "../../domain/financialState.ts";
import type { } from "../../domain/financialOperations.ts";

import type { } from "../../pillars/intelligence/index.ts";
import { useTranslation } from "react-i18next";

import { categoryDisplayName } from "../../lib/categoryName.ts";

import { useOpenCaptureSheet } from "../../components/CaptureSheet/index.tsx";
import { type TransactionFilter } from "./homeSelectors.ts";
import { formatDate, formatMoney } from "./format.ts";

export function TransactionActivity({
  snapshot,
  canMutate,
  filter,
  onFilterChange,
  filterContext,
  transactions,
  loading,
  transfers,
  onEdit,
  onDelete,
}: {
  snapshot: FinancialStateSnapshot;
  canMutate: boolean;
  filter: TransactionFilter;
  onFilterChange: (filter: TransactionFilter) => void;
  filterContext: string;
  transactions: TransactionDisplay[] | undefined;
  loading: boolean;
  transfers: FinancialStateSnapshot["transfers"];
  onEdit: (transaction: TransactionDisplay) => void;
  onDelete: (transaction: TransactionDisplay) => void;
}) {
  const { t } = useTranslation();
  const openCapture = useOpenCaptureSheet();
  return (
    <Card>
      <CardHeader className="flex flex-col items-start justify-between gap-2 pb-3 sm:flex-row sm:items-center">
        <CardTitle className="text-base">{t("dashboard.transactions")}</CardTitle>
        <div className="flex w-full flex-wrap items-center justify-between gap-2 sm:w-auto sm:justify-end">
          <Button asChild variant="ghost" size="sm">
            <Link to="/operations">{t("dashboard.viewAll")}</Link>
          </Button>
        {canMutate && (
          <Button type="button" variant="outline" size="sm" className="min-w-0 whitespace-normal" onClick={() => openCapture("transaction")}>
            <PlusCircle className="mr-1 h-4 w-4" />
            {t("dashboard.addTransaction")}
          </Button>
        )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Tabs value={filter} onValueChange={(value) => onFilterChange(value as TransactionFilter)}>
          <TabsList className="grid w-full grid-cols-4 sm:w-[380px]">
            <TabsTrigger value="day">{t("dashboard.filters.day")}</TabsTrigger>
            <TabsTrigger value="week">{t("dashboard.filters.week")}</TabsTrigger>
            <TabsTrigger value="month">{t("dashboard.filters.month")}</TabsTrigger>
            <TabsTrigger value="all">{t("dashboard.filters.all")}</TabsTrigger>
          </TabsList>
        </Tabs>
        <p className="rounded-md bg-accent/60 px-3 py-2 text-xs text-muted-foreground">{filterContext}</p>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-12 w-full" />)}
          </div>
        ) : transactions != null && transactions.length > 0 ? (
          <ul className="max-h-80 space-y-1 overflow-y-auto">
            {transactions.map((transaction) => {
              const category = snapshot.categories.find((item) => item.id === transaction.categoryId);
              const isIncome = transaction.direction === "income";
              return (
                <li key={transaction.id} className="flex items-center justify-between border-b py-2 last:border-0">
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
            })}
          </ul>
        ) : transfers.length === 0 ? (
          <div className="py-8 text-center">
            <List className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">{t("dashboard.noActivityTitle")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("dashboard.noTransactions")}</p>
          </div>
        ) : null}
        {transfers.length > 0 && (
          <div className="border-t pt-3">
            <p className="mb-1 text-xs font-medium text-muted-foreground">{t("dashboard.transfers")}</p>
            <ul className="max-h-56 space-y-1 overflow-y-auto">
              {transfers.map((transfer) => {
                const from = snapshot.accounts.find((account) => account.id === transfer.fromAccountId);
                const to = snapshot.accounts.find((account) => account.id === transfer.toAccountId);
                const destination = to?.name ?? transfer.externalDestination ?? t("dashboard.externalAccount");
                return (
                  <li key={transfer.id} className="flex items-center justify-between gap-3 border-b py-2 last:border-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <ArrowRightLeft className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="truncate text-sm">{from?.name ?? t("dashboard.unknownAccount")} → {destination}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(transfer.timestamp)}{transfer.note ? ` · ${transfer.note}` : ""}</p>
                      </div>
                    </div>
                    <span className="shrink-0 text-sm font-medium">{formatMoney(transfer.amount.minorUnits, transfer.amount.currency)}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
