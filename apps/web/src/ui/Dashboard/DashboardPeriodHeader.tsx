import { useState, useEffect } from "react";

import { Button } from "../../components/ui/button.tsx";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select.tsx";
import {
  ChevronLeft, ChevronRight, } from "lucide-react";
import type { FinancialStateSnapshot } from "../../domain/financialState.ts";
import type { } from "../../domain/financialOperations.ts";

import type { } from "../../pillars/intelligence/index.ts";
import { useTranslation } from "react-i18next";

import {
  GREETING_MESSAGE_COUNT,
  getDailyGreetingIndex,
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
}) {
  const { t } = useTranslation();
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
  const greetingIndex = getDailyGreetingIndex(today, GREETING_MESSAGE_COUNT);
  const isCurrentYear = selectedYear === today.getFullYear();

  return (
    <header className="flex flex-col gap-4 py-1 sm:flex-row sm:items-end sm:justify-between sm:py-2">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          {t(`dashboard.greeting.${greetingTime}`)}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(`dashboard.greeting.messages.${greetingIndex}`)}
        </p>
      </div>

      <nav aria-label={t("dashboard.dashboardControls")} className="flex w-full shrink-0 flex-wrap items-center justify-end gap-2 self-end sm:w-auto sm:self-auto">
        {accounts.length > 1 && (
          <Select value={selectedAccountId} onValueChange={onAccountChange}>
            <SelectTrigger className="h-9 w-full min-w-40 sm:w-auto" aria-label={t("dashboard.accountFilter")}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("dashboard.allAccounts")}</SelectItem>
              {accounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {!isCurrent && (
          <Button variant="ghost" size="sm" className="h-8 px-2 text-xs text-muted-foreground" onClick={onCurrent}>
            {t("dashboard.today")}
          </Button>
        )}
        <div className="flex h-9 items-center rounded-full border border-border bg-card p-0.5">
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={onPrevious} aria-label={t("dashboard.previousMonth")}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-24 px-2 text-center text-sm font-medium" aria-live="polite">
            {t(`dashboard.months.${selectedMonth - 1}`)}{isCurrentYear ? "" : ` ${selectedYear}`}
          </span>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={onNext} aria-label={t("dashboard.nextMonth")} disabled={isCurrent}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </nav>
    </header>
  );
}
