import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card.tsx";

import { Button } from "../../components/ui/button.tsx";

import {
  ArrowUp, ArrowDown, Wallet, ArrowRightLeft, } from "lucide-react";
import type { FinancialStateSnapshot } from "../../domain/financialState.ts";
import type { } from "../../domain/financialOperations.ts";

import type { } from "../../pillars/intelligence/index.ts";
import { useTranslation } from "react-i18next";

import { type PeriodAmountComparison } from "./periodComparison.ts";

import {
  selectAvailableAfterCommitments,
  } from "../../analytics/dashboard.ts";
import { formatMoney, formatSignedMoney } from "./format.ts";

export type PeriodComparisonSummary = {
  incomeChange: PeriodAmountComparison;
  expenseChange: PeriodAmountComparison;
};

export function FinancialOverview({
  snapshot,
  isCurrentPeriod,
  comparison,
  accountName,
  activityContext,
}: {
  snapshot: FinancialStateSnapshot;
  isCurrentPeriod: boolean;
  comparison: PeriodComparisonSummary | null;
  accountName: string | null;
  activityContext: { start: number; end: number; accountId: string | null };
}) {
  const { t } = useTranslation();
  const currency = snapshot.totalBalance.currency;
  const activeAccountCount = snapshot.accounts.filter((account) => account.isActive).length;
  const net = snapshot.netCashFlow.minorUnits;
  const netTone = net === 0 ? "text-foreground" : net > 0 ? "text-positive" : "text-negative";
  const afterCommitments = accountName == null ? selectAvailableAfterCommitments(snapshot) : null;
  const periodDate = new Date(snapshot.periodStart);
  const locale = document.documentElement.lang || undefined;
  const periodMonth = periodDate.toLocaleDateString(locale, { month: "long" });
  const isFrench = document.documentElement.lang.toLowerCase().startsWith("fr");
  const frenchElision = [3, 7, 9].includes(periodDate.getMonth());
  const contextualMonth = isFrench
    ? `${frenchElision ? "d’" : "de "}${periodMonth}`
    : periodMonth;

  return (
    <section aria-label={t("dashboard.balanceSummary")} className="situation-line grid gap-px overflow-hidden border border-border bg-border lg:grid-cols-[minmax(18rem,0.85fr)_minmax(0,1.65fr)]">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 pb-2">
          <div>
            <p className="text-xs font-medium text-ocean-primary">{accountName ?? t("dashboard.allActiveAccounts")}</p>
            <CardTitle className="mt-1 text-base">
              {t(isCurrentPeriod ? "dashboard.availableToday" : "dashboard.balanceAtPeriodEnd")}
            </CardTitle>
          </div>
          <Wallet className="h-5 w-5 shrink-0 text-ocean-primary" />
        </CardHeader>
        <CardContent>
          <p className="break-words text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">
            {formatMoney(snapshot.totalBalance.minorUnits, currency)}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {accountName == null
              ? t("dashboard.balanceContext", { count: activeAccountCount })
              : t("dashboard.selectedAccountContext")}
          </p>
          {afterCommitments != null && afterCommitments.minorUnits !== snapshot.totalBalance.minorUnits && (
            <div className="mt-4 border-t border-border pt-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-xs font-medium text-muted-foreground">{t("dashboard.afterCommitments")}</p>
                <p className="text-base font-semibold tabular-nums">{formatMoney(afterCommitments.minorUnits, afterCommitments.currency)}</p>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{t("dashboard.afterCommitmentsHelp")}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {t("dashboard.periodActivity", { month: contextualMonth })}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid divide-y divide-border rounded-lg border border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <div className="p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-muted-foreground">{t("dashboard.moneyReceived")}</p>
                <ArrowDown className={`h-4 w-4 ${snapshot.periodIncome.minorUnits === 0 ? "text-muted-foreground" : "text-positive"}`} />
              </div>
              <p className={`mt-1 text-xl font-semibold tabular-nums ${snapshot.periodIncome.minorUnits === 0 ? "text-foreground" : "text-positive"}`}>
                {formatSignedMoney(snapshot.periodIncome.minorUnits, currency)}
              </p>
              {comparison != null && (
                <PeriodComparisonText comparison={comparison.incomeChange} invert={false} currency={currency} />
              )}
            </div>
            <div className="p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-muted-foreground">{t("dashboard.moneySpent")}</p>
                <ArrowUp className={`h-4 w-4 ${snapshot.periodExpenses.minorUnits === 0 ? "text-muted-foreground" : "text-negative"}`} />
              </div>
              <p className={`mt-1 text-xl font-semibold tabular-nums ${snapshot.periodExpenses.minorUnits === 0 ? "text-foreground" : "text-negative"}`}>
                {formatSignedMoney(-snapshot.periodExpenses.minorUnits, currency)}
              </p>
              {comparison != null && (
                <PeriodComparisonText comparison={comparison.expenseChange} invert currency={currency} />
              )}
            </div>
            <div className="bg-ocean-wash/55 p-3">
              <p className="text-xs font-medium text-muted-foreground">{t("dashboard.periodDifference")}</p>
              <p className={`mt-1 text-xl font-semibold tabular-nums ${netTone}`}>
                {formatSignedMoney(net, currency)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{t("dashboard.receivedMinusSpent")}</p>
            </div>
          </div>
          <p className="rounded-md bg-accent/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            {t("dashboard.periodEquation", {
              income: formatSignedMoney(snapshot.periodIncome.minorUnits, currency),
              expenses: formatMoney(snapshot.periodExpenses.minorUnits, currency),
              difference: formatSignedMoney(net, currency),
            })}
          </p>
          <Button asChild variant="outline" size="sm" className="w-full justify-between sm:w-auto">
            <Link to="/operations" search={{
              start: activityContext.start,
              end: activityContext.end,
              accountId: activityContext.accountId ?? undefined,
            }}>
              {t("dashboard.viewMonthlyActivity")}
              <ArrowRightLeft className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}

export function PeriodComparisonText({
  comparison,
  invert,
  currency,
}: {
  comparison: PeriodAmountComparison;
  invert: boolean;
  currency: string;
}) {
  const { t } = useTranslation();
  if (comparison.kind === "no-activity") return null;
  const upward = comparison.kind === "new" || comparison.kind === "increase";
  const downward = comparison.kind === "stopped" || comparison.kind === "decrease";
  const isGood = comparison.kind === "same" ? null : invert ? downward : upward;
  const toneClass = isGood == null ? "text-muted-foreground" : isGood ? "text-positive" : "text-negative";
  const Icon = comparison.kind === "same" ? null : upward ? ArrowUp : ArrowDown;
  const message = comparison.kind === "new"
    ? t("dashboard.comparison.newThisMonth")
    : comparison.kind === "stopped"
      ? t("dashboard.comparison.noneThisMonth")
      : comparison.kind === "same"
        ? t("dashboard.comparison.sameAsLastMonth")
        : comparison.kind === "increase"
          ? t("dashboard.comparison.moreThanLastMonth", { amount: formatMoney(comparison.difference, currency) })
          : t("dashboard.comparison.lessThanLastMonth", { amount: formatMoney(comparison.difference, currency) });
  return (
    <p className={`mt-1 flex items-start gap-1 text-xs leading-relaxed ${toneClass}`}>
      {Icon != null && <Icon className="mt-0.5 h-3 w-3 shrink-0" />}
      <span>{message}</span>
    </p>
  );
}
