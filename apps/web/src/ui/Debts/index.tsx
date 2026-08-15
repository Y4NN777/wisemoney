import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Bell, CalendarDays, CalendarPlus, CheckCircle2, Clock3, HandCoins, Plus, RefreshCw } from "lucide-react";
import { useCreateDebtCredit, useFinancialState, useUpdateDebtCreditDueDate, useUpdateDebtCreditStatus } from "../../hooks/useFinancialState.ts";
import type { DebtCreditKind, DebtCreditState, DebtCreditStatus } from "../../domain/financialState.ts";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Badge } from "../../components/ui/badge.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../../components/ui/dialog.tsx";
import { Input } from "../../components/ui/input.tsx";
import { Label } from "../../components/ui/label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select.tsx";
import { Skeleton } from "../../components/ui/skeleton.tsx";
import { currencyInputStep, formatMoney as formatMoneyValue, parseMajorUnits } from "../../types/money.ts";
import { formatLocalDateInput, parseLocalDateInput } from "../../lib/localDate.ts";
import { createReminderCalendar, downloadCalendarExport, type CalendarExport, type CalendarLocale } from "../../calendar/ics.ts";
import { useReminders } from "../../reminders/ReminderProvider.tsx";

const STATUS_BADGE_CLASS: Record<DebtCreditStatus, string> = {
  pending: "border-amber bg-amber-wash text-amber",
  partial: "border-ocean-primary bg-ocean-wash text-ocean-dark",
  settled: "border-sage bg-sage-wash text-sage",
};

function formatMoney(minorUnits: number, currency: string): string {
  return formatMoneyValue({ minorUnits, currency });
}

function todayInputValue(): string {
  return formatLocalDateInput();
}

function displayDate(timestamp: number, language: string): string {
  return new Date(timestamp).toLocaleDateString(language);
}

export function parseOptionalDueDate(value: string): number | null | undefined {
  if (value === "") return null;
  return parseLocalDateInput(value) ?? undefined;
}

export function createDebtCreditCalendar(
  item: DebtCreditState,
  locale: CalendarLocale,
  alarmMinutesBefore: number | number[] = 10_080,
): CalendarExport {
  if (item.dueDate == null) throw new Error("Debt or receivable has no due date");
  return createReminderCalendar({
    id: `debt-credit-${item.id}`,
    label: `${item.partyName}: ${item.motive}`,
    startsAt: item.dueDate,
    locale,
    alarmMinutesBefore,
  });
}

type DueDateEditorProps = {
  item: DebtCreditState;
  label: string;
  noDueDate: string;
  saveLabel: string;
  invalidDate: string;
  addToCalendarLabel: string;
  locale: CalendarLocale;
  alarmMinutesBefore: number[];
  updating: boolean;
  onSave: (id: string, dueDate: number | null, partyName: string) => void;
};

function DueDateEditor({ item, label, noDueDate, saveLabel, invalidDate, addToCalendarLabel, locale, alarmMinutesBefore, updating, onSave }: DueDateEditorProps) {
  const [value, setValue] = useState(item.dueDate == null ? "" : formatLocalDateInput(new Date(item.dueDate)));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValue(item.dueDate == null ? "" : formatLocalDateInput(new Date(item.dueDate)));
    setError(null);
  }, [item.dueDate]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const dueDate = parseOptionalDueDate(value);
    if (dueDate === undefined) {
      setError(invalidDate);
      return;
    }
    setError(null);
    onSave(item.id, dueDate, item.partyName);
  };

  return (
    <form onSubmit={submit} className="border-t border-border pt-3">
      <Label htmlFor={`debt-credit-due-${item.id}`} className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <CalendarDays className="h-4 w-4" />
        {label}
      </Label>
      <div className="mt-2 flex gap-2">
        <Input
          id={`debt-credit-due-${item.id}`}
          type="date"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-invalid={error != null}
          aria-describedby={error == null ? undefined : `debt-credit-due-error-${item.id}`}
          placeholder={noDueDate}
          className="h-9"
        />
        <Button type="submit" size="sm" variant="outline" disabled={updating}>
          {saveLabel}
        </Button>
      </div>
      {value === "" && error == null && <p className="mt-1 text-xs text-muted-foreground">{noDueDate}</p>}
      {error != null && <p id={`debt-credit-due-error-${item.id}`} role="alert" className="mt-1 text-xs text-destructive">{error}</p>}
      {item.dueDate != null && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="mt-2 px-0 text-ocean-primary"
          onClick={() => downloadCalendarExport(createDebtCreditCalendar(item, locale, alarmMinutesBefore))}
        >
          <CalendarPlus className="mr-1.5 h-4 w-4" />
          {addToCalendarLabel}
        </Button>
      )}
    </form>
  );
}

