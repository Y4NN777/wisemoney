import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowUpRight, Check, Clock3, Info, SlidersHorizontal, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { selectDashboardAlerts, type DashboardAlert } from "../analytics/dashboard.ts";
import type { FinancialStateSnapshot } from "../domain/financialState.ts";
import { formatMoney } from "../types/money.ts";
import {
  dismissDashboardAlert,
  loadDashboardAlertStates,
  markDashboardAlertRead,
  restoreDashboardAlert,
  selectVisibleDashboardAlerts,
  snoozeDashboardAlert,
} from "../attention/store.ts";
import { Button } from "./ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card.tsx";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "./ui/sheet.tsx";

const DAY_MS = 24 * 60 * 60 * 1000;

function alertHref(alert: DashboardAlert): "/settings" | "/operations" | "/budgets" {
  if (alert.kind === "missing_fx") return "/settings";
  if (alert.kind === "budget_threshold") return "/budgets";
  return "/operations";
}

function AlertBody({ alert, snapshot }: { alert: DashboardAlert; snapshot: FinancialStateSnapshot }) {
  const { t } = useTranslation();
  if (alert.kind === "missing_fx") {
    return <>{t("dashboard.missingFxBody", { currencies: snapshot.missingFxCurrencies.join(", "), baseCurrency: snapshot.baseCurrency })}</>;
  }
  if (alert.kind === "negative_cash_flow") {
    return <>{t("dashboard.negativeCashFlowBody", { amount: formatMoney({ ...snapshot.netCashFlow, minorUnits: Math.abs(snapshot.netCashFlow.minorUnits) }) })}</>;
  }
  if (alert.kind === "spending_from_balance") {
    return <>{t("dashboard.spendingFromBalanceBody", { amount: formatMoney(snapshot.periodExpenses) })}</>;
  }
  const budget = snapshot.budgets.find((item) => item.id === alert.entityId);
  return <>{t("dashboard.attention.budgetThresholdBody", { name: budget?.name ?? t("common.unknown"), percentage: alert.threshold ?? 0 })}</>;
}

function alertTitle(alert: DashboardAlert, t: ReturnType<typeof useTranslation>["t"]): string {
  if (alert.kind === "missing_fx") return t("dashboard.missingFxTitle");
  if (alert.kind === "negative_cash_flow") return t("dashboard.negativeCashFlow");
  if (alert.kind === "spending_from_balance") return t("dashboard.spendingFromBalance");
  return alert.threshold === 100 ? t("dashboard.budgetExceeded") : t("dashboard.attention.budgetApproaching");
}

function AlertRow({
  alert,
  snapshot,
  read,
  onRead,
  onDismiss,
  onSnooze,
}: {
  alert: DashboardAlert;
  snapshot: FinancialStateSnapshot;
  read: boolean;
  onRead: () => void;
  onDismiss: () => void;
  onSnooze: () => void;
}) {
  const { t } = useTranslation();
  const informational = alert.severity === "info";
  return (
    <article className={`grid gap-3 border-t border-border px-4 py-4 first:border-t-0 sm:grid-cols-[auto_minmax(0,1fr)_auto] ${read ? "opacity-65" : ""}`}>
      <span className={`flex h-9 w-9 items-center justify-center border ${alert.severity === "critical" ? "border-negative/35 bg-negative-wash text-negative" : informational ? "border-information/35 bg-information-wash text-information" : "border-attention/35 bg-attention-wash text-attention"}`}>
        {informational ? <Info className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
      </span>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold">{alertTitle(alert, t)}</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground"><AlertBody alert={alert} snapshot={snapshot} /></p>
      </div>
      <div className="flex items-center gap-1 sm:self-center">
        {!read && (
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onRead} aria-label={t("dashboard.attention.markRead")} title={t("dashboard.attention.markRead")}>
            <Check className="h-4 w-4" />
          </Button>
        )}
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onSnooze} aria-label={t("dashboard.attention.snooze")} title={t("dashboard.attention.snooze")}>
          <Clock3 className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onDismiss} aria-label={t("dashboard.attention.dismiss")} title={t("dashboard.attention.dismiss")}>
          <X className="h-4 w-4" />
        </Button>
        <Button asChild variant="ghost" size="icon" className="h-8 w-8" onClick={onRead}>
          <Link to={alertHref(alert)} aria-label={t("dashboard.attention.open")} title={t("dashboard.attention.open")}>
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </article>
  );
}

export default function DashboardAttention({ snapshot }: { snapshot: FinancialStateSnapshot }) {
  const { t } = useTranslation();
  const [revision, setRevision] = useState(0);
  const alerts = useMemo(() => selectDashboardAlerts(snapshot), [snapshot]);
  const states = useMemo(() => loadDashboardAlertStates(), [revision]);
  const visible = useMemo(() => selectVisibleDashboardAlerts(alerts, states), [alerts, states]);
  const informational = visible.filter((alert) => alert.severity === "info");
  const actionable = visible.filter((alert) => alert.severity !== "info");

  if (visible.length === 0) return null;

  const refresh = () => setRevision((value) => value + 1);
  const markRead = (id: string) => { markDashboardAlertRead(id); refresh(); };
  const snooze = (id: string) => {
    snoozeDashboardAlert(id, Date.now() + DAY_MS);
    refresh();
    toast.success(t("dashboard.attention.snoozed"));
  };
  const dismiss = (id: string) => {
    dismissDashboardAlert(id);
    refresh();
    toast.success(t("dashboard.attention.dismissed"), {
      action: {
        label: t("common.undo"),
        onClick: () => { restoreDashboardAlert(id); refresh(); },
      },
    });
  };

  const renderAlert = (alert: DashboardAlert) => (
    <AlertRow
      key={alert.id}
      alert={alert}
      snapshot={snapshot}
      read={states[alert.id]?.readAt != null}
      onRead={() => markRead(alert.id)}
      onDismiss={() => dismiss(alert.id)}
      onSnooze={() => snooze(alert.id)}
    />
  );

  return (
    <div className="space-y-3">
      {informational.map((alert) => (
        <div key={alert.id} className="overflow-hidden border border-ocean-primary/20 bg-ocean-wash/30">
          {renderAlert(alert)}
        </div>
      ))}
      {actionable.length > 0 && <Card className="overflow-hidden border-attention/30">
      <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-attention" />
          <CardTitle className="text-base">{t("dashboard.attention.title")}</CardTitle>
        </div>
        {actionable.length > 3 && (
          <Sheet>
            <SheetTrigger asChild>
              <Button type="button" variant="ghost" size="sm">{t("dashboard.attention.viewAll", { count: actionable.length })}</Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full max-w-md p-0 sm:max-w-md">
              <SheetHeader className="border-b border-border px-5 py-5 pr-12">
                <SheetTitle>{t("dashboard.attention.allTitle")}</SheetTitle>
                <SheetDescription>{t("dashboard.attention.description")}</SheetDescription>
              </SheetHeader>
              <div className="max-h-[calc(100dvh-7rem)] overflow-y-auto">{actionable.map(renderAlert)}</div>
            </SheetContent>
          </Sheet>
        )}
      </CardHeader>
      <CardContent className="p-0">{actionable.slice(0, 3).map(renderAlert)}</CardContent>
    </Card>}
    </div>
  );
}
