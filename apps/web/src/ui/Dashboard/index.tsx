import { Fragment, useState, useMemo, useEffect, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useDeleteTransaction, useFinancialOperations, useFinancialState, useHasAnyMoneyMovement, useHistoricalState, useTransactionsInRange, useUpdateTransaction } from "../../hooks/useFinancialState.ts";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card.tsx";
import { Badge } from "../../components/ui/badge.tsx";
import { Progress } from "../../components/ui/progress.tsx";
import { Skeleton } from "../../components/ui/skeleton.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Input } from "../../components/ui/input.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select.tsx";
import {
  AlertTriangle, ArrowUp, ArrowDown, Wallet, TrendingUp, Target, Repeat,
  Info, BarChart3,
  Lightbulb, ArrowRightLeft, CalendarDays,
} from "lucide-react";
import type { FinancialStateSnapshot, TransactionDisplay } from "../../domain/financialState.ts";
import type { FinancialOperation } from "../../domain/financialOperations.ts";
import { useMasterKey } from "../../lib/masterKeyContext.ts";
import { getAICapability, type AICapability } from "../../lib/capabilities.ts";
import { requestInsight } from "../../pillars/intelligence/index.ts";
import type { AIResult } from "../../pillars/intelligence/index.ts";
import { useTranslation } from "react-i18next";
import { parseMajorUnits } from "../../types/money.ts";
import { toast } from "sonner";
import { categoryDisplayName } from "../../lib/categoryName.ts";
import { getDashboardMode } from "./dashboardMode.ts";
import { useOpenCaptureSheet } from "../../components/CaptureSheet/index.tsx";
import DeviceUnlockOffer from "../../components/DeviceUnlockOffer/index.tsx";
import AssistantCard from "../../components/AssistantCard/index.tsx";
import FirstSteps from "../../components/FirstSteps/index.tsx";
import { comparePeriodAmounts } from "./periodComparison.ts";
import {
  selectAccountDistribution,
  selectAccountOperations,
  selectAccountTransactions,
  selectBalanceTimeline,
  selectCashFlowTimeline,
  selectExpensesByCategory,
  selectPeriodTransactions,
  selectUpcomingCommitments,
  UNCATEGORIZED_CATEGORY_ID,
  } from "../../analytics/dashboard.ts";
import { summarizeMonthlyActivity } from "../../analytics/operations.ts";
import AppFaultPanel from "../../errors/AppFaultPanel.tsx";
import { classifyAppError } from "../../errors/diagnostics.ts";
import { formatMoney, formatDate, formatFilterDate, formatFilterRange, computePrevPeriod } from "./format.ts";
import { type TransactionFilter, type HomeSectionId, getTransactionFilterBounds, indexTransactionsById, selectHomeLayout, selectRecentMovements, RECENT_MOVEMENT_LIMIT } from "./homeSelectors.ts";
import RecentMovements from "./RecentMovements.tsx";
import HomeFold from "./HomeFold.tsx";
import AttentionCardHost from "./AttentionCardHost.tsx";
import { SpendingBar, CashFlowTrendChart, BalanceTrendChart } from "./HomeCharts.tsx";
import { HealthRail } from "./HomePlanningCards.tsx";
import { InsightCard } from "./AiInsightCard.tsx";
import { type TransactionEdit, amountInput } from "./transactionEdit.ts";
import { TransactionActivity } from "./TransactionActivity.tsx";
import { FirstTransactionDashboard } from "./FirstTransactionDashboard.tsx";
import { DashboardPeriodHeader } from "./DashboardPeriodHeader.tsx";
import { type PeriodComparisonSummary, FinancialOverview } from "./HomeSummary.tsx";

// ── Spending breakdown bar ─────────────────────────────────────────────

// ── Analysis card (AI insight) ─────────────────────────────────────────

// ── Main dashboard content ──────────────────────────────────────────────

