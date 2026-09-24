import { Link } from "@tanstack/react-router";

import type { } from "../../domain/financialOperations.ts";

import type { } from "../../pillars/intelligence/index.ts";
import { useTranslation } from "react-i18next";

import {
  type CashFlowPoint,
  type BalancePoint,
} from "../../analytics/dashboard.ts";
import { formatMoney } from "./format.ts";

export function SpendingBar({ label, amount, total, currency, categoryId, accountId, start, end }: { label: string; amount: number; total: number; currency: string; categoryId: string; accountId: string | null; start: number; end: number }) {
  const pct = total > 0 ? (amount / total) * 100 : 0;
  return (
    <Link to="/operations" search={{ categoryId, accountId: accountId ?? undefined, start, end }} className="interactive-surface block space-y-1.5 border-l border-transparent py-1 pl-2 hover:border-primary">
      <div className="flex items-center justify-between text-sm">
        <span className="truncate pr-2 font-medium">{label}</span>
        <span className="shrink-0 text-muted-foreground">{formatMoney(amount, currency)} · {Math.round(pct)}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-ocean-primary rounded-full transition-all duration-300"
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </Link>
  );
}

export function CashFlowTrendChart({ points, currency, accountId }: { points: CashFlowPoint[]; currency: string; accountId: string | null }) {
  const { t } = useTranslation();
  const locale = document.documentElement.lang || undefined;
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
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t("dashboard.cashFlowTrend")} className="h-full w-full">
          <defs>
            <linearGradient id="incomeGradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--positive)" stopOpacity="0.82" />
              <stop offset="100%" stopColor="var(--positive)" stopOpacity="0.30" />
            </linearGradient>
            <linearGradient id="expenseGradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--negative)" stopOpacity="0.30" />
              <stop offset="100%" stopColor="var(--negative)" stopOpacity="0.82" />
            </linearGradient>
          </defs>
          <line x1={padding} x2={width - padding} y1={baseline} y2={baseline} stroke="var(--border)" strokeWidth="1" />
          {points.map((point, index) => {
            const x = padding + index * step + step / 2;
            const label = new Date(point.start).toLocaleDateString(locale, { month: "short", day: "numeric" });
            const incomeHeight = (point.income / maxAmount) * barArea;
            const expenseHeight = (point.expenses / maxAmount) * barArea;
            return (
              <g key={`${point.start}-${index}`} tabIndex={0} aria-label={t("dashboard.chartPoint", { date: label, income: formatMoney(point.income, currency), expenses: formatMoney(point.expenses, currency), net: formatMoney(point.net, currency) })}>
                <title>{t("dashboard.chartPoint", { date: label, income: formatMoney(point.income, currency), expenses: formatMoney(point.expenses, currency), net: formatMoney(point.net, currency) })}</title>
                <rect x={x - 9} y={baseline - incomeHeight} width="8" height={Math.max(2, incomeHeight)} rx="3" fill="url(#incomeGradient)" />
                <rect x={x + 1} y={baseline} width="8" height={Math.max(2, expenseHeight)} rx="3" fill="url(#expenseGradient)" />
                {(index === 0 || index === points.length - 1) && (
                  <text x={x} y={height - 9} textAnchor="middle" fontSize="10" fill="var(--muted-foreground)">
                    {label}
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
        <ChartLegend label={t("dashboard.income")} value={formatMoney(points.reduce((s, p) => s + p.income, 0), currency)} className="bg-positive" />
        <ChartLegend label={t("dashboard.expenses")} value={formatMoney(points.reduce((s, p) => s + p.expenses, 0), currency)} className="bg-negative" />
        <ChartLegend label={t("dashboard.net")} value={formatMoney(points.reduce((s, p) => s + p.net, 0), currency)} className="bg-ocean-primary" />
      </div>
      <details className="border-t border-border pt-2 text-xs">
        <summary className="cursor-pointer font-medium text-muted-foreground">{t("dashboard.chartTable")}</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-96 text-left">
            <thead><tr className="border-b border-border"><th className="py-2">{t("operations.date")}</th><th>{t("dashboard.income")}</th><th>{t("dashboard.expenses")}</th><th>{t("dashboard.net")}</th></tr></thead>
            <tbody>{points.map((point) => <tr key={point.start} className="border-b border-border/70"><td className="py-2"><Link className="font-medium text-ocean-primary underline-offset-2 hover:underline" to="/operations" search={{ start: point.start, end: point.end, accountId: accountId ?? undefined }}>{new Date(point.start).toLocaleDateString(locale)}</Link></td><td>{formatMoney(point.income, currency)}</td><td>{formatMoney(point.expenses, currency)}</td><td>{formatMoney(point.net, currency)}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

export function ChartLegend({ label, value, className }: { label: string; value: string; className: string }) {
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

export function BalanceTrendChart({ points, currency, periodStart, accountId }: { points: BalancePoint[]; currency: string; periodStart: number; accountId: string | null }) {
  const { t } = useTranslation();
  const locale = document.documentElement.lang || undefined;
  const width = 520;
  const height = 190;
  const paddingX = 28;
  const paddingY = 24;
  const values = points.map((point) => point.balance);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const span = Math.max(1, max - min);
  const coordinates = points.map((point, index) => ({
    ...point,
    x: paddingX + (index / Math.max(1, points.length - 1)) * (width - paddingX * 2),
    y: paddingY + ((max - point.balance) / span) * (height - paddingY * 2),
  }));
  return (
    <div className="space-y-3">
      <div className="h-52 overflow-hidden rounded-lg border border-border bg-card">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t("dashboard.balanceTrend")} className="h-full w-full">
          <line x1={paddingX} x2={width - paddingX} y1={height - paddingY} y2={height - paddingY} stroke="var(--border)" />
          <polyline points={coordinates.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke="var(--ocean-primary)" strokeWidth="3" strokeLinecap="square" strokeLinejoin="miter" />
          {coordinates.map((point) => {
            const date = new Date(point.timestamp).toLocaleDateString(locale, { month: "short", day: "numeric" });
            const label = t("dashboard.balancePoint", { date, balance: formatMoney(point.balance, currency) });
            return <circle key={point.timestamp} cx={point.x} cy={point.y} r="4" fill="var(--card)" stroke="var(--ocean-primary)" strokeWidth="2" tabIndex={0} aria-label={label}><title>{label}</title></circle>;
          })}
        </svg>
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs text-muted-foreground">{t("dashboard.balanceTrendHelp")}</p>
        <p className="text-sm font-semibold tabular-nums">{formatMoney(points.at(-1)?.balance ?? 0, currency)}</p>
      </div>
      <details className="border-t border-border pt-2 text-xs">
        <summary className="cursor-pointer font-medium text-muted-foreground">{t("dashboard.chartTable")}</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-80 text-left">
            <thead><tr className="border-b border-border"><th className="py-2">{t("operations.date")}</th><th>{t("dashboard.totalBalance")}</th></tr></thead>
            <tbody>{points.map((point) => <tr key={point.timestamp} className="border-b border-border/70"><td className="py-2"><Link className="font-medium text-ocean-primary underline-offset-2 hover:underline" to="/operations" search={{ start: periodStart, end: point.timestamp, accountId: accountId ?? undefined }}>{new Date(point.timestamp).toLocaleDateString(locale)}</Link></td><td>{formatMoney(point.balance, currency)}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
