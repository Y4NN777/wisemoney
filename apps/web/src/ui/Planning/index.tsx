import { useTranslation } from "react-i18next";
import { HandCoins, ListTodo, Repeat, Target, Wallet, type LucideIcon } from "lucide-react";
import PlanSection from "./PlanSection.tsx";
import { selectPlanSections, type PlanSectionId } from "./planSections.ts";
import { Skeleton } from "../../components/ui/skeleton.tsx";
import { useFinancialState } from "../../hooks/useFinancialState.ts";
import AppFaultPanel from "../../errors/AppFaultPanel.tsx";
import { classifyAppError } from "../../errors/diagnostics.ts";

export default function Planning() {
  const { t } = useTranslation();
  const { data: snapshot, isLoading, error, refetch } = useFinancialState();

  const sections = snapshot == null ? [] : selectPlanSections(snapshot);
  const presentation: Record<PlanSectionId, { label: string; icon: LucideIcon; status: (count: number) => string }> = {
    budgets: { label: t("planning.links.budgets"), icon: Wallet, status: (count) => t("planning.counts.budgets", { count }) },
    goals: { label: t("planning.links.goals"), icon: Target, status: (count) => t("planning.counts.goals", { count }) },
    plannedExpenses: { label: t("planning.links.plannedExpenses"), icon: ListTodo, status: (count) => t("planning.counts.plannedExpenses", { count }) },
    recurring: { label: t("planning.links.recurring"), icon: Repeat, status: (count) => t("planning.counts.recurring", { count }) },
    debts: { label: t("planning.links.debts"), icon: HandCoins, status: (count) => t("planning.counts.debts", { count }) },
  };

  return (
    <main aria-label={t("planning.title")} className="app-page max-w-4xl">
      <div className="page-head">
        <div>
          <h1 className="page-title">{t("planning.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("planning.cardDescription")}</p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-16 w-full" />)}
        </div>
      ) : error != null || snapshot == null ? (
        <AppFaultPanel faultCode={classifyAppError(error)} surfaceId="planning" onRetry={() => { void refetch(); }} />
      ) : (
        <div className="space-y-2">
          {sections.map((section) => (
            <PlanSection
              key={section.id}
              section={section}
              label={presentation[section.id].label}
              status={presentation[section.id].status(section.count)}
              icon={presentation[section.id].icon}
            />
          ))}
        </div>
      )}
    </main>
  );
}