function DashboardQuickActions() {
  const { t } = useTranslation();
  const openCapture = useOpenCaptureSheet();
  const quickActionClass = "h-auto min-w-0 justify-start whitespace-normal bg-card px-3 py-3 text-left leading-tight hover:bg-accent sm:px-4";
  return (
    <nav aria-label={t("dashboard.quickActions")} className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
      <Button type="button" variant="ghost" className={quickActionClass} onClick={() => openCapture("transaction", "expense")}>
        <ArrowUp className="mr-2 h-4 w-4 text-negative" />{t("dashboard.addExpense")}
      </Button>
      <Button type="button" variant="ghost" className={quickActionClass} onClick={() => openCapture("transaction", "income")}>
        <ArrowDown className="mr-2 h-4 w-4 text-positive" />{t("dashboard.addIncome")}
      </Button>
      <Button type="button" variant="ghost" className={quickActionClass} onClick={() => openCapture("transfer")}>
        <ArrowRightLeft className="mr-2 h-4 w-4 text-ocean-primary" />{t("dashboard.makeTransfer")}
      </Button>
      <Button asChild variant="ghost" className={quickActionClass}>
        <Link to="/planned-expenses"><CalendarDays className="mr-2 h-4 w-4 text-ocean-primary" />{t("dashboard.planExpense")}</Link>
      </Button>
    </nav>
  );
}

