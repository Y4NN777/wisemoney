import { useState, useMemo, useEffect } from "react";
import { useFinancialState, useHistoricalState, useTransactionsInRange } from "../../hooks/useFinancialState.ts";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card.tsx";
import { Badge } from "../../components/ui/badge.tsx";
import { Progress } from "../../components/ui/progress.tsx";
import { Skeleton } from "../../components/ui/skeleton.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs.tsx";
import {
  AlertTriangle, ArrowUp, ArrowDown, Wallet, TrendingUp, Target, Repeat,
  Info, ChevronLeft, ChevronRight, List, TrendingDown, BarChart3,
  Lightbulb,
} from "lucide-react";
import type { FinancialStateSnapshot, TransactionDisplay } from "../../domain/financialState.ts";
import { useMasterKey } from "../../lib/masterKeyContext.ts";
import { getAICapability, type AICapability } from "../../lib/capabilities.ts";
import { requestInsight } from "../../pillars/intelligence/index.ts";
import type { AIResult } from "../../pillars/intelligence/index.ts";
import { useTranslation } from "react-i18next";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function formatMoney(minorUnits: number, currency: string): string {
  const symbol: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", JPY: "¥" };
  const sym = symbol[currency] ?? currency + " ";
  const abs = Math.abs(minorUnits);
  const major = Math.floor(abs / 100);
  const minor = abs % 100;
  const sign = minorUnits < 0 ? "-" : "";
  return `${sign}${sym}${major.toLocaleString()}.${minor.toString().padStart(2, "0")}`;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function computePercentChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 100);
}

function changeColor(pct: number, invert: boolean): string {
  const isGood = invert ? pct < 0 : pct > 0;
  if (pct === 0) return "text-muted-foreground";
  return isGood ? "text-green-600" : "text-red-500";
}

function changeIcon(pct: number, invert: boolean) {
  if (pct === 0) return null;
  const isGood = invert ? pct < 0 : pct > 0;
  return isGood ? ArrowUp : TrendingDown;
}

type TimeFilter = "day" | "week" | "month" | "all";
type CashFlowPoint = {
  label: string;
  income: number;
  expenses: number;
  net: number;
};

function getTimeFilterBounds(filter: TimeFilter, now: number, periodStart: number, periodEnd: number): { start: number; end: number } {
  switch (filter) {
    case "day": {
      const startOfDay = new Date(now).setHours(0, 0, 0, 0);
      return { start: startOfDay, end: now };
    }
    case "week": {
      return { start: now - 7 * 24 * 60 * 60 * 1000, end: now };
    }
    case "month":
      return { start: periodStart, end: periodEnd };
    case "all":
      return { start: 0, end: now };
  }
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
      label: new Date(bucketStart).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      income: 0,
      expenses: 0,
      net: 0,
    };
  });

  for (const tx of transactions ?? []) {
    const index = Math.min(bucketCount - 1, Math.max(0, Math.floor((tx.timestamp - start) / bucketMs)));
    const bucket = buckets[index];
    if (bucket == null) continue;
    const value = Math.abs(tx.amount.minorUnits);
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
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Cash flow trend" className="h-full w-full">
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
        <ChartLegend label="Income" value={formatMoney(points.reduce((s, p) => s + p.income, 0), currency)} className="bg-sage" />
        <ChartLegend label="Expenses" value={formatMoney(points.reduce((s, p) => s + p.expenses, 0), currency)} className="bg-amber" />
        <ChartLegend label="Net" value={formatMoney(points.reduce((s, p) => s + p.net, 0), currency)} className="bg-ocean-primary" />
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
  const palette = ["#006d8f", "#17a2a4", "#2f7d57", "#b76b16", "#7c3aed", "#c2410c"];
  let cursor = 0;
  const stops = items.slice(0, 6).map((item, index) => {
    const pct = total > 0 ? (item.total.minorUnits / total) * 100 : 0;
    const start = cursor;
    cursor += pct;
    return `${palette[index % palette.length]} ${start}% ${cursor}%`;
  });
  const background = stops.length > 0 ? `conic-gradient(${stops.join(", ")})` : "var(--muted)";

  return (
    <div className="grid gap-4 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-center">
      <div className="mx-auto grid h-36 w-36 place-items-center rounded-full shadow-inner" style={{ background }}>
        <div className="grid h-20 w-20 place-items-center rounded-full bg-card text-center shadow-sm">
          <span className="text-[10px] font-medium uppercase text-muted-foreground">Total</span>
          <span className="text-sm font-semibold tabular-nums">{formatMoney(total, currency)}</span>
        </div>
      </div>
      <div className="space-y-2">
        {items.length > 0 ? items.slice(0, 6).map((item, index) => (
          <div key={item.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: palette[index % palette.length] }} />
              <span className="truncate">{item.name}</span>
            </span>
            <span className="shrink-0 text-muted-foreground tabular-nums">
              {total > 0 ? Math.round((item.total.minorUnits / total) * 100) : 0}%
            </span>
          </div>
        )) : (
          <p className="empty-state py-5">No category spending yet.</p>
        )}
      </div>
    </div>
  );
}

