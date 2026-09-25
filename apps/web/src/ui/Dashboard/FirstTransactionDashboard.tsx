import FirstSteps from "../../components/FirstSteps/index.tsx";

import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card.tsx";


import { Wallet } from "lucide-react";
import type { FinancialStateSnapshot } from "../../domain/financialState.ts";
import type { } from "../../domain/financialOperations.ts";

import type { } from "../../pillars/intelligence/index.ts";
import { useTranslation } from "react-i18next";

import DeviceUnlockOffer from "../../components/DeviceUnlockOffer/index.tsx";
import { formatMoney } from "./format.ts";

export function FirstTransactionDashboard({ snapshot, accountCount }: { snapshot: FinancialStateSnapshot; accountCount: number }) {
  const { t } = useTranslation();
  return (
    <main aria-label={t("dashboard.title")} className="app-page">
      <div className="page-head">
        <h1 className="page-title">{t("dashboard.title")}</h1>
      </div>
      <DeviceUnlockOffer />
      <section aria-label={t("dashboard.balanceSummary")} className="grid max-w-3xl gap-3 sm:grid-cols-2">
        <SummaryCard
          title={t("dashboard.totalBalance")}
          value={formatMoney(snapshot.totalBalance.minorUnits, snapshot.totalBalance.currency)}
          icon={<Wallet className="h-4 w-4 text-muted-foreground" />}
          footer={t("dashboard.accountCount", { count: accountCount })}
        />
        <div className="space-y-1">
          <h2 className="text-base font-semibold leading-none tracking-normal">{t("dashboard.firstTransaction.title")}</h2>
        </div>
        <FirstSteps snapshot={snapshot} hasMovement={false} />
      </section>
    </main>
  );
}

export function SummaryCard({
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
        <p className={`text-xl font-semibold tabular-nums ${valueClass ?? ""}`}>{value}</p>
        {footer != null && <p className="text-xs text-muted-foreground mt-1">{footer}</p>}
      </CardContent>
    </Card>
  );
}
