import { useEffect, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowRightLeft, ArrowUpRight, CalendarDays, Download, ListFilter, PiggyBank, Repeat2, Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { filterFinancialOperations, groupOperationsByLocalDay, operationAmountForAccount, operationEffect, summarizeMonthlyActivity } from "../../analytics/operations.ts";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card.tsx";
import { Input } from "../../components/ui/input.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select.tsx";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../../components/ui/sheet.tsx";
import type { FinancialOperation, FinancialOperationKind } from "../../domain/financialOperations.ts";
import { useFinancialOperations, useFinancialState } from "../../hooks/useFinancialState.ts";
import { categoryDisplayName } from "../../lib/categoryName.ts";
import { formatMoney } from "../../types/money.ts";
import { parseOperationsSearch, Route, type OperationsSearch } from "../../routes/operations.tsx";
import { Skeleton } from "../../components/ui/skeleton.tsx";
import { exportActivityCSV, exportActivityXLSX, type ActivityExportLocale } from "../../exportImport/activity.ts";
import { toast } from "sonner";

const OPERATIONS_PAGE_SIZE = 100;

function localDateInput(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function inputTimestamp(value: string, endOfDay: boolean): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const date = new Date(year, month - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
  return Number.isNaN(date.getTime()) ? undefined : date.getTime();
}

function operationIcon(kind: FinancialOperationKind) {
  if (kind === "income") return ArrowDownLeft;
  if (kind === "expense" || kind === "planned_expense") return ArrowUpRight;
  if (kind === "transfer") return ArrowRightLeft;
  if (kind === "goal_contribution") return PiggyBank;
  return Repeat2;
}

function operationTone(operation: FinancialOperation, accountId: string | null): string {
  const effect = operationEffect(operation, accountId);
  if (effect === "incoming") return "border-positive/30 bg-positive-wash text-positive";
  if (effect === "outgoing") return "border-negative/30 bg-negative-wash text-negative";
  return "border-border bg-accent text-ocean-dark";
}

function operationTitle(operation: FinancialOperation, snapshot: NonNullable<ReturnType<typeof useFinancialState>["data"]>, t: ReturnType<typeof useTranslation>["t"]): string {
  if (operation.kind === "transfer") {
    if (operation.isLegacyExternal) return operation.externalDestination ?? t("operations.uncategorized");
    const from = snapshot.accounts.find((account) => account.id === operation.accountId)?.name ?? t("dashboard.unknownAccount");
    const to = snapshot.accounts.find((account) => account.id === operation.toAccountId)?.name ?? operation.externalDestination ?? t("dashboard.externalAccount");
    return `${from} → ${to}`;
  }
  if (operation.kind === "goal_contribution") {
    return snapshot.goals.find((goal) => goal.id === operation.goalId)?.name ?? t("common.unknown");
  }
  if (operation.merchant != null) return operation.merchant;
  if (operation.note.trim() !== "") return operation.note;
  const category = snapshot.categories.find((item) => item.id === operation.categoryId);
  return category == null ? t(`operations.kinds.${operation.kind}`) : categoryDisplayName(category, t);
}

function operationContext(operation: FinancialOperation, snapshot: NonNullable<ReturnType<typeof useFinancialState>["data"]>, t: ReturnType<typeof useTranslation>["t"]): string {
  const values: string[] = [t(`operations.kinds.${operation.isLegacyExternal ? "expense" : operation.kind}`)];
  const account = snapshot.accounts.find((item) => item.id === operation.accountId)?.name;
  const category = snapshot.categories.find((item) => item.id === operation.categoryId);
  if (account != null) values.push(account);
  if (category != null) values.push(categoryDisplayName(category, t));
  return values.join(" · ");
}

function OperationAmount({ operation, accountId }: { operation: FinancialOperation; accountId: string | null }) {
  const amount = operationAmountForAccount(operation, accountId);
  if (amount == null) return null;
  const effect = operationEffect(operation, accountId);
  const signed = effect === "incoming" ? "+" : effect === "outgoing" ? "−" : "";
  return (
    <span className={`col-start-2 min-w-0 break-words text-sm font-semibold tabular-nums sm:col-start-auto sm:shrink-0 ${effect === "incoming" ? "text-positive" : effect === "outgoing" ? "text-negative" : "text-foreground"}`}>
      {signed}{formatMoney({ minorUnits: Math.abs(amount.minorUnits), currency: amount.currency })}
    </span>
  );
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function Operations() {
  const { t, i18n } = useTranslation();
  const rawSearch: unknown = Route.useSearch();
  const search = parseOperationsSearch(typeof rawSearch === "object" && rawSearch != null ? rawSearch as Record<string, unknown> : {});
  const navigate = Route.useNavigate();
  const now = Date.now();
  const currentDate = new Date(now);
  const start = search.start ?? new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getTime();
  const end = search.end ?? now;
  const snapshotQuery = useFinancialState();
  const operationsQuery = useFinancialOperations();
  const [selected, setSelected] = useState<FinancialOperation | null>(null);
  const [visibleLimit, setVisibleLimit] = useState(OPERATIONS_PAGE_SIZE);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [exporting, setExporting] = useState<"csv" | "xlsx" | null>(null);
  const snapshot = snapshotQuery.data;

  const index = useMemo(() => ({
    accounts: Object.fromEntries((snapshot?.accounts ?? []).map((item) => [item.id, item.name])),
    categories: Object.fromEntries((snapshot?.categories ?? []).map((item) => [item.id, categoryDisplayName(item, t)])),
    goals: Object.fromEntries((snapshot?.goals ?? []).map((item) => [item.id, item.name])),
  }), [snapshot, t]);
  const filtered = useMemo(() => filterFinancialOperations(operationsQuery.data ?? [], {
    query: search.q ?? "",
    kind: search.kind ?? "all",
    accountId: search.accountId ?? "all",
    categoryId: search.categoryId ?? "all",
    start,
    end,
  }, index), [end, index, operationsQuery.data, search.accountId, search.categoryId, search.kind, search.q, start]);
  const contextAccountId = search.accountId ?? null;
  const contextOperations = useMemo(() => (operationsQuery.data ?? []).filter((operation) =>
    operation.timestamp >= start && operation.timestamp <= end &&
    (contextAccountId == null || operation.accountId === contextAccountId || operation.toAccountId === contextAccountId)
  ), [contextAccountId, end, operationsQuery.data, start]);
  useEffect(() => setVisibleLimit(OPERATIONS_PAGE_SIZE), [end, search.accountId, search.categoryId, search.kind, search.q, start]);
  const allGroups = useMemo(() => groupOperationsByLocalDay(filtered), [filtered]);
  const groups = useMemo(() => groupOperationsByLocalDay(filtered.slice(0, visibleLimit)), [filtered, visibleLimit]);
  const selectedAccount = snapshot?.accounts.find((account) => account.id === contextAccountId && account.isActive) ?? null;
  const currency = selectedAccount?.currency ?? snapshot?.baseCurrency ?? "XOF";
  const totals = useMemo(() => summarizeMonthlyActivity({
    operations: contextOperations,
    start,
    end,
    accountId: contextAccountId,
    displayCurrency: currency,
  }), [contextAccountId, contextOperations, currency, end, start]);

  type SearchPatch = Partial<Record<keyof OperationsSearch, string | number | undefined>>;
  const updateSearch = (patch: SearchPatch) => {
    void navigate({ search: (previous: OperationsSearch) => ({ ...previous, ...patch }), replace: true });
  };
  const clearFilters = () => { void navigate({ search: {}, replace: true }); };
  const locale: ActivityExportLocale = i18n.language.toLowerCase().startsWith("fr") ? "fr" : "en";
  const handleExport = async (format: "csv" | "xlsx") => {
    setExporting(format);
    try {
      const context = { operations: contextOperations, start, end, accountId: contextAccountId, locale, accounts: index.accounts, categories: index.categories };
      const blob = format === "csv" ? exportActivityCSV(context) : await exportActivityXLSX(context);
      downloadBlob(blob, `wisemoney-activity-${localDateInput(start)}-${localDateInput(end)}.${format}`);
      toast.success(t("operations.exportSuccess"));
    } catch {
      toast.error(t("operations.exportFailed"));
    } finally {
      setExporting(null);
    }
  };

  if (snapshotQuery.isLoading) {
    return <main className="app-page"><Skeleton className="h-20 w-full" /><Skeleton className="h-96 w-full" /></main>;
  }
  if (snapshotQuery.error != null || snapshot == null) {
    return <main className="app-page"><div className="empty-state"><p className="font-medium text-foreground">{t("operations.loadFailed")}</p><Button className="mt-3" variant="outline" onClick={() => void snapshotQuery.refetch()}>{t("common.retry")}</Button></div></main>;
  }

  return (
    <main aria-label={t("operations.title")} className="app-page">
      <header className="page-head">
        <div>
          <h1 className="page-title">{t("operations.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("operations.description")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={exporting != null} onClick={() => { void handleExport("csv"); }}>
            <Download className="mr-1 h-4 w-4" />CSV
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={exporting != null} onClick={() => { void handleExport("xlsx"); }}>
            <Download className="mr-1 h-4 w-4" />XLSX
          </Button>
        </div>
      </header>

      <section aria-label={t("operations.summary")} className="grid divide-y divide-border border border-border bg-card sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {([
          { key: "received", amount: totals.received, tone: totals.received.minorUnits > 0 ? "text-positive" : "text-foreground" },
          { key: "spent", amount: totals.spent, tone: totals.spent.minorUnits > 0 ? "text-negative" : "text-foreground" },
          { key: "difference", amount: totals.difference, tone: "text-foreground" },
        ] as const).map((item) => (
          <div key={item.key} className="p-4">
            <p className="text-xs font-medium text-muted-foreground">{t(`operations.${item.key}`)}</p>
            <p className={`mt-1 text-xl font-semibold tabular-nums ${item.tone}`}>
              {formatMoney(item.amount)}
            </p>
          </div>
        ))}
      </section>
      {totals.isPartial && <p className="border-l-2 border-information bg-information-wash px-3 py-2 text-xs text-muted-foreground">{t("operations.partialSummary", { currencies: totals.missingCurrencies.join(", ") })}</p>}

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,0.45fr)_auto]">
          <label className="relative">
            <span className="sr-only">{t("operations.search")}</span>
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input value={search.q ?? ""} onChange={(event) => updateSearch({ q: event.target.value || undefined })} placeholder={t("operations.searchPlaceholder")} className="pl-9" />
          </label>
          <Select value={search.accountId ?? "all"} onValueChange={(value) => updateSearch({ accountId: value === "all" ? undefined : value })}>
            <SelectTrigger aria-label={t("operations.account")}><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">{t("operations.allAccounts")}</SelectItem>{snapshot.accounts.filter((item) => item.isActive).map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
          </Select>
          <Button type="button" variant={filtersOpen ? "default" : "outline"} onClick={() => setFiltersOpen((value) => !value)}>
            <ListFilter className="mr-1 h-4 w-4" />{t("operations.filters")}
          </Button>
          </div>
          {filtersOpen && <div className="grid gap-3 border-t border-border pt-3 sm:grid-cols-2 xl:grid-cols-4">
          <Select value={search.kind ?? "all"} onValueChange={(value) => updateSearch({ kind: value === "all" ? undefined : value })}>
            <SelectTrigger aria-label={t("operations.type")}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("operations.allTypes")}</SelectItem>
              {(["income", "expense", "planned_expense", "transfer", "goal_contribution", "recurring_realisation"] as const).map((kind) => <SelectItem key={kind} value={kind}>{t(`operations.kinds.${kind}`)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={search.categoryId ?? "all"} onValueChange={(value) => updateSearch({ categoryId: value === "all" ? undefined : value })}>
            <SelectTrigger aria-label={t("operations.category")}><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">{t("operations.allCategories")}</SelectItem>{snapshot.categories.map((item) => <SelectItem key={item.id} value={item.id}>{categoryDisplayName(item, t)}</SelectItem>)}</SelectContent>
          </Select>
          <div className="grid grid-cols-2 gap-2 sm:col-span-2">
            <Input aria-label={t("operations.startDate")} type="date" value={localDateInput(start)} onChange={(event) => updateSearch({ start: inputTimestamp(event.target.value, false) })} />
            <Input aria-label={t("operations.endDate")} type="date" value={localDateInput(end)} onChange={(event) => updateSearch({ end: inputTimestamp(event.target.value, true) })} />
          </div>
          <Button type="button" variant="ghost" size="sm" className="justify-start sm:col-span-2 xl:col-span-4" onClick={clearFilters}>
            <X className="mr-1 h-4 w-4" />{t("operations.clearFilters")}
          </Button>
          </div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col items-start justify-between gap-2 pb-3 sm:flex-row sm:items-center">
          <CardTitle className="text-base">{t("operations.results", { count: filtered.length })}</CardTitle>
          <span className="text-xs text-muted-foreground">{t("operations.neutralHelp")}</span>
        </CardHeader>
        <CardContent className="p-0">
          {operationsQuery.isLoading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-16 w-full" />)}</div>
          ) : operationsQuery.error != null ? (
            <div className="empty-state m-4"><p className="font-medium text-foreground">{t("operations.loadFailed")}</p><Button className="mt-3" variant="outline" onClick={() => void operationsQuery.refetch()}>{t("common.retry")}</Button></div>
          ) : groups.length === 0 ? (
            <div className="empty-state m-4"><CalendarDays className="mx-auto mb-2 h-5 w-5" /><p className="font-medium text-foreground">{t("operations.emptyTitle")}</p><p className="mt-1">{t("operations.emptyBody")}</p></div>
          ) : groups.map((group) => {
            const completeGroup = allGroups.find((candidate) => candidate.day === group.day) ?? group;
            const groupTotals = summarizeMonthlyActivity({ operations: completeGroup.operations, start: 0, end: Number.MAX_SAFE_INTEGER, accountId: contextAccountId, displayCurrency: currency });
            return (
            <section key={group.day} aria-labelledby={`operations-day-${group.day}`}>
              <h2 id={`operations-day-${group.day}`} className="flex flex-wrap items-center justify-between gap-2 border-y border-border bg-accent/45 px-4 py-2 text-xs font-semibold text-muted-foreground first:border-t-0">
                <span>{new Intl.DateTimeFormat(i18n.language, { dateStyle: "full" }).format(new Date(`${group.day}T12:00:00`))}</span>
                <span className="tabular-nums">{t("operations.daySubtotal", { amount: formatMoney(groupTotals.difference) })}</span>
              </h2>
              <ul>{group.operations.map((operation) => {
                const Icon = operationIcon(operation.kind);
                return (
                  <li key={operation.id} className="border-b border-border last:border-b-0">
                    <button type="button" onClick={() => setSelected(operation)} className="interactive-surface grid w-full grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-3 px-4 py-3 text-left sm:grid-cols-[2.5rem_minmax(0,1fr)_auto]">
                      <span className={`flex h-10 w-10 items-center justify-center border ${operationTone(operation, contextAccountId)}`}><Icon className="h-4 w-4" /></span>
                      <span className="min-w-0"><span className="block truncate text-sm font-semibold">{operationTitle(operation, snapshot, t)}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{operationContext(operation, snapshot, t)}</span></span>
                      <OperationAmount operation={operation} accountId={contextAccountId} />
                    </button>
                  </li>
                );
              })}</ul>
            </section>
            );
          })}
          {visibleLimit < filtered.length && (
            <div className="border-t border-border p-4 text-center">
              <Button type="button" variant="outline" onClick={() => setVisibleLimit((value) => value + OPERATIONS_PAGE_SIZE)}>
                {t("operations.loadMore", { count: Math.min(OPERATIONS_PAGE_SIZE, filtered.length - visibleLimit) })}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet open={selected != null} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <SheetContent side="right" className="w-full max-w-md sm:max-w-md">
          {selected != null && <>
            <SheetHeader><SheetTitle>{operationTitle(selected, snapshot, t)}</SheetTitle><SheetDescription>{t(`operations.kinds.${selected.kind}`)}</SheetDescription></SheetHeader>
            <dl className="mt-6 divide-y divide-border border-y border-border">
              <div className="grid gap-1 py-3 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-3"><dt className="text-xs text-muted-foreground">{t("operations.date")}</dt><dd className="min-w-0 break-words text-sm">{new Intl.DateTimeFormat(i18n.language, { dateStyle: "long", timeStyle: "short" }).format(selected.timestamp)}</dd></div>
              <div className="grid gap-1 py-3 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-3"><dt className="text-xs text-muted-foreground">{t("operations.amount")}</dt><dd className="min-w-0"><OperationAmount operation={selected} accountId={contextAccountId} /></dd></div>
              <div className="grid gap-1 py-3 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-3"><dt className="text-xs text-muted-foreground">{t("operations.details")}</dt><dd className="min-w-0 break-words text-sm">{operationContext(selected, snapshot, t)}</dd></div>
            </dl>
          </>}
        </SheetContent>
      </Sheet>
    </main>
  );
}
