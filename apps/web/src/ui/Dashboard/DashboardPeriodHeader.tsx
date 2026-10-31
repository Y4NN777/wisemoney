import { useState, useEffect } from "react";

import { Link } from "@tanstack/react-router";
import { Button } from "../../components/ui/button.tsx";
import type { HomeNudge } from "./homeNudge.ts";
import { formatMoney } from "./format.ts";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select.tsx";
import {
  ChevronLeft, ChevronRight, } from "lucide-react";
import type { FinancialStateSnapshot } from "../../domain/financialState.ts";
import type { } from "../../domain/financialOperations.ts";

import type { } from "../../pillars/intelligence/index.ts";
import { useTranslation } from "react-i18next";

import {
  getGreetingTime,
  getNextGreetingRefreshAt,
} from "./dashboardGreeting.ts";

export function DashboardPeriodHeader({
  selectedYear,
  selectedMonth,
  isCurrent,
  onPrevious,
  onNext,
  onCurrent,
  accounts,
  selectedAccountId,
  onAccountChange,
  nudge = null,
  onAddMovement,
}: {
  selectedYear: number;
  selectedMonth: number;
  isCurrent: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onCurrent: () => void;
  accounts: FinancialStateSnapshot["accounts"];
  selectedAccountId: string;
  onAccountChange: (accountId: string) => void;
  /** The line under the greeting (G1); shown on the current month only. */
  nudge?: HomeNudge | null;
  onAddMovement: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [today, setToday] = useState(() => new Date());

  useEffect(() => {
    let timerId: number | undefined;
    let active = true;

    const scheduleNextRefresh = () => {
      if (!active) return;
      window.clearTimeout(timerId);

      const now = new Date();
      const nextRefresh = getNextGreetingRefreshAt(now);
      const delay = Math.max(0, nextRefresh.getTime() - now.getTime() + 100);

      timerId = window.setTimeout(() => {
        setToday(new Date());
        scheduleNextRefresh();
      }, delay);
    };

    const refreshWhenVisible = () => {
      if (document.visibilityState !== "visible") return;
      setToday(new Date());
      scheduleNextRefresh();
    };

    scheduleNextRefresh();
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      active = false;
      window.clearTimeout(timerId);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  const greetingTime = getGreetingTime(today);
  const isCurrentYear = selectedYear === today.getFullYear();
  const shortMonth = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, { month: "short" })
    .format(new Date(selectedYear, selectedMonth - 1, 1))
    .replace(/^./, (letter) => letter.toLocaleUpperCase());

  return (
    <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 py-1 sm:items-end sm:py-2">
      <div className="min-w-[9rem] flex-1">
        <h1 className="text-base font-semibold tracking-tight sm:text-xl">
          {t(`dashboard.greeting.${greetingTime}`)}
        </h1>
        {nudge != null && <NudgeLine nudge={nudge} onAddMovement={onAddMovement} />}
      </div>

      <nav aria-label={t("dashboard.dashboardControls")} className="flex max-w-full flex-wrap items-center justify-end gap-2">
        {accounts.length > 1 && (
          <Select value={selectedAccountId} onValueChange={onAccountChange}>
            <SelectTrigger className="h-9 w-auto min-w-32" aria-label={t("dashboard.accountFilter")}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("dashboard.allAccounts")}</SelectItem>
              {accounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {!isCurrent && (
          <Button variant="ghost" size="sm" className="h-11 px-2 text-xs text-muted-foreground" onClick={onCurrent}>
            {t("dashboard.today")}
          </Button>
        )}
        <div className="flex h-9 items-center rounded-full border border-border bg-card">
          <Button variant="ghost" size="icon" className="h-11 w-9 rounded-full" onClick={onPrevious} aria-label={t("dashboard.previousMonth")}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-9 text-center text-sm font-medium" aria-live="polite">
            <span aria-hidden="true">{shortMonth}{isCurrentYear ? "" : ` ${String(selectedYear).slice(-2)}`}</span>
            <span className="sr-only">{t(`dashboard.months.${selectedMonth - 1}`)} {selectedYear}</span>
          </span>
          <Button variant="ghost" size="icon" className="h-11 w-9 rounded-full" onClick={onNext} aria-label={t("dashboard.nextMonth")} disabled={isCurrent}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </nav>
    </header>
  );
}

/** One line from the user's data and one action (G1); the rule lives in homeNudge.ts. */
function NudgeLine({ nudge, onAddMovement }: { nudge: HomeNudge; onAddMovement: () => void }) {
  const { t } = useTranslation();
  const action = "inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4";
  let text: string;
  let cta: React.ReactNode;
  if (nudge.kind === "due") {
    text = t(nudge.overdue ? "dashboard.nudge.overdue" : "dashboard.nudge.due", { label: nudge.label });
    if (nudge.more > 0) text = `${text} ${t("dashboard.nudge.more", { count: nudge.more })}`;
    cta = <Link to={nudge.href} className={action}>{t("dashboard.nudge.view")}</Link>;
  } else if (nudge.kind === "receivable") {
    const amount = formatMoney(nudge.amount.minorUnits, nudge.amount.currency);
    text = nudge.days < 0
      ? t("dashboard.nudge.receivableLate", { party: nudge.party, amount })
      : nudge.days === 0
        ? t("dashboard.nudge.receivableToday", { party: nudge.party, amount })
        : t("dashboard.nudge.receivableIn", { party: nudge.party, amount, count: nudge.days });
    cta = <Link to="/debts" className={action}>{t("dashboard.nudge.view")}</Link>;
  } else if (nudge.kind === "nothingToday") {
    text = t("dashboard.nudge.nothingToday");
    cta = <button type="button" className={action} onClick={onAddMovement}>{t("dashboard.nudge.add")}</button>;
  } else {
    text = t("dashboard.nudge.today", { count: nudge.count, amount: formatMoney(nudge.spent.minorUnits, nudge.spent.currency) });
    cta = <Link to="/operations" className={action}>{t("dashboard.nudge.view")}</Link>;
  }
  return (
    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
      <span>{text}</span>
      {cta}
    </p>
  );
}
