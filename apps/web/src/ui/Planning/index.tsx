import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowRight, HandCoins, ListTodo, Repeat, Target, Wallet } from "lucide-react";
import { Skeleton } from "../../components/ui/skeleton.tsx";
import { useFinancialState } from "../../hooks/useFinancialState.ts";
import AppFaultPanel from "../../errors/AppFaultPanel.tsx";
import { classifyAppError } from "../../errors/diagnostics.ts";

export default function Planning() {
  const { t } = useTranslation();
  const { data: snapshot, isLoading, error, refetch } = useFinancialState();

  const items = snapshot == null ? [] : [
    {
      to: "/budgets" as const,
      label: t("planning.links.budgets"),
      status: t("planning.counts.budgets", { count: snapshot.budgets.filter((budget) => !budget.isArchived).length }),
      icon: Wallet,
    },
    {
      to: "/goals" as const,
      label: t("planning.links.goals"),
      status: t("planning.counts.goals", { count: snapshot.goals.filter((goal) => !goal.isArchived).length }),
      icon: Target,
    },
    {
      to: "/planned-expenses" as const,
      label: t("planning.links.plannedExpenses"),
      status: t("planning.counts.plannedExpenses", { count: snapshot.plannedExpenses.filter((item) => item.status === "pending").length }),
      icon: ListTodo,
    },
    {
      to: "/recurring" as const,
      label: t("planning.links.recurring"),
      status: t("planning.counts.recurring", { count: snapshot.recurringItems.filter((item) => !item.isArchived).length }),
      icon: Repeat,
    },
    {
      to: "/debts" as const,
      label: t("planning.links.debts"),
      status: t("planning.counts.debts", { count: snapshot.debtCredits.filter((item) => item.status !== "settled").length }),
      icon: HandCoins,
    },
  ];

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
        <nav aria-label={t("planning.title")} className="grid gap-2 sm:grid-cols-2">
          {items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="interactive-surface flex min-h-16 items-center gap-3 rounded-lg border border-border bg-card px-4 py-3"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-ocean-wash text-ocean-primary">
                <item.icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{item.label}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{item.status}</span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </nav>
      )}
    </main>
  );
}
