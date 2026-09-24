

import { Progress } from "../../components/ui/progress.tsx";

import type { FinancialStateSnapshot } from "../../domain/financialState.ts";
import type { } from "../../domain/financialOperations.ts";

import type { } from "../../pillars/intelligence/index.ts";
import { useTranslation } from "react-i18next";

export function HealthRail({
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
        <HealthPill label={t("dashboard.budgetUse")} value={`${budgetAverage}%`} progress={Math.min(100, budgetAverage)} tone={budgetAverage >= 90 ? "risk" : "normal"} />
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

export function HealthPill({ label, value, progress, tone, footer }: { label: string; value: string; progress: number; tone: "neutral" | "normal" | "good" | "risk"; footer?: string }) {
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