function statusIcon(status: DebtCreditStatus) {
  if (status === "settled") return <CheckCircle2 className="h-4 w-4 text-sage" />;
  if (status === "partial") return <RefreshCw className="h-4 w-4 text-ocean-primary" />;
  return <Clock3 className="h-4 w-4 text-amber" />;
}

function totalsByCurrency(items: DebtCreditState[]): Array<{ minorUnits: number; currency: string }> {
  const totals = new Map<string, number>();
  for (const item of items) {
    if (item.status === "settled") continue;
    totals.set(item.amount.currency, (totals.get(item.amount.currency) ?? 0) + item.amount.minorUnits);
  }
  return [...totals.entries()]
    .map(([currency, minorUnits]) => ({ minorUnits, currency }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

type DebtCreditColumnProps = {
  title: string;
  emptyText: string;
  partyLabel: string;
  motiveLabel: string;
  amountLabel: string;
  dateLabel: string;
  dueDateLabel: string;
  noDueDate: string;
  saveDueDateLabel: string;
  invalidDueDate: string;
  addToCalendarLabel: string;
  alarmMinutesBefore: number[];
  statusAriaLabel: string;
  statusLabels: Record<DebtCreditStatus, string>;
  items: DebtCreditState[];
  onStatusChange: (id: string, status: DebtCreditStatus, label: string) => void;
  onDueDateChange: (id: string, dueDate: number | null, label: string) => void;
  updating: boolean;
  updatingDueDate: boolean;
};

function DebtCreditColumn({
  title,
  emptyText,
  partyLabel,
  motiveLabel,
  amountLabel,
  dateLabel,
  dueDateLabel,
  noDueDate,
  saveDueDateLabel,
  invalidDueDate,
  addToCalendarLabel,
  alarmMinutesBefore,
  statusAriaLabel,
  statusLabels,
  items,
  onStatusChange,
  onDueDateChange,
  updating,
  updatingDueDate,
}: DebtCreditColumnProps) {
  const { i18n } = useTranslation();
  const calendarLocale: CalendarLocale = i18n.language.toLowerCase().startsWith("fr") ? "fr" : "en";

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
        <Badge variant="outline" className="text-[10px]">
          {items.length}
        </Badge>
      </div>

      {items.length === 0 ? (
        <div className="empty-state">{emptyText}</div>
      ) : (
        <div className="grid gap-3">
          {items.map((item) => (
            <Card key={item.id} className="interactive-surface">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{partyLabel}</p>
                    <p className="truncate text-sm font-semibold">{item.partyName}</p>
                  </div>
                  <Badge variant="outline" className={`shrink-0 ${STATUS_BADGE_CLASS[item.status]}`}>
                    {statusLabels[item.status]}
                  </Badge>
                </div>

                <div className="rounded-md border border-border bg-accent/45 p-3">
                  <p className="text-xs text-muted-foreground">{motiveLabel}</p>
                  <p className="mt-1 text-sm">{item.motive}</p>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">{amountLabel}</p>
                    <p className="font-semibold">{formatMoney(item.amount.minorUnits, item.amount.currency)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{dateLabel}</p>
                    <p className="font-semibold">{displayDate(item.date, i18n.language)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {statusIcon(item.status)}
                  <Select
                    value={item.status}
                    onValueChange={(value) => onStatusChange(item.id, value as DebtCreditStatus, item.partyName)}
                    disabled={updating}
                  >
                    <SelectTrigger aria-label={statusAriaLabel.replace("{{partyName}}", item.partyName)} className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">{statusLabels.pending}</SelectItem>
                      <SelectItem value="partial">{statusLabels.partial}</SelectItem>
                      <SelectItem value="settled">{statusLabels.settled}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <DueDateEditor
                  item={item}
                  label={dueDateLabel}
                  noDueDate={noDueDate}
                  saveLabel={saveDueDateLabel}
                  invalidDate={invalidDueDate}
                  addToCalendarLabel={addToCalendarLabel}
                  locale={calendarLocale}
                  alarmMinutesBefore={alarmMinutesBefore}
                  updating={updatingDueDate}
                  onSave={onDueDateChange}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

export default function Debts() {
  const { t, i18n } = useTranslation();
  const { settings: reminderSettings } = useReminders();
  const debtAlarmMinutes = reminderSettings.types.debt_due.leadDays.map((day) => day * 24 * 60);
  const receivableAlarmMinutes = reminderSettings.types.receivable_due.leadDays.map((day) => day * 24 * 60);
  const { data: snapshot, isLoading } = useFinancialState();
  const createDebtCredit = useCreateDebtCredit();
  const updateStatus = useUpdateDebtCreditStatus();
  const updateDueDate = useUpdateDebtCreditDueDate();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [kind, setKind] = useState<DebtCreditKind>("receivable");
  const [partyName, setPartyName] = useState("");
  const [motive, setMotive] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [dateValue, setDateValue] = useState(todayInputValue());
  const [dueDateValue, setDueDateValue] = useState("");
  const [status, setStatus] = useState<DebtCreditStatus>("pending");
  const [createError, setCreateError] = useState<string | null>(null);

  const debtCredits = useMemo(
    () => [...(snapshot?.debtCredits ?? [])].sort((a, b) => b.date - a.date),
    [snapshot?.debtCredits],
  );
  const receivables = debtCredits.filter((item) => item.kind === "receivable");
  const debts = debtCredits.filter((item) => item.kind === "debt");
  const unsettledReceivables = receivables.filter((item) => item.status !== "settled");

  const currency = snapshot?.baseCurrency ?? "XOF";
  const receivableTotals = totalsByCurrency(receivables);
  const debtTotals = totalsByCurrency(debts);
  const statusLabels: Record<DebtCreditStatus, string> = {
    pending: t("debts.status.pending"),
    partial: t("debts.status.partial"),
    settled: t("debts.status.settled"),
  };

  const resetForm = () => {
    setKind("receivable");
    setPartyName("");
    setMotive("");
    setAmountStr("");
    setDateValue(todayInputValue());
    setDueDateValue("");
    setStatus("pending");
    setCreateError(null);
  };

  const handleCreate = (event: FormEvent) => {
    event.preventDefault();
    setCreateError(null);

    const minorUnits = parseMajorUnits(amountStr, currency);
    if (!partyName.trim()) {
      setCreateError(kind === "debt" ? t("debts.errors.creditorRequired") : t("debts.errors.debtorRequired"));
      return;
    }
    if (!motive.trim()) {
      setCreateError(t("debts.errors.motiveRequired"));
      return;
    }
    if (minorUnits == null || minorUnits <= 0) {
      setCreateError(t("debts.errors.invalidAmount"));
      return;
    }
    const date = parseLocalDateInput(dateValue);
    if (date == null) {
      setCreateError(t("debts.errors.invalidDate"));
      return;
    }
    const dueDate = parseOptionalDueDate(dueDateValue);
    if (dueDate === undefined) {
      setCreateError(t("debts.errors.invalidDueDate"));
      return;
    }

    const label = partyName.trim();
    createDebtCredit.mutate(
      {
        kind,
        partyName: label,
        motive: motive.trim(),
        amount: { minorUnits, currency },
        date,
        status,
        dueDate,
      },
      {
        onSuccess: () => {
          setDialogOpen(false);
          resetForm();
          toast.success(kind === "debt" ? t("debts.toasts.debtCreated") : t("debts.toasts.receivableCreated"), { description: label });
        },
        onError: () => {
          const message = t("debts.errors.createFailed");
          setCreateError(message);
          toast.error(message);
        },
      },
    );
  };

  const handleStatusChange = (id: string, nextStatus: DebtCreditStatus, label: string) => {
    updateStatus.mutate(
      { debtCreditId: id, status: nextStatus },
      {
        onSuccess: () => toast.success(t("debts.toasts.statusUpdated"), { description: label }),
        onError: () => {
          const message = t("debts.errors.statusUpdateFailed");
          toast.error(message);
        },
      },
    );
  };

  const handleDueDateChange = (id: string, dueDate: number | null, label: string) => {
    updateDueDate.mutate(
      { debtCreditId: id, dueDate },
      {
        onSuccess: () => toast.success(t("debts.toasts.dueDateUpdated"), { description: label }),
        onError: () => toast.error(t("debts.errors.dueDateUpdateFailed")),
      },
    );
  };

  if (isLoading) {
    return (
      <main aria-label={t("debts.aria")} className="app-page">
        <h1 className="page-title">{t("debts.title")}</h1>
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-24 w-full" />
        ))}
      </main>
    );
  }

  return (
    <main aria-label={t("debts.aria")} className="app-page">
      <div className="page-head">
        <div>
          <h1 className="page-title">{t("debts.title")}</h1>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-1 h-4 w-4" />
              {t("debts.add")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("debts.dialogTitle")}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              {createError != null && (
                <p role="alert" className="text-sm text-destructive">{createError}</p>
              )}
              <div className="space-y-2">
                <Label htmlFor="debt-credit-kind">{t("debts.fields.type")}</Label>
                <Select value={kind} onValueChange={(value) => setKind(value as DebtCreditKind)}>
                  <SelectTrigger id="debt-credit-kind">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="receivable">{t("debts.kind.receivable")}</SelectItem>
                    <SelectItem value="debt">{t("debts.kind.debt")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="debt-credit-party">
                  {kind === "debt" ? t("debts.fields.creditorName") : t("debts.fields.debtorName")}
                </Label>
                <Input
                  id="debt-credit-party"
                  value={partyName}
                  onChange={(event) => setPartyName(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="debt-credit-motive">{t("debts.fields.motive")}</Label>
                <Input
                  id="debt-credit-motive"
                  value={motive}
                  onChange={(event) => setMotive(event.target.value)}
                  required
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="debt-credit-amount">{t("debts.fields.amount", { currency })}</Label>
                  <Input
                    id="debt-credit-amount"
                    type="number"
                    min={currencyInputStep(currency)}
                    step={currencyInputStep(currency)}
                    value={amountStr}
                    onChange={(event) => setAmountStr(event.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="debt-credit-date">{t("debts.fields.date")}</Label>
                  <Input
                    id="debt-credit-date"
                    type="date"
                    value={dateValue}
                    onChange={(event) => setDateValue(event.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="debt-credit-due-date">{t("debts.fields.dueDate")}</Label>
                <Input
                  id="debt-credit-due-date"
                  type="date"
                  value={dueDateValue}
                  onChange={(event) => setDueDateValue(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">{t("debts.noDueDateHint")}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="debt-credit-status">{t("debts.fields.status")}</Label>
                <Select value={status} onValueChange={(value) => setStatus(value as DebtCreditStatus)}>
                  <SelectTrigger id="debt-credit-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">{statusLabels.pending}</SelectItem>
                    <SelectItem value="partial">{statusLabels.partial}</SelectItem>
                    <SelectItem value="settled">{statusLabels.settled}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" disabled={createDebtCredit.isPending} className="w-full">
                {createDebtCredit.isPending ? t("debts.adding") : t("debts.add")}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="metric-surface">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <HandCoins className="h-4 w-4 text-ocean-primary" />
              {t("debts.metrics.unsettledReceivables")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {receivableTotals.length === 0 ? (
              <p className="text-2xl font-semibold">{formatMoney(0, currency)}</p>
            ) : receivableTotals.map((total) => (
              <p key={total.currency} className="text-2xl font-semibold">{formatMoney(total.minorUnits, total.currency)}</p>
            ))}
          </CardContent>
        </Card>
        <Card className="metric-surface">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t("debts.metrics.unsettledDebts")}</CardTitle>
          </CardHeader>
          <CardContent>
            {debtTotals.length === 0 ? (
              <p className="text-2xl font-semibold">{formatMoney(0, currency)}</p>
            ) : debtTotals.map((total) => (
              <p key={total.currency} className="text-2xl font-semibold">{formatMoney(total.minorUnits, total.currency)}</p>
            ))}
          </CardContent>
        </Card>
        <Card className={unsettledReceivables.length > 0 ? "border-amber bg-amber-wash" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Bell className="h-4 w-4 text-amber" />
              {t("debts.metrics.reminders")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{unsettledReceivables.length}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("debts.metrics.unsettledReceivables")}</p>
          </CardContent>
        </Card>
      </div>

      {unsettledReceivables.length > 0 && (
        <section className="rounded-lg border border-amber bg-amber-wash p-3">
          <div className="mb-3 flex items-center gap-2">
            <Bell className="h-4 w-4 text-amber" />
            <h2 className="text-sm font-semibold">{t("debts.reminders.title")}</h2>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {unsettledReceivables.map((item) => (
              <div key={item.id} className="rounded-md border border-amber/40 bg-card p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{item.partyName}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{item.motive}</p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {item.dueDate == null ? t("debts.noDueDate") : displayDate(item.dueDate, i18n.language)}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold">
                    {formatMoney(item.amount.minorUnits, item.amount.currency)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <DebtCreditColumn
          title={t("debts.sections.receivables")}
          emptyText={t("debts.empty.receivables")}
          partyLabel={t("debts.fields.debtorName")}
          motiveLabel={t("debts.fields.motive")}
          amountLabel={t("debts.fields.amountShort")}
          dateLabel={t("debts.fields.date")}
          dueDateLabel={t("debts.fields.dueDate")}
          noDueDate={t("debts.noDueDate")}
          saveDueDateLabel={t("debts.saveDueDate")}
          invalidDueDate={t("debts.errors.invalidDueDate")}
          addToCalendarLabel={t("debts.addToCalendar")}
          alarmMinutesBefore={receivableAlarmMinutes}
          statusAriaLabel={t("debts.statusAria")}
          statusLabels={statusLabels}
          items={receivables}
          onStatusChange={handleStatusChange}
          onDueDateChange={handleDueDateChange}
          updating={updateStatus.isPending}
          updatingDueDate={updateDueDate.isPending}
        />
        <DebtCreditColumn
          title={t("debts.sections.debts")}
          emptyText={t("debts.empty.debts")}
          partyLabel={t("debts.fields.creditorName")}
          motiveLabel={t("debts.fields.motive")}
          amountLabel={t("debts.fields.amountShort")}
          dateLabel={t("debts.fields.date")}
          dueDateLabel={t("debts.fields.dueDate")}
          noDueDate={t("debts.noDueDate")}
          saveDueDateLabel={t("debts.saveDueDate")}
          invalidDueDate={t("debts.errors.invalidDueDate")}
          addToCalendarLabel={t("debts.addToCalendar")}
          alarmMinutesBefore={debtAlarmMinutes}
          statusAriaLabel={t("debts.statusAria")}
          statusLabels={statusLabels}
          items={debts}
          onStatusChange={handleStatusChange}
          onDueDateChange={handleDueDateChange}
          updating={updateStatus.isPending}
          updatingDueDate={updateDueDate.isPending}
        />
      </div>
    </main>
  );
}
