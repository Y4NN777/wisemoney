import { useState, useMemo, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { useDeleteTransaction, useFinancialState, useHasTransactions, useHistoricalState, useTransactionsInRange, useUpdateTransaction } from "../../hooks/useFinancialState.ts";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card.tsx";
import { Badge } from "../../components/ui/badge.tsx";
import { Progress } from "../../components/ui/progress.tsx";
import { Skeleton } from "../../components/ui/skeleton.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Input } from "../../components/ui/input.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select.tsx";
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs.tsx";
import {
  AlertTriangle, ArrowUp, ArrowDown, Wallet, TrendingUp, Target, Repeat,
  Info, ChevronLeft, ChevronRight, List, BarChart3,
  Lightbulb, ArrowRightLeft, Pencil, Trash2,
  PlusCircle,
} from "lucide-react";
import type { FinancialStateSnapshot, TransactionDisplay } from "../../domain/financialState.ts";
import { useMasterKey } from "../../lib/masterKeyContext.ts";
import { getAICapability, type AICapability } from "../../lib/capabilities.ts";
import { requestInsight } from "../../pillars/intelligence/index.ts";
import type { AIResult } from "../../pillars/intelligence/index.ts";
import { useTranslation } from "react-i18next";
import { currencyFractionDigits, formatMoney as formatMoneyValue, parseMajorUnits } from "../../types/money.ts";
import { toast } from "sonner";
import { categoryDisplayName } from "../../lib/categoryName.ts";
import { getDashboardMode } from "./dashboardMode.ts";
import { comparePeriodAmounts, type PeriodAmountComparison } from "./periodComparison.ts";

function formatMoney(minorUnits: number, currency: string): string {
  return formatMoneyValue({ minorUnits, currency });
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(document.documentElement.lang || undefined, { month: "short", day: "numeric" });
}

type TransactionFilter = "day" | "week" | "month" | "all";
type CashFlowPoint = {
  label: string;
  income: number;
  expenses: number;
  net: number;
};

function getTransactionFilterBounds(
  filter: TransactionFilter,
  asOfTimestamp: number,
  periodStart: number,
  periodEnd: number,
): { start: number; end: number } {
  switch (filter) {
    case "day":
      return { start: new Date(asOfTimestamp).setHours(0, 0, 0, 0), end: asOfTimestamp };
    case "week":
      return { start: asOfTimestamp - 7 * 24 * 60 * 60 * 1000, end: asOfTimestamp };
    case "month":
      return { start: periodStart, end: Math.min(periodEnd, asOfTimestamp) };
    case "all":
      return { start: 0, end: asOfTimestamp };
  }
}

function formatFilterDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(document.documentElement.lang || undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatFilterRange(start: number, end: number): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (startDate.toDateString() === endDate.toDateString()) return formatFilterDate(end);
  const locale = document.documentElement.lang || undefined;
  const startLabel = startDate.toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: startDate.getFullYear() === endDate.getFullYear() ? undefined : "numeric",
  });
  return `${startLabel} – ${formatFilterDate(end)}`;
}

