import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";

import { Skeleton } from "@/components/ui/skeleton.tsx";
import { useFinancialState } from "@/hooks/useFinancialState.ts";
import { PlannedExpensesSection } from "./PlannedExpensesSection.tsx";

export default function PlannedExpenses() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: snapshot, isLoading } = useFinancialState();

  return (
    <main aria-label={t("capture.plannedExpenses.title")} className="app-page max-w-6xl">
      <div className="page-head">
        <div>
          <h1 className="page-title">{t("capture.plannedExpenses.title")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("capture.plannedExpenses.description")}</p>
        </div>
      </div>
      {isLoading || snapshot == null ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      ) : (
        <PlannedExpensesSection
          snapshot={snapshot}
          onOpenAccounts={() => void navigate({ to: "/capture", search: { tab: "manage", section: "accounts" } })}
        />
      )}
    </main>
  );
}