function HealthRail({
  activeBudgets,
  activeGoals,
  recurringCount,
  snapshot,
}: {
  activeBudgets: FinancialStateSnapshot["budgets"];
  activeGoals: FinancialStateSnapshot["goals"];
  recurringCount: number;
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

  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <HealthPill label={t("dashboard.budgetUse")} value={`${budgetAverage}%`} progress={Math.min(100, budgetAverage)} tone={budgetAverage > 90 ? "risk" : "normal"} />
      <HealthPill label={t("dashboard.goalProgress")} value={`${goalAverage}%`} progress={Math.min(100, goalAverage)} tone="good" />
      <HealthPill label={t("dashboard.cashMargin")} value={`${cashflowScore}%`} progress={cashflowScore} tone={cashflowScore < 10 ? "risk" : "good"} footer={t("dashboard.cashMarginFooter", { count: recurringCount })} />
    </div>
  );
}

function HealthPill({ label, value, progress, tone, footer }: { label: string; value: string; progress: number; tone: "normal" | "good" | "risk"; footer?: string }) {
  const toneClass = tone === "risk" ? "text-destructive [&>div>div]:bg-destructive" : tone === "good" ? "text-sage [&>div>div]:bg-sage" : "text-ocean-dark";
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
          <p className="text-xs text-muted-foreground mt-2">via {insight.provider}</p>
        </CardContent>
      </Card>
  );
}