function computePrevPeriod(year: number, month: number): { year: number; month: number } {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

// ── Spending breakdown bar ─────────────────────────────────────────────
function SpendingBar({ label, amount, total, currency }: { label: string; amount: number; total: number; currency: string }) {
  const pct = total > 0 ? (amount / total) * 100 : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="truncate pr-2 font-medium">{label}</span>
        <span className="shrink-0 text-muted-foreground">{formatMoney(amount, currency)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-ocean-primary rounded-full transition-all duration-300"
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  );
}

function buildCashFlowSeries(transactions: TransactionDisplay[] | undefined, start: number, end: number): CashFlowPoint[] {
  const dayMs = 24 * 60 * 60 * 1000;
  const spanDays = Math.max(1, Math.ceil((end - start) / dayMs));
  const bucketCount = Math.min(10, Math.max(5, spanDays));
  const bucketMs = Math.max(dayMs, Math.ceil((end - start) / bucketCount));

  const buckets: CashFlowPoint[] = Array.from({ length: bucketCount }, (_, i) => {
    const bucketStart = start + i * bucketMs;
    return {
      label: new Date(bucketStart).toLocaleDateString(document.documentElement.lang || undefined, { month: "short", day: "numeric" }),
      income: 0,
      expenses: 0,
      net: 0,
    };
  });

  for (const tx of transactions ?? []) {
    const index = Math.min(bucketCount - 1, Math.max(0, Math.floor((tx.timestamp - start) / bucketMs)));
    const bucket = buckets[index];
    if (bucket == null) continue;
    if (tx.displayAmount == null) continue;
    const value = Math.abs(tx.displayAmount.minorUnits);
    if (tx.direction === "income") {
      bucket.income += value;
      bucket.net += value;
    } else {
      bucket.expenses += value;
      bucket.net -= value;
    }
  }

  return buckets;
}

function CashFlowTrendChart({ points, currency }: { points: CashFlowPoint[]; currency: string }) {
  const { t } = useTranslation();
  const maxAmount = Math.max(1, ...points.flatMap((p) => [p.income, p.expenses, Math.abs(p.net)]));
  const width = 360;
  const height = 180;
  const padding = 24;
  const baseline = 118;
  const barArea = 86;
  const step = (width - padding * 2) / Math.max(1, points.length);
  const linePoints = points.map((point, index) => {
    const x = padding + index * step + step / 2;
    const y = baseline - (point.net / maxAmount) * (barArea * 0.72);
    return `${x},${Math.max(18, Math.min(height - 30, y))}`;
  }).join(" ");

  return (
    <div className="space-y-3">
      <div className="h-48 w-full overflow-hidden rounded-lg border border-border bg-card/70">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t("dashboard.cashFlowTrend")} className="h-full w-full">
          <defs>
            <linearGradient id="incomeGradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--sage)" stopOpacity="0.92" />
              <stop offset="100%" stopColor="var(--sage)" stopOpacity="0.42" />
            </linearGradient>
            <linearGradient id="expenseGradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--amber)" stopOpacity="0.46" />
              <stop offset="100%" stopColor="var(--amber)" stopOpacity="0.88" />
            </linearGradient>
          </defs>
          <line x1={padding} x2={width - padding} y1={baseline} y2={baseline} stroke="var(--border)" strokeWidth="1" />
          {points.map((point, index) => {
            const x = padding + index * step + step / 2;
            const incomeHeight = (point.income / maxAmount) * barArea;
            const expenseHeight = (point.expenses / maxAmount) * barArea;
            return (
              <g key={`${point.label}-${index}`}>
                <rect x={x - 9} y={baseline - incomeHeight} width="8" height={Math.max(2, incomeHeight)} rx="3" fill="url(#incomeGradient)" />
                <rect x={x + 1} y={baseline} width="8" height={Math.max(2, expenseHeight)} rx="3" fill="url(#expenseGradient)" />
                {(index === 0 || index === points.length - 1) && (
                  <text x={x} y={height - 9} textAnchor="middle" fontSize="10" fill="var(--muted-foreground)">
                    {point.label}
                  </text>
                )}
              </g>
            );
          })}
          {linePoints.length > 0 && (
            <polyline points={linePoints} fill="none" stroke="var(--ocean-primary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          )}
        </svg>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <ChartLegend label={t("dashboard.income")} value={formatMoney(points.reduce((s, p) => s + p.income, 0), currency)} className="bg-sage" />
        <ChartLegend label={t("dashboard.expenses")} value={formatMoney(points.reduce((s, p) => s + p.expenses, 0), currency)} className="bg-amber" />
        <ChartLegend label={t("dashboard.net")} value={formatMoney(points.reduce((s, p) => s + p.net, 0), currency)} className="bg-ocean-primary" />
      </div>
    </div>
  );
}

function ChartLegend({ label, value, className }: { label: string; value: string; className: string }) {
  return (
    <div className="rounded-md bg-accent/55 p-2">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <span className={`h-2 w-2 rounded-full ${className}`} />
        {label}
      </div>
      <p className="mt-1 truncate font-medium tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function SpendingMixChart({
  items,
  total,
  currency,
}: {
  items: Array<{ id: string; name: string; total: { minorUnits: number; currency: string } }>;
  total: number;
  currency: string;
}) {
  const { t } = useTranslation();
  const palette = ["#002fa7", "#3455b8", "#6579c7", "#96a2d8", "#bbc3e5", "#d9def3"];
  let cursor = 0;
  const stops = items.slice(0, 6).map((item, index) => {
    const pct = total > 0 ? (item.total.minorUnits / total) * 100 : 0;
    const start = cursor;
    cursor += pct;
    return `${palette[index % palette.length]} ${start}% ${cursor}%`;
  });
  const background = stops.length > 0 ? `conic-gradient(${stops.join(", ")})` : "var(--muted)";

  return (
    <div className="mx-auto grid h-36 w-36 place-items-center rounded-full" style={{ background }}>
      <div className="grid h-20 w-20 place-items-center rounded-full border border-border bg-card text-center">
        <span className="text-[10px] font-medium uppercase text-muted-foreground">{t("dashboard.total")}</span>
        <span className="text-sm font-semibold tabular-nums">{formatMoney(total, currency)}</span>
      </div>
    </div>
  );
}

function HealthRail({
  activeBudgets,
  activeGoals,
  snapshot,
}: {
  activeBudgets: FinancialStateSnapshot["budgets"];
  activeGoals: FinancialStateSnapshot["goals"];
  snapshot: FinancialStateSnapshot;
}) {
  const { t } = useTranslation();
  const budgetAverage = activeBudgets.length === 0
    ? 0
    : Math.round(activeBudgets.reduce((sum, budget) => sum + (snapshot.budgetProgress[budget.id]?.percentage ?? 0), 0) / activeBudgets.length);
  const goalAverage = activeGoals.length === 0
    ? 0
    : Math.round(activeGoals.reduce((sum, goal) => sum + (snapshot.goalProgress[goal.id]?.percentage ?? 0), 0) / activeGoals.length);
  const cashflowScore = snapshot.periodIncome.minorUnits === 0
    ? 0
    : Math.max(0, Math.min(100, Math.round((snapshot.netCashFlow.minorUnits / snapshot.periodIncome.minorUnits) * 100)));
  const hasBudgetStatus = activeBudgets.length > 0;
  const hasGoalStatus = activeGoals.length > 0;
  const hasIncomeShare = snapshot.periodIncome.minorUnits > 0;

  if (!hasBudgetStatus && !hasGoalStatus && !hasIncomeShare) return null;

  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {hasBudgetStatus && (
        <HealthPill label={t("dashboard.budgetUse")} value={`${budgetAverage}%`} progress={Math.min(100, budgetAverage)} tone={budgetAverage > 90 ? "risk" : "normal"} />
      )}
      {hasGoalStatus && (
        <HealthPill label={t("dashboard.goalProgress")} value={`${goalAverage}%`} progress={Math.min(100, goalAverage)} tone="good" />
      )}
      {hasIncomeShare && (
        <HealthPill label={t("dashboard.cashMargin")} value={`${cashflowScore}%`} progress={cashflowScore} tone={cashflowScore < 10 ? "risk" : "good"} footer={t("dashboard.cashMarginFooter")} />
      )}
    </div>
  );
}

function HealthPill({ label, value, progress, tone, footer }: { label: string; value: string; progress: number; tone: "neutral" | "normal" | "good" | "risk"; footer?: string }) {
  const toneClass = tone === "risk"
    ? "text-destructive [&>div>div]:bg-destructive"
    : tone === "good"
      ? "text-sage [&>div>div]:bg-sage"
      : tone === "neutral"
        ? "text-muted-foreground"
        : "text-ocean-dark";
  return (
    <div className={`rounded-lg border border-border bg-card/75 p-3 ${toneClass}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold tabular-nums">{value}</p>
      </div>
      <Progress value={progress} className="mt-2 h-1.5" />
      {footer != null && <p className="mt-2 text-xs text-muted-foreground">{footer}</p>}
    </div>
  );
}

// ── Analysis card (AI insight) ─────────────────────────────────────────
function InsightCard({ insight }: { insight: AIResult }) {
  const { t } = useTranslation();
  if ("unavailable" in insight) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center gap-2 pb-2">
          <Lightbulb className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">{t("dashboard.aiInsight")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{insight.message}</p>
        </CardContent>
      </Card>
    );
  }
  return (
      <Card>
        <CardHeader className="flex flex-row items-center gap-2 pb-2">
          <Lightbulb className="h-4 w-4 text-ocean-secondary" />
          <CardTitle className="text-sm font-medium">{t("dashboard.aiInsight")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed">{insight.text}</p>
          <p className="text-xs text-muted-foreground mt-2">{t("dashboard.viaProvider", { provider: insight.provider })}</p>
        </CardContent>
      </Card>
  );
}

// ── Main dashboard content ──────────────────────────────────────────────
type TransactionEdit = {
  transaction: TransactionDisplay;
  categoryId: string;
  direction: "income" | "expense";
  amount: string;
  note: string;
};

function amountInput(transaction: TransactionDisplay): string {
  const digits = currencyFractionDigits(transaction.amount.currency);
  return digits === 0
    ? String(transaction.amount.minorUnits)
    : (transaction.amount.minorUnits / 10 ** digits).toFixed(digits);
}

function TransactionActivity({
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
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
        <CardTitle className="text-base">{t("dashboard.transactions")}</CardTitle>
        {canMutate && (
          <Button asChild variant="outline" size="sm">
            <Link to="/capture" search={{ tab: "transaction" }}>
              <PlusCircle className="mr-1 h-4 w-4" />
              {t("dashboard.addTransaction")}
            </Link>
          </Button>
        )}
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
                    <div className={`h-2 w-2 shrink-0 rounded-full ${isIncome ? "bg-green-500" : "bg-red-500"}`} />
                    <div className="min-w-0">
                      <p className="truncate text-sm">{category == null ? t("common.unknown") : categoryDisplayName(category, t)}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(transaction.timestamp)}{transaction.note ? ` · ${transaction.note}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="ml-2 flex shrink-0 items-center gap-1">
                    <span className={`text-sm font-medium ${isIncome ? "text-green-600" : "text-red-500"}`}>
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

function DashboardSetup() {
  const { t } = useTranslation();
  return (
    <main aria-label={t("dashboard.title")} className="app-page">
      <div className="page-head">
        <h1 className="page-title">{t("dashboard.title")}</h1>
      </div>
      <Card className="max-w-3xl border-ocean-primary/25">
        <CardContent className="p-5 sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ocean-primary">01</p>
          <h2 className="mt-3 text-xl font-semibold tracking-tight">{t("dashboard.setup.title")}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{t("dashboard.setup.body")}</p>
          <Button asChild className="mt-5 w-full sm:w-auto">
            <Link to="/capture" search={{ tab: "manage" }}>
              <PlusCircle className="mr-2 h-4 w-4" />
              {t("dashboard.setup.action")}
            </Link>
          </Button>
          <ol className="mt-7 grid gap-3 border-t border-border pt-5 sm:grid-cols-3">
            {["account", "transaction", "review"].map((step, index) => (
              <li key={step} className="flex gap-3">
                <span className="text-sm font-semibold tabular-nums text-ocean-primary">{String(index + 1).padStart(2, "0")}</span>
                <span className="text-sm text-muted-foreground">{t(`dashboard.setup.steps.${step}`)}</span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </main>
  );
}

function FirstTransactionDashboard({ snapshot, accountCount }: { snapshot: FinancialStateSnapshot; accountCount: number }) {
  const { t } = useTranslation();
  return (
    <main aria-label={t("dashboard.title")} className="app-page">
      <div className="page-head">
        <h1 className="page-title">{t("dashboard.title")}</h1>
      </div>
      <section aria-label={t("dashboard.balanceSummary")} className="grid max-w-3xl gap-3 sm:grid-cols-2">
        <SummaryCard
          title={t("dashboard.totalBalance")}
          value={formatMoney(snapshot.totalBalance.minorUnits, snapshot.totalBalance.currency)}
          icon={<Wallet className="h-4 w-4 text-muted-foreground" />}
          footer={t("dashboard.accountCount", { count: accountCount })}
        />
        <Card className="border-ocean-primary/25">
          <CardContent className="flex h-full flex-col items-start justify-between gap-4 p-5">
            <div>
              <CardTitle className="text-base">{t("dashboard.firstTransaction.title")}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">{t("dashboard.firstTransaction.body")}</p>
            </div>
            <Button asChild className="w-full sm:w-auto">
              <Link to="/capture" search={{ tab: "transaction" }}>
                <PlusCircle className="mr-2 h-4 w-4" />
                {t("dashboard.firstTransaction.action")}
              </Link>
            </Button>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

type PeriodComparisonSummary = {
  incomeChange: PeriodAmountComparison;
  expenseChange: PeriodAmountComparison;
};

function formatSignedMoney(minorUnits: number, currency: string): string {
  if (minorUnits === 0) return formatMoney(0, currency);
  return `${minorUnits > 0 ? "+" : "−"}${formatMoney(Math.abs(minorUnits), currency)}`;
}

function FinancialOverview({
  snapshot,
  isCurrentPeriod,
  comparison,
}: {
  snapshot: FinancialStateSnapshot;
  isCurrentPeriod: boolean;
  comparison: PeriodComparisonSummary | null;
}) {
  const { t } = useTranslation();
  const currency = snapshot.totalBalance.currency;
  const activeAccountCount = snapshot.accounts.filter((account) => account.isActive).length;
  const net = snapshot.netCashFlow.minorUnits;
  const netTone = net === 0 ? "text-foreground" : net > 0 ? "text-green-600" : "text-red-500";
  const periodDate = new Date(snapshot.periodStart);
  const locale = document.documentElement.lang || undefined;
  const periodMonth = periodDate.toLocaleDateString(locale, { month: "long" });
  const isFrench = document.documentElement.lang.toLowerCase().startsWith("fr");
  const frenchElision = [3, 7, 9].includes(periodDate.getMonth());
  const contextualMonth = isFrench
    ? `${frenchElision ? "d’" : "de "}${periodMonth}`
    : periodMonth;

  return (
    <section aria-label={t("dashboard.balanceSummary")} className="grid gap-3 lg:grid-cols-[minmax(18rem,0.85fr)_minmax(0,1.65fr)]">
      <Card className="border-ocean-primary/30">
        <CardHeader className="flex flex-row items-start justify-between gap-4 pb-2">
          <div>
            <p className="text-xs font-medium text-ocean-primary">{t("dashboard.allActiveAccounts")}</p>
            <CardTitle className="mt-1 text-base">
              {t(isCurrentPeriod ? "dashboard.availableToday" : "dashboard.balanceAtPeriodEnd")}
            </CardTitle>
          </div>
          <Wallet className="h-5 w-5 shrink-0 text-ocean-primary" />
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-semibold tracking-tight tabular-nums">
            {formatMoney(snapshot.totalBalance.minorUnits, currency)}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {t("dashboard.balanceContext", { count: activeAccountCount })}
          </p>
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
                <ArrowDown className={`h-4 w-4 ${snapshot.periodIncome.minorUnits === 0 ? "text-muted-foreground" : "text-green-600"}`} />
              </div>
              <p className={`mt-1 text-xl font-semibold tabular-nums ${snapshot.periodIncome.minorUnits === 0 ? "text-foreground" : "text-green-600"}`}>
                {formatSignedMoney(snapshot.periodIncome.minorUnits, currency)}
              </p>
              {comparison != null && (
                <PeriodComparisonText comparison={comparison.incomeChange} invert={false} currency={currency} />
              )}
            </div>
            <div className="p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-muted-foreground">{t("dashboard.moneySpent")}</p>
                <ArrowUp className={`h-4 w-4 ${snapshot.periodExpenses.minorUnits === 0 ? "text-muted-foreground" : "text-red-500"}`} />
              </div>
              <p className={`mt-1 text-xl font-semibold tabular-nums ${snapshot.periodExpenses.minorUnits === 0 ? "text-foreground" : "text-red-500"}`}>
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
        </CardContent>
      </Card>
    </section>
  );
}

function DashboardContent({
  snapshot,
  canMutate,
  periodComparison,
}: {
  snapshot: FinancialStateSnapshot;
  canMutate: boolean;
  periodComparison: PeriodComparisonSummary | null;
}) {
  const { t } = useTranslation();
  const masterKey = useMasterKey();
  const [transactionFilter, setTransactionFilter] = useState<TransactionFilter>("month");
  const [aiInsight, setAiInsight] = useState<AIResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiCapability, setAiCapability] = useState<AICapability | null>(null);
  const [transactionEdit, setTransactionEdit] = useState<TransactionEdit | null>(null);
  const [transactionToDelete, setTransactionToDelete] = useState<TransactionDisplay | null>(null);
  const updateTransaction = useUpdateTransaction();
  const deleteTransaction = useDeleteTransaction();

  const periodStart = snapshot.periodStart;
  const periodEnd = snapshot.periodEnd;
  const { data: periodTransactions, isLoading: periodTransactionsLoading } = useTransactionsInRange(periodStart, periodEnd);
  const transactionBounds = useMemo(
    () => getTransactionFilterBounds(transactionFilter, snapshot.asOfTimestamp, periodStart, periodEnd),
    [transactionFilter, snapshot.asOfTimestamp, periodStart, periodEnd],
  );
  const { data: listTransactions, isLoading: listTransactionsLoading } = useTransactionsInRange(
    transactionBounds.start,
    transactionBounds.end,
  );
  const filteredTransfers = useMemo(
    () => snapshot.transfers.filter(
      (transfer) => transfer.timestamp >= transactionBounds.start && transfer.timestamp <= transactionBounds.end,
    ),
    [snapshot.transfers, transactionBounds.end, transactionBounds.start],
  );
  const transactionFilterContext = transactionFilter === "all"
    ? t("dashboard.transactionsAllContext", { date: formatFilterDate(transactionBounds.end) })
    : t("dashboard.transactionsRangeContext", {
      range: formatFilterRange(transactionBounds.start, transactionBounds.end),
    });

  useEffect(() => {
    let active = true;
    void getAICapability()
      .then((capability) => {
        if (active) setAiCapability(capability);
      })
      .catch(() => {
        if (active) setAiCapability(null);
      });
    return () => {
      active = false;
    };
  }, [masterKey]);

  const categories = snapshot.categories;
  const activeBudgets = snapshot.budgets.filter((b) => !b.isArchived);
  const activeGoals = snapshot.goals.filter((g) => !g.isArchived);

  const categorySpending = useMemo(() => {
    const ex = categories
      .map((c) => ({
        id: c.id,
        name: categoryDisplayName(c, t),
        total: snapshot.categoryTotals[c.id],
      }))
      .filter((c): c is typeof c & { total: NonNullable<typeof c.total> } => c.total != null && c.total.minorUnits > 0)
      .sort((a, b) => b.total.minorUnits - a.total.minorUnits);
    const totalExpenses = ex.reduce((s, c) => s + c.total.minorUnits, 0);
    return { items: ex, total: totalExpenses, currency: ex[0]?.total.currency ?? snapshot.baseCurrency };
  }, [categories, snapshot.baseCurrency, snapshot.categoryTotals, t]);

  const cashFlowSeries = useMemo(
    () => buildCashFlowSeries(periodTransactions, periodStart, periodEnd),
    [periodTransactions, periodStart, periodEnd],
  );

  // budget alerts
  const budgetAlerts = activeBudgets
    .map((b) => {
      const prog = snapshot.budgetProgress[b.id];
      if (prog == null) return null;
      const cat = snapshot.categories.find((c) => c.id === b.categoryId);
      return { budget: b, progress: prog, categoryName: cat == null ? t("common.unknown") : categoryDisplayName(cat, t) };
    })
    .filter((x): x is NonNullable<typeof x> => x != null)
    .filter((x) => x.progress.percentage >= 80);

  // load AI insight
  const handleAiInsight = async () => {
    if (aiLoading || aiCapability?.available !== true) return;
    setAiLoading(true);
    try {
      const result = await requestInsight("insight", snapshot, masterKey);
      setAiInsight(result);
    } catch {
      setAiInsight({
        unavailable: true,
        taskType: "reasoning",
        message: t("dashboard.insightLoadFailed"),
      });
    } finally {
      setAiLoading(false);
    }
  };

  const currency = snapshot.totalBalance.currency;

  const saveTransaction = async () => {
    if (transactionEdit == null) return;
    const minorUnits = parseMajorUnits(transactionEdit.amount, transactionEdit.transaction.amount.currency);
    if (minorUnits == null || minorUnits <= 0) {
      toast.error(t("dashboard.transactionActions.invalidAmount"));
      return;
    }
    try {
      await updateTransaction.mutateAsync({
        originalEventId: transactionEdit.transaction.id,
        accountId: transactionEdit.transaction.accountId,
        categoryId: transactionEdit.categoryId,
        amount: { minorUnits, currency: transactionEdit.transaction.amount.currency },
        direction: transactionEdit.direction,
        note: transactionEdit.note,
        tags: transactionEdit.transaction.tags,
        merchant: transactionEdit.transaction.merchant,
      });
      setTransactionEdit(null);
      toast.success(t("dashboard.transactionActions.updated"));
    } catch {
      toast.error(t("dashboard.transactionActions.updateFailed"));
    }
  };

  const confirmDeleteTransaction = async () => {
    if (transactionToDelete == null) return;
    try {
      await deleteTransaction.mutateAsync({ originalEventId: transactionToDelete.id });
      setTransactionToDelete(null);
      toast.success(t("dashboard.transactionActions.deleted"));
    } catch {
      toast.error(t("dashboard.transactionActions.deleteFailed"));
    }
  };

  return (
    <div className="space-y-4">
      {snapshot.missingFxCurrencies.length > 0 && (
        <Card className="border-amber bg-amber-wash">
          <CardContent className="flex items-start gap-3 pt-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">{t("dashboard.missingFxTitle")}</p>
              <p className="text-xs text-amber-700 dark:text-amber-400">
                {t("dashboard.missingFxBody", {
                  currencies: snapshot.missingFxCurrencies.join(", "),
                  baseCurrency: snapshot.baseCurrency,
                })}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
      {/* ── Alerts ── */}
      {(snapshot.netCashFlow.minorUnits < 0 || budgetAlerts.some((a) => a.progress.percentage >= 100)) && (
        <section aria-label={t("dashboard.alerts")} className="space-y-2">
          {snapshot.netCashFlow.minorUnits < 0 && (
            <Card className="border-amber bg-amber-wash">
              <CardContent className="flex items-start gap-3 pt-4">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-300">{t("dashboard.negativeCashFlow")}</p>
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    {t("dashboard.negativeCashFlowBody", { amount: formatMoney(Math.abs(snapshot.netCashFlow.minorUnits), currency) })}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
          {budgetAlerts
            .filter((a) => a.progress.percentage >= 100)
            .map((a) => (
            <Card key={a.budget.id} className="border-destructive bg-destructive/10">
                <CardContent className="flex items-start gap-3 pt-4">
                  <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-red-800 dark:text-red-300">{t("dashboard.budgetExceeded")}</p>
                    <p className="text-xs text-red-700 dark:text-red-400">
                      {t("dashboard.budgetExceededBody", { name: a.budget.name, amount: formatMoney(a.progress.limit.minorUnits, a.progress.limit.currency) })}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
        </section>
      )}

      <FinancialOverview snapshot={snapshot} isCurrentPeriod={canMutate} comparison={periodComparison} />

      <TransactionActivity
        snapshot={snapshot}
        canMutate={canMutate}
        filter={transactionFilter}
        onFilterChange={setTransactionFilter}
        filterContext={transactionFilterContext}
        transactions={listTransactions}
        loading={listTransactionsLoading}
        transfers={filteredTransfers}
        onEdit={(transaction) => setTransactionEdit({
          transaction,
          categoryId: transaction.categoryId,
          direction: transaction.direction,
          amount: amountInput(transaction),
          note: transaction.note,
        })}
        onDelete={setTransactionToDelete}
      />


      <HealthRail
        activeBudgets={activeBudgets}
        activeGoals={activeGoals}
        snapshot={snapshot}
      />



      {/* ── Two-column layout on desktop ── */}
      <section className="grid gap-3 lg:grid-cols-2">
        {/* Upcoming recurring */}
        {snapshot.projectedRecurring.length > 0 && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">{t("dashboard.upcoming")}</CardTitle>
              <Repeat className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {snapshot.projectedRecurring.slice(0, 5).map((item, i) => (
                  <li key={i} className="flex items-center justify-between py-1">
                    <span className="text-sm">{item.label}</span>
                    <span className="text-sm font-medium">
                      {formatMoney(item.amount.minorUnits, item.amount.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Budgets */}
        {activeBudgets.length > 0 && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">{t("budgets.title")}</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="space-y-4">
              {activeBudgets.map((budget) => {
                const prog = snapshot.budgetProgress[budget.id];
                if (prog == null) return null;
                const cat = snapshot.categories.find((c) => c.id === budget.categoryId);
                const overspent = prog.percentage > 100;
                const nearingLimit = prog.percentage >= 80 && !overspent;
                return (
                  <div key={budget.id} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1 min-w-0">
                        <span className="truncate">{budget.name}</span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-normal shrink-0">
                          {cat?.name ?? t("common.unknown")}
                        </Badge>
                        {nearingLimit && <Info className="h-3 w-3 text-amber-500 shrink-0" />}
                        {overspent && <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />}
                      </span>
                      <span className={overspent ? "text-destructive font-medium" : nearingLimit ? "text-amber-600 font-medium" : "text-muted-foreground"}>
                        {formatMoney(prog.spent.minorUnits, prog.spent.currency)} / {formatMoney(prog.limit.minorUnits, prog.limit.currency)}
                      </span>
                    </div>
                    <Progress
                      value={Math.min(prog.percentage, 100)}
                      className={overspent ? "bg-red-200 [&>div]:bg-destructive" : nearingLimit ? "bg-amber-200 [&>div]:bg-amber-500" : ""}
                    />
                    {nearingLimit && !overspent && (
                      <p className="text-xs text-amber-600">{t("dashboard.remaining", { percentage: Math.round(100 - prog.percentage) })}</p>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}
      </section>

      {/* ── Goals (full width) ── */}
      {activeGoals.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">{t("goals.title")}</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {activeGoals.map((goal) => {
              const prog = snapshot.goalProgress[goal.id];
              if (prog == null) return null;
              return (
                <div key={goal.id} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span>{goal.name}</span>
                    <span className="text-muted-foreground">
                      {formatMoney(prog.accumulated.minorUnits, prog.accumulated.currency)} / {formatMoney(prog.target.minorUnits, prog.target.currency)}
                    </span>
                  </div>
                  <Progress value={Math.min(prog.percentage, 100)} />
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <section aria-label={t("dashboard.analyticsOverview")} className="grid gap-3 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.9fr)]">
        <Card className="interactive-surface metric-surface">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">{t("dashboard.cashFlowTrend")}</CardTitle>
            <TrendingUp className="h-4 w-4 text-ocean-primary" />
          </CardHeader>
          <CardContent>
            {periodTransactionsLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <CashFlowTrendChart points={cashFlowSeries} currency={currency} />
            )}
          </CardContent>
        </Card>

        <Card className="interactive-surface">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">{t("dashboard.spendingMix")}</CardTitle>
            <BarChart3 className="h-4 w-4 text-ocean-primary" />
          </CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-[160px_minmax(0,1fr)] md:items-center">
            <div className="hidden md:block">
              <SpendingMixChart items={categorySpending.items} total={categorySpending.total} currency={categorySpending.currency} />
            </div>
            <div className="space-y-3">
              {categorySpending.items.length > 0 ? (
                categorySpending.items.slice(0, 6).map((category) => (
                  <SpendingBar
                    key={category.id}
                    label={category.name}
                    amount={category.total.minorUnits}
                    total={categorySpending.total}
                    currency={category.total.currency}
                  />
                ))
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">{t("dashboard.categoryNone")}</p>
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      {(aiInsight != null || aiCapability?.available === true) && (
        <section aria-label={t("dashboard.aiInsight")} className="max-w-xl">
          {aiInsight != null ? (
            <InsightCard insight={aiInsight} />
          ) : (
            <Card>
              <CardHeader className="flex flex-row items-center gap-2 pb-2">
                <Lightbulb className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">{t("dashboard.aiInsight")}</CardTitle>
              </CardHeader>
              <CardContent>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { void handleAiInsight(); }}
                  disabled={aiLoading}
                >
                  {aiLoading ? t("dashboard.analyzing") : t("dashboard.analyzePeriod")}
                </Button>
              </CardContent>
            </Card>
          )}
        </section>
      )}

      <Dialog open={transactionEdit != null} onOpenChange={(open) => { if (!open) setTransactionEdit(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("dashboard.transactionActions.editTitle")}</DialogTitle>
            <DialogDescription>{t("dashboard.transactionActions.editDescription")}</DialogDescription>
          </DialogHeader>
          {transactionEdit != null && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="edit-transaction-category" className="text-sm font-medium">{t("dashboard.transactionActions.category")}</label>
                <Select value={transactionEdit.categoryId} onValueChange={(categoryId) => setTransactionEdit((value) => value == null ? null : { ...value, categoryId })}>
                  <SelectTrigger id="edit-transaction-category"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {snapshot.categories.filter((category) => !category.isArchived).map((category) => (
                      <SelectItem key={category.id} value={category.id}>{categoryDisplayName(category, t)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label htmlFor="edit-transaction-direction" className="text-sm font-medium">{t("dashboard.transactionActions.type")}</label>
                <Select value={transactionEdit.direction} onValueChange={(direction) => setTransactionEdit((value) => value == null ? null : { ...value, direction: direction as "income" | "expense" })}>
                  <SelectTrigger id="edit-transaction-direction"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="expense">{t("dashboard.transactionActions.expense")}</SelectItem>
                    <SelectItem value="income">{t("dashboard.transactionActions.income")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label htmlFor="edit-transaction-amount" className="text-sm font-medium">{t("dashboard.transactionActions.amount", { currency: transactionEdit.transaction.amount.currency })}</label>
                <Input id="edit-transaction-amount" inputMode="decimal" value={transactionEdit.amount} onChange={(event) => setTransactionEdit((value) => value == null ? null : { ...value, amount: event.target.value })} />
              </div>
              <div className="space-y-2">
                <label htmlFor="edit-transaction-note" className="text-sm font-medium">{t("dashboard.transactionActions.note")}</label>
                <Input id="edit-transaction-note" value={transactionEdit.note} onChange={(event) => setTransactionEdit((value) => value == null ? null : { ...value, note: event.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransactionEdit(null)}>{t("dashboard.transactionActions.cancel")}</Button>
            <Button onClick={() => { void saveTransaction(); }} disabled={updateTransaction.isPending}>{t("dashboard.transactionActions.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={transactionToDelete != null} onOpenChange={(open) => { if (!open) setTransactionToDelete(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("dashboard.transactionActions.deleteTitle")}</DialogTitle>
            <DialogDescription>{t("dashboard.transactionActions.deleteDescription")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransactionToDelete(null)}>{t("dashboard.transactionActions.cancel")}</Button>
            <Button variant="destructive" onClick={() => { void confirmDeleteTransaction(); }} disabled={deleteTransaction.isPending}>{t("dashboard.transactionActions.confirmDelete")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Summary card sub-component ───────────────────────────────────────────
function SummaryCard({
  title, value, icon, footer, valueClass,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  footer?: string | undefined;
  valueClass?: string | undefined;
}) {
  return (
    <Card className="interactive-surface metric-surface min-h-28">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <p className={`text-2xl font-semibold tabular-nums ${valueClass ?? ""}`}>{value}</p>
        {footer != null && <p className="text-xs text-muted-foreground mt-1">{footer}</p>}
      </CardContent>
    </Card>
  );
}

// ── Export default ────────────────────────────────────────────────────────
export default function Dashboard() {
  const { t } = useTranslation();
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const isCurrent = selectedYear === now.getFullYear() && selectedMonth === now.getMonth() + 1;

  const currentQuery = useFinancialState();
  const transactionHistoryQuery = useHasTransactions();
  const prevPeriod = computePrevPeriod(selectedYear, selectedMonth);
  const historicalQuery = useHistoricalState(selectedYear, selectedMonth);
  const prevQuery = useHistoricalState(prevPeriod.year, prevPeriod.month);

  const { data: snapshot, isLoading, error } = isCurrent ? currentQuery : historicalQuery;
  const { data: prevSnapshot } = prevQuery;

  const periodComparison = useMemo(() => {
    if (snapshot == null || prevSnapshot == null) return null;
    return {
      incomeChange: comparePeriodAmounts(snapshot.periodIncome.minorUnits, prevSnapshot.periodIncome.minorUnits),
      expenseChange: comparePeriodAmounts(snapshot.periodExpenses.minorUnits, prevSnapshot.periodExpenses.minorUnits),
    };
  }, [snapshot, prevSnapshot]);

  const goPrev = () => {
    if (selectedMonth === 1) {
      setSelectedYear((y) => y - 1);
      setSelectedMonth(12);
    } else {
      setSelectedMonth((m) => m - 1);
    }
  };

  const goNext = () => {
    if (selectedMonth === 12) {
      setSelectedYear((y) => y + 1);
      setSelectedMonth(1);
    } else {
      setSelectedMonth((m) => m + 1);
    }
  };

  const goCurrent = () => {
    setSelectedYear(now.getFullYear());
    setSelectedMonth(now.getMonth() + 1);
  };

  if (currentQuery.isLoading || transactionHistoryQuery.isLoading) {
    return (
      <main aria-label={t("dashboard.title")} className="app-page">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </main>
    );
  }

  if (currentQuery.error != null || transactionHistoryQuery.error != null || currentQuery.data == null) {
    return (
      <main aria-label={t("dashboard.title")} className="flex min-h-[50vh] flex-col items-center justify-center space-y-2 text-center">
        <p className="text-destructive text-lg font-medium">{t("common.error")}</p>
        <p className="text-muted-foreground text-sm">{t("dashboard.loadFailed")}</p>
      </main>
    );
  }

  const activeAccountCount = currentQuery.data.accounts.filter((account) => account.isActive).length;
  const dashboardMode = getDashboardMode(activeAccountCount, transactionHistoryQuery.data === true);
  if (dashboardMode === "setup") return <DashboardSetup />;
  if (dashboardMode === "first-transaction") {
    return <FirstTransactionDashboard snapshot={currentQuery.data} accountCount={activeAccountCount} />;
  }

  if (isLoading) {
    return (
      <main aria-label={t("dashboard.title")} className="app-page">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-3 lg:grid-cols-[minmax(18rem,0.85fr)_minmax(0,1.65fr)]">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
        <Card>
          <CardHeader><Skeleton className="h-5 w-32" /></CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </CardContent>
        </Card>
      </main>
    );
  }

  if (error != null || snapshot == null) {
    return (
      <main aria-label={t("dashboard.title")} className="flex min-h-[50vh] flex-col items-center justify-center space-y-2 text-center">
        <p className="text-destructive text-lg font-medium">{t("common.error")}</p>
        <p className="text-muted-foreground text-sm">{t("dashboard.loadFailed")}</p>
      </main>
    );
  }

  return (
    <main aria-label={t("dashboard.title")} className="app-page">
      {/* ── Period header ── */}
      <div className="page-head">
        <div>
          <h1 className="page-title">
            {t(`dashboard.months.${selectedMonth - 1}`)} {selectedYear}
          </h1>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={goPrev} aria-label={t("dashboard.previousMonth")}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          {!isCurrent && (
            <Button variant="ghost" size="sm" className="text-xs" onClick={goCurrent}>
              {t("dashboard.today")}
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={goNext} aria-label={t("dashboard.nextMonth")} disabled={isCurrent}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <DashboardContent snapshot={snapshot} canMutate={isCurrent} periodComparison={periodComparison} />
    </main>
  );
}

// ── Period comparison ────────────────────────────────────────────────────
function PeriodComparisonText({
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
  const toneClass = isGood == null ? "text-muted-foreground" : isGood ? "text-green-600" : "text-red-500";
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