function DashboardContent({
  snapshot,
  canMutate,
  selectedAccountId,
  operations,
  operationsLoading,
}: {
  snapshot: FinancialStateSnapshot;
  canMutate: boolean;
  selectedAccountId: string;
  operations: readonly FinancialOperation[];
  operationsLoading: boolean;
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
  const periodEnd = Math.min(snapshot.periodEnd, snapshot.asOfTimestamp);
  const { data: allTransactions, isLoading: periodTransactionsLoading } = useTransactionsInRange(0, snapshot.asOfTimestamp);
  const periodOperations = useMemo(
    () => operations.filter((operation) => operation.timestamp >= periodStart && operation.timestamp <= periodEnd),
    [operations, periodEnd, periodStart],
  );
  const selectedAccount = selectedAccountId === "all"
    ? null
    : snapshot.accounts.find((account) => account.id === selectedAccountId && account.isActive) ?? null;
  const accountId = selectedAccount?.id ?? null;
  const scopedPeriodOperations = useMemo(
    () => selectAccountOperations(periodOperations, accountId),
    [accountId, periodOperations],
  );
  const transactionBounds = useMemo(
    () => getTransactionFilterBounds(transactionFilter, snapshot.asOfTimestamp, periodStart, periodEnd),
    [transactionFilter, snapshot.asOfTimestamp, periodStart, periodEnd],
  );
  const listTransactions = useMemo(
    () => selectAccountTransactions(selectPeriodTransactions(allTransactions ?? [], transactionBounds), accountId),
    [accountId, allTransactions, transactionBounds],
  );
  const listTransactionsLoading = periodTransactionsLoading;
  const filteredTransfers = useMemo(
    () => snapshot.transfers.filter(
      (transfer) => transfer.timestamp >= transactionBounds.start &&
        transfer.timestamp <= transactionBounds.end &&
        (accountId == null || transfer.fromAccountId === accountId || transfer.toAccountId === accountId),
    ),
    [accountId, snapshot.transfers, transactionBounds.end, transactionBounds.start],
  );
  const dateFilterContext = transactionFilter === "all"
    ? t("dashboard.transactionsAllContext", { date: formatFilterDate(transactionBounds.end) })
    : t("dashboard.transactionsRangeContext", {
      range: formatFilterRange(transactionBounds.start, transactionBounds.end),
    });
  const transactionFilterContext = selectedAccount == null
    ? dateFilterContext
    : t("dashboard.accountTransactionsContext", { account: selectedAccount.name, period: dateFilterContext });

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
  const accountDistribution = useMemo(() => selectAccountDistribution(snapshot), [snapshot]);
  const upcomingCommitments = useMemo(() => selectUpcomingCommitments(snapshot), [snapshot]);
  const activityCurrency = selectedAccount?.currency ?? snapshot.baseCurrency;
  const activitySummary = useMemo(() => summarizeMonthlyActivity({
    operations,
    start: periodStart,
    end: periodEnd,
    accountId,
    displayCurrency: activityCurrency,
  }), [accountId, activityCurrency, operations, periodEnd, periodStart]);
  const previousPeriod = computePrevPeriod(new Date(periodStart).getFullYear(), new Date(periodStart).getMonth() + 1);
  const previousStart = new Date(previousPeriod.year, previousPeriod.month - 1, 1).getTime();
  const previousEnd = new Date(previousPeriod.year, previousPeriod.month, 0, 23, 59, 59, 999).getTime();
  const previousActivitySummary = useMemo(() => summarizeMonthlyActivity({
    operations,
    start: previousStart,
    end: previousEnd,
    accountId,
    displayCurrency: activityCurrency,
  }), [accountId, activityCurrency, operations, previousEnd, previousStart]);
  const periodComparison = useMemo<PeriodComparisonSummary>(() => ({
    incomeChange: comparePeriodAmounts(activitySummary.received.minorUnits, previousActivitySummary.received.minorUnits),
    expenseChange: comparePeriodAmounts(activitySummary.spent.minorUnits, previousActivitySummary.spent.minorUnits),
  }), [activitySummary.received.minorUnits, activitySummary.spent.minorUnits, previousActivitySummary.received.minorUnits, previousActivitySummary.spent.minorUnits]);
  const overviewSnapshot = useMemo((): FinancialStateSnapshot => {
    return {
      ...snapshot,
      baseCurrency: activityCurrency,
      accounts: selectedAccount == null ? snapshot.accounts : [selectedAccount],
      totalBalance: selectedAccount?.balance ?? snapshot.totalBalance,
      periodIncome: activitySummary.received,
      periodExpenses: activitySummary.spent,
      netCashFlow: activitySummary.difference,
    };
  }, [activityCurrency, activitySummary.difference, activitySummary.received, activitySummary.spent, selectedAccount, snapshot]);

  const categorySpending = useMemo(() => {
    const items = selectExpensesByCategory(scopedPeriodOperations, { start: periodStart, end: periodEnd }, overviewSnapshot.baseCurrency)
      .map((item) => {
        const category = categories.find((candidate) => candidate.id === item.categoryId);
        return { ...item, name: item.categoryId === UNCATEGORIZED_CATEGORY_ID ? t("operations.uncategorized") : category == null ? t("common.unknown") : categoryDisplayName(category, t) };
      });
    return { items, total: items.reduce((sum, item) => sum + item.amount.minorUnits, 0), currency: overviewSnapshot.baseCurrency };
  }, [categories, overviewSnapshot.baseCurrency, periodEnd, periodStart, scopedPeriodOperations, t]);

  const cashFlowSeries = useMemo(
    () => selectCashFlowTimeline(scopedPeriodOperations, { start: periodStart, end: periodEnd }, 8, accountId),
    [accountId, scopedPeriodOperations, periodStart, periodEnd],
  );
  const balanceSeries = useMemo(
    () => selectBalanceTimeline(overviewSnapshot.totalBalance, scopedPeriodOperations, { start: periodStart, end: periodEnd }, 10, accountId ?? undefined),
    [accountId, overviewSnapshot.totalBalance, periodEnd, periodStart, scopedPeriodOperations],
  );
  const recentMovements = useMemo(
    () => selectRecentMovements(operations, { accountId, end: periodEnd, limit: RECENT_MOVEMENT_LIMIT }),
    [accountId, operations, periodEnd],
  );
  const transactionsById = useMemo(() => indexTransactionsById(allTransactions ?? []), [allTransactions]);

  // load AI insight
  const handleAiInsight = async () => {
    if (aiLoading || aiCapability?.available !== true) return;
    setAiLoading(true);
    try {
      const result = await requestInsight("insight", overviewSnapshot, masterKey);
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

  const currency = overviewSnapshot.totalBalance.currency;
  const asOfDayStart = new Date(snapshot.asOfTimestamp).setHours(0, 0, 0, 0);

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

  const layout = selectHomeLayout({ canMutate });
  const sections: Record<HomeSectionId, ReactNode> = {
    summary: (
          <FinancialOverview
            snapshot={overviewSnapshot}
            isCurrentPeriod={canMutate}
            comparison={selectedAccount == null ? periodComparison : null}
            accountName={selectedAccount?.name ?? null}
            activityContext={{ start: periodStart, end: periodEnd, accountId }}
          />
    ),
    firstSteps: <FirstSteps snapshot={snapshot} hasMovement />,
    quickActions: canMutate ? <DashboardQuickActions /> : null,
    attention: <AttentionCardHost snapshot={snapshot} />,
    recentMovements: (
      <RecentMovements
        snapshot={snapshot}
        movements={recentMovements}
        transactionsById={transactionsById}
        canMutate={canMutate}
        loading={operationsLoading || listTransactionsLoading}
        activityContext={{ start: periodStart, end: periodEnd, ...(accountId == null ? {} : { accountId }) }}
        onEdit={(transaction) => setTransactionEdit({
          transaction,
          categoryId: transaction.categoryId,
          direction: transaction.direction,
          amount: amountInput(transaction),
          note: transaction.note,
        })}
        onDelete={setTransactionToDelete}
      />
    ),
    assistant: <AssistantCard />,
    charts: (
          <section aria-label={t("dashboard.analyticsOverview")} className="grid gap-3 xl:grid-cols-2">
            <Card className="interactive-surface metric-surface xl:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base">{t("dashboard.balanceTrend")}</CardTitle>
                <Button asChild variant="ghost" size="sm"><Link to="/operations" search={accountId == null ? {} : { accountId }}>{t("dashboard.viewAll")}</Link></Button>
              </CardHeader>
              <CardContent>
                {operationsLoading ? <Skeleton className="h-52 w-full" /> : <BalanceTrendChart points={balanceSeries} currency={currency} periodStart={periodStart} accountId={accountId} />}
              </CardContent>
            </Card>
            <Card className="interactive-surface metric-surface">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base">{t("dashboard.cashFlowTrend")}</CardTitle>
                <TrendingUp className="h-4 w-4 text-ocean-primary" />
              </CardHeader>
              <CardContent>
                {operationsLoading ? (
                  <Skeleton className="h-48 w-full" />
                ) : (
                  <CashFlowTrendChart points={cashFlowSeries} currency={currency} accountId={accountId} />
                )}
              </CardContent>
            </Card>

            <Card className="interactive-surface">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base">{t("dashboard.spendingMix")}</CardTitle>
                <BarChart3 className="h-4 w-4 text-ocean-primary" />
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {categorySpending.items.length > 0 ? (
                    categorySpending.items.slice(0, 6).map((category) => (
                      <SpendingBar
                        key={category.categoryId}
                        label={category.name}
                        amount={category.amount.minorUnits}
                        total={categorySpending.total}
                        currency={category.amount.currency}
                        categoryId={category.categoryId}
                        accountId={accountId}
                        start={periodStart}
                        end={periodEnd}
                      />
                    ))
                  ) : (
                    <p className="py-8 text-center text-sm text-muted-foreground">{t("dashboard.categoryNone")}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </section>
    ),
    planningCards: (
      <>
          <HealthRail
            activeBudgets={activeBudgets}
            activeGoals={activeGoals}
            snapshot={snapshot}
          />

          {/* ── Two-column layout on desktop ── */}
          <section className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {upcomingCommitments.length > 0 && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <CardTitle className="text-base">{t("dashboard.upcoming")}</CardTitle>
                  <Repeat className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {upcomingCommitments.slice(0, 5).map((item) => (
                      <li key={item.id} className="border-b border-border py-2 last:border-b-0">
                        <Link
                          to={item.kind === "planned_expense" ? "/planned-expenses" : item.kind === "recurring_expense" ? "/recurring" : "/debts"}
                          className="interactive-surface flex items-center justify-between gap-3"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">{item.label}</span>
                            <span className="mt-0.5 block text-xs text-muted-foreground">
                              {t(`dashboard.commitmentKinds.${item.kind}`)}
                              {item.dueAt == null
                                ? ""
                                : ` · ${item.dueAt < asOfDayStart ? t("dashboard.overdueDate", { date: formatDate(item.dueAt) }) : formatDate(item.dueAt)}`}
                            </span>
                          </span>
                          <span className="shrink-0 text-sm font-semibold tabular-nums">{formatMoney(item.amount.minorUnits, item.amount.currency)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {selectedAccount == null && accountDistribution.length > 1 && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <CardTitle className="text-base">{t("dashboard.accountDistribution")}</CardTitle>
                  <Wallet className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="space-y-3">
                  {accountDistribution.slice(0, 6).map((account) => (
                    <div key={account.accountId} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="truncate font-medium">{account.name}</span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">{formatMoney(account.amount.minorUnits, account.amount.currency)}</span>
                      </div>
                      {account.share == null ? (
                        <p className="text-[11px] text-muted-foreground">{t("dashboard.accountShareUnavailable")}</p>
                      ) : (
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-ocean-primary" style={{ width: `${Math.min(100, account.share)}%` }} /></div>
                      )}
                    </div>
                  ))}
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
                    const limitReached = prog.percentage === 100;
                    const nearingLimit = prog.percentage >= 70 && !limitReached && !overspent;
                    const budgetStatus = overspent
                      ? t("dashboard.budgetStates.exceeded")
                      : limitReached
                        ? t("dashboard.budgetStates.reached")
                        : nearingLimit
                          ? t("dashboard.budgetStates.watch")
                          : t("dashboard.budgetStates.within");
                    return (
                      <div key={budget.id} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-1 min-w-0">
                            <span className="truncate">{budget.name}</span>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-normal shrink-0">
                              {cat?.name ?? t("common.unknown")}
                            </Badge>
                            {(nearingLimit || limitReached) && <Info className="h-3 w-3 text-attention shrink-0" />}
                            {overspent && <AlertTriangle className="h-3 w-3 text-negative shrink-0" />}
                          </span>
                          <span className={overspent ? "text-negative font-medium" : nearingLimit ? "text-attention font-medium" : "text-muted-foreground"}>
                            {formatMoney(prog.spent.minorUnits, prog.spent.currency)} / {formatMoney(prog.limit.minorUnits, prog.limit.currency)}
                          </span>
                        </div>
                        <Progress
                          value={Math.min(prog.percentage, 100)}
                          className={overspent ? "bg-negative-wash [&>div]:bg-negative" : nearingLimit || limitReached ? "bg-attention-wash [&>div]:bg-attention" : ""}
                        />
                        <p className={`text-xs ${overspent ? "text-negative" : nearingLimit || limitReached ? "text-attention" : "text-muted-foreground"}`}>
                          {budgetStatus}{nearingLimit ? ` · ${t("dashboard.remaining", { percentage: Math.round(100 - prog.percentage) })}` : ""}
                        </p>
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
      </>
    ),
    activity: (
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
    ),
    aiInsight: (
      <>
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
      </>
    ),
  };

  return (
    <div className="space-y-4">
      {layout.aboveFold.map((id) => <Fragment key={id}>{sections[id]}</Fragment>)}
      <HomeFold>
        {layout.belowFold.map((id) => <Fragment key={id}>{sections[id]}</Fragment>)}
      </HomeFold>

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

// ── Export default ────────────────────────────────────────────────────────
export default function Dashboard() {
  const { t } = useTranslation();
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedAccountId, setSelectedAccountId] = useState("all");
  const isCurrent = selectedYear === now.getFullYear() && selectedMonth === now.getMonth() + 1;

  const currentQuery = useFinancialState();
  const hasMovementQuery = useHasAnyMoneyMovement();
  const operationsQuery = useFinancialOperations({ enabled: hasMovementQuery.data === true });
  const historicalQuery = useHistoricalState(selectedYear, selectedMonth);

  const { data: snapshot, isLoading, error } = isCurrent ? currentQuery : historicalQuery;

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

  if (currentQuery.isLoading || hasMovementQuery.isLoading || operationsQuery.isLoading) {
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

  if (currentQuery.error != null || operationsQuery.error != null || currentQuery.data == null) {
    const loadError = currentQuery.error ?? operationsQuery.error;
    return (
      <main aria-label={t("dashboard.title")} className="app-page flex min-h-[60vh] items-center justify-center">
        <AppFaultPanel
          faultCode={classifyAppError(loadError, "dashboard_load")}
          surfaceId="dashboard"
          onRetry={() => { void Promise.all([currentQuery.refetch(), operationsQuery.refetch()]); }}
        />
      </main>
    );
  }

  const activeAccountCount = currentQuery.data.accounts.filter((account) => account.isActive).length;
  const dashboardMode = getDashboardMode(hasMovementQuery.data === true);
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
      <main aria-label={t("dashboard.title")} className="app-page flex min-h-[60vh] items-center justify-center">
        <AppFaultPanel
          faultCode={classifyAppError(error, "dashboard_load")}
          surfaceId="dashboard"
          onRetry={() => { void historicalQuery.refetch(); }}
        />
      </main>
    );
  }

  const effectiveSelectedAccountId = selectedAccountId === "all" || snapshot.accounts.some(
    (account) => account.id === selectedAccountId && account.isActive,
  ) ? selectedAccountId : "all";

  return (
    <main aria-label={t("dashboard.title")} className="app-page">
      <DeviceUnlockOffer />
      <DashboardPeriodHeader
        selectedYear={selectedYear}
        selectedMonth={selectedMonth}
        isCurrent={isCurrent}
        onPrevious={goPrev}
        onNext={goNext}
        onCurrent={goCurrent}
        accounts={currentQuery.data.accounts.filter((account) => account.isActive)}
        selectedAccountId={effectiveSelectedAccountId}
        onAccountChange={setSelectedAccountId}
      />

      <DashboardContent
        snapshot={snapshot}
        canMutate={isCurrent}
        selectedAccountId={effectiveSelectedAccountId}
        operations={operationsQuery.data ?? []}
        operationsLoading={operationsQuery.isLoading}
      />
    </main>
  );
}

// ── Period comparison ────────────────────────────────────────────────────