// ── Main dashboard content ──────────────────────────────────────────────
function DashboardContent({ snapshot }: { snapshot: FinancialStateSnapshot }) {
  const masterKey = useMasterKey();
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("month");
  const [aiInsight, setAiInsight] = useState<AIResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiCapability, setAiCapability] = useState<AICapability | null>(null);

  const { start: txStart, end: txEnd } = useMemo(
    () => getTimeFilterBounds(timeFilter, snapshot.asOfTimestamp, snapshot.periodStart, snapshot.periodEnd),
    [timeFilter, snapshot.asOfTimestamp, snapshot.periodStart, snapshot.periodEnd],
  );
  const { data: transactions, isLoading: txLoading } = useTransactionsInRange(txStart, txEnd);

  useEffect(() => {
    void getAICapability(masterKey).then(setAiCapability);
  }, [masterKey]);

  const categories = snapshot.categories.filter((c) => !c.isSystemDefault);
  const activeBudgets = snapshot.budgets.filter((b) => !b.isArchived);
  const activeGoals = snapshot.goals.filter((g) => !g.isArchived);

  const categorySpending = useMemo(() => {
    const ex = categories
      .map((c) => ({
        id: c.id,
        name: c.name,
        total: snapshot.categoryTotals[c.id],
      }))
      .filter((c): c is typeof c & { total: NonNullable<typeof c.total> } => c.total != null && c.total.minorUnits > 0)
      .sort((a, b) => b.total.minorUnits - a.total.minorUnits);
    const totalExpenses = ex.reduce((s, c) => s + c.total.minorUnits, 0);
    return { items: ex, total: totalExpenses, currency: ex[0]?.total.currency ?? "USD" };
  }, [categories, snapshot.categoryTotals]);

  const cashFlowSeries = useMemo(
    () => buildCashFlowSeries(transactions, txStart, txEnd),
    [transactions, txStart, txEnd],
  );

  // budget alerts
  const budgetAlerts = activeBudgets
    .map((b) => {
      const prog = snapshot.budgetProgress[b.id];
      if (prog == null) return null;
      const cat = snapshot.categories.find((c) => c.id === b.categoryId);
      return { budget: b, progress: prog, categoryName: cat?.name ?? "Unknown" };
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
        message: "Could not load insight right now.",
      });
    } finally {
      setAiLoading(false);
    }
  };

  const currency = snapshot.totalBalance.currency;

  return (
    <div className="space-y-4">
      {/* ── Alerts ── */}
      {(snapshot.netCashFlow.minorUnits < 0 || budgetAlerts.some((a) => a.progress.percentage >= 100)) && (
        <section aria-label="Alerts" className="space-y-2">
          {snapshot.netCashFlow.minorUnits < 0 && (
            <Card className="border-amber bg-amber-wash">
              <CardContent className="flex items-start gap-3 pt-4">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Negative cash flow</p>
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Expenses exceed income by{" "}
                    {formatMoney(Math.abs(snapshot.netCashFlow.minorUnits), currency)}.
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
                    <p className="text-sm font-medium text-red-800 dark:text-red-300">Budget exceeded</p>
                    <p className="text-xs text-red-700 dark:text-red-400">
                      {a.categoryName} exceeded its budget of{" "}
                      {formatMoney(a.progress.limit.minorUnits, a.progress.limit.currency)}.
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
        </section>
      )}

      <section aria-label="Analytics overview" className="grid gap-3 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.9fr)]">
        <Card className="interactive-surface metric-surface">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base">Cash Flow Trend</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">Income, expenses, and net movement for the selected range</p>
            </div>
            <TrendingUp className="h-4 w-4 text-ocean-primary" />
          </CardHeader>
          <CardContent>
            {txLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <CashFlowTrendChart points={cashFlowSeries} currency={currency} />
            )}
          </CardContent>
        </Card>

        <Card className="interactive-surface">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base">Spending Mix</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">Top categories by share of outflow</p>
            </div>
            <BarChart3 className="h-4 w-4 text-ocean-primary" />
          </CardHeader>
          <CardContent>
            <SpendingMixChart items={categorySpending.items} total={categorySpending.total} currency={categorySpending.currency} />
          </CardContent>
        </Card>
      </section>

      <HealthRail
        activeBudgets={activeBudgets}
        activeGoals={activeGoals}
        recurringCount={snapshot.projectedRecurring.length}
        snapshot={snapshot}
      />

      {/* ── Summary cards ── */}
      <section aria-label="Balance summary" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <SummaryCard
          title="Total Balance"
          value={formatMoney(snapshot.totalBalance.minorUnits, currency)}
          icon={<Wallet className="h-4 w-4 text-muted-foreground" />}
          footer={`${snapshot.accounts.length} account${snapshot.accounts.length !== 1 ? "s" : ""}`}
        />
        <SummaryCard
          title="Income"
          value={formatMoney(snapshot.periodIncome.minorUnits, currency)}
          icon={<ArrowUp className="h-4 w-4 text-green-600" />}
          valueClass="text-green-600"
        />
        <SummaryCard
          title="Expenses"
          value={formatMoney(snapshot.periodExpenses.minorUnits, currency)}
          icon={<ArrowDown className="h-4 w-4 text-red-500" />}
          valueClass="text-red-500"
        />
        <SummaryCard
          title="Net Cash Flow"
          value={formatMoney(snapshot.netCashFlow.minorUnits, currency)}
          icon={<TrendingUp className={`h-4 w-4 ${snapshot.netCashFlow.minorUnits >= 0 ? "text-green-600" : "text-red-500"}`} />}
          valueClass={snapshot.netCashFlow.minorUnits >= 0 ? "text-green-600" : "text-red-500"}
        />
      </section>

      {/* ── Analytics + Insights (2-col on desktop) ── */}
      <section className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(280px,0.85fr)]">
        {/* Spending breakdown */}
        <Card className="interactive-surface">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">Spending Breakdown</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-3">
            {categorySpending.items.length > 0 ? (
              categorySpending.items.map((c) => (
                <SpendingBar
                  key={c.id}
                  label={c.name}
                  amount={c.total.minorUnits}
                  total={categorySpending.total}
                  currency={c.total.currency}
                />
              ))
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">No expenses this period.</p>
            )}
          </CardContent>
        </Card>

        {/* AI Insight */}
        <div className="space-y-3">
          {aiInsight != null ? (
            <InsightCard insight={aiInsight} />
          ) : (
            <Card>
              <CardHeader className="flex flex-row items-center gap-2 pb-2">
                <Lightbulb className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">AI Insight</CardTitle>
              </CardHeader>
              <CardContent>
                {aiCapability?.available !== true && (
                  <p className="mb-3 text-sm text-muted-foreground">
                    Add a personal AI provider key in Settings before requesting AI insight.
                  </p>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { void handleAiInsight(); }}
                  disabled={aiLoading || aiCapability?.available !== true}
                  className="w-full"
                >
                  {aiLoading ? "Analyzing…" : "Analyze this period"}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </section>

      {/* ── Two-column layout on desktop ── */}
      <section className="grid gap-3 lg:grid-cols-2">
        {/* Upcoming recurring */}
        {snapshot.projectedRecurring.length > 0 && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Upcoming</CardTitle>
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
              <CardTitle className="text-base">Budgets</CardTitle>
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
                      <span className="flex items-center gap-1">
                        {cat?.name ?? "Unknown"}
                        {nearingLimit && <Info className="h-3 w-3 text-amber-500" />}
                        {overspent && <AlertTriangle className="h-3 w-3 text-destructive" />}
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
                      <p className="text-xs text-amber-600">{Math.round(100 - prog.percentage)}% remaining</p>
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
            <CardTitle className="text-base">Goals</CardTitle>
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

      {/* ── Transactions ── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Transactions</CardTitle>
          <List className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Tabs value={timeFilter} onValueChange={(v) => setTimeFilter(v as TimeFilter)}>
            <TabsList className="grid w-full grid-cols-4 sm:w-[360px]">
              <TabsTrigger value="day">Day</TabsTrigger>
              <TabsTrigger value="week">Week</TabsTrigger>
              <TabsTrigger value="month">Month</TabsTrigger>
              <TabsTrigger value="all">All</TabsTrigger>
            </TabsList>
          </Tabs>
          {txLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : transactions != null && transactions.length > 0 ? (
            <ul className="space-y-1 max-h-80 overflow-y-auto">
              {transactions.map((tx) => {
                const cat = snapshot.categories.find((c) => c.id === tx.categoryId);
                const isIncome = tx.direction === "income";
                return (
                  <li key={tx.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`shrink-0 w-2 h-2 rounded-full ${isIncome ? "bg-green-500" : "bg-red-500"}`} />
                      <div className="min-w-0">
                        <p className="text-sm truncate">{cat?.name ?? "Unknown"}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(tx.timestamp)}</p>
                      </div>
                    </div>
                    <span className={`text-sm font-medium shrink-0 ml-2 ${isIncome ? "text-green-600" : "text-red-500"}`}>
                      {isIncome ? "+" : "-"}{formatMoney(Math.abs(tx.amount.minorUnits), tx.amount.currency)}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">No transactions in this period.</p>
          )}
        </CardContent>
      </Card>

      {/* ── Empty state ── */}
      {snapshot.accounts.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Welcome to WiseMoney</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Get started by adding an account and recording your first transaction.
            </p>
          </CardContent>
        </Card>
      )}
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
  footer?: string;
  valueClass?: string;
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
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const isCurrent = selectedYear === now.getFullYear() && selectedMonth === now.getMonth() + 1;

  const currentQuery = useFinancialState();
  const prevPeriod = computePrevPeriod(selectedYear, selectedMonth);
  const historicalQuery = useHistoricalState(selectedYear, selectedMonth);
  const prevQuery = useHistoricalState(prevPeriod.year, prevPeriod.month);

  const { data: snapshot, isLoading, error } = isCurrent ? currentQuery : historicalQuery;
  const { data: prevSnapshot } = prevQuery;

  const periodComparison = useMemo(() => {
    if (snapshot == null || prevSnapshot == null) return null;
    return {
      incomeChange: computePercentChange(snapshot.periodIncome.minorUnits, prevSnapshot.periodIncome.minorUnits),
      expenseChange: computePercentChange(snapshot.periodExpenses.minorUnits, prevSnapshot.periodExpenses.minorUnits),
      cashflowChange: computePercentChange(snapshot.netCashFlow.minorUnits, prevSnapshot.netCashFlow.minorUnits),
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

  if (isLoading) {
    return (
      <main aria-label="Dashboard" className="app-page">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2"><Skeleton className="h-4 w-24" /></CardHeader>
              <CardContent><Skeleton className="h-8 w-32" /></CardContent>
            </Card>
          ))}
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
      <main aria-label="Dashboard" className="flex min-h-[50vh] flex-col items-center justify-center space-y-2 text-center">
        <p className="text-destructive text-lg font-medium">Failed to load financial data</p>
        <p className="text-muted-foreground text-sm">{error?.message ?? "Unknown error"}</p>
      </main>
    );
  }

  return (
    <main aria-label="Dashboard" className="app-page">
      {/* ── Period header ── */}
      <div className="page-head">
        <div>
          <p className="page-kicker">Dashboard</p>
          <h1 className="page-title">
            {MONTHS[selectedMonth - 1]} {selectedYear}
          </h1>
          {periodComparison != null && (
            <div className="flex flex-wrap items-center gap-3 mt-1">
              <PeriodBadge label="Income" pct={periodComparison.incomeChange} invert={false} />
              <PeriodBadge label="Expenses" pct={periodComparison.expenseChange} invert={true} />
              <PeriodBadge label="Cash Flow" pct={periodComparison.cashflowChange} invert={false} />
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={goPrev} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          {!isCurrent && (
            <Button variant="ghost" size="sm" className="text-xs" onClick={goCurrent}>
              Today
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={goNext} aria-label="Next month" disabled={isCurrent}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <DashboardContent snapshot={snapshot} />
    </main>
  );
}

// ── Period comparison badge ──────────────────────────────────────────────
function PeriodBadge({ label, pct, invert }: { label: string; pct: number | null; invert: boolean }) {
  if (pct == null) return null;
  const Icon = changeIcon(pct, invert);
  return (
    <Badge variant="outline" className={`flex items-center gap-1 text-xs ${changeColor(pct, invert)}`}>
      {Icon != null && <Icon className="h-3 w-3" />}
      {label}: {pct > 0 ? "+" : ""}{pct}%
    </Badge>
  );
}
