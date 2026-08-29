import { useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { CalendarDays, CalendarPlus, CheckCircle2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import type {
  FinancialStateSnapshot, PlannedExpensePriority, PlannedExpenseState,
} from "@/domain/financialState.ts";
import {
  useCancelPlannedExpense, useCompletePlannedExpense, useCreatePlannedExpense,
  useUpdatePlannedExpense,
} from "@/hooks/useFinancialState.ts";
import { categoryDisplayName } from "@/lib/categoryName.ts";
import { formatLocalDateInput, parseLocalDateInput } from "@/lib/localDate.ts";
import { currencyFractionDigits, formatMoney, parseMajorUnits } from "@/types/money.ts";
import { createReminderCalendar, downloadCalendarExport } from "@/calendar/ics.ts";
import { useReminders } from "@/reminders/ReminderProvider.tsx";

const PRIORITIES: PlannedExpensePriority[] = ["high", "medium", "low"];
const PRIORITY_NUMBER: Record<PlannedExpensePriority, string> = {
  high: "01",
  medium: "02",
  low: "03",
};
const PRIORITY_RANK: Record<PlannedExpensePriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export function sortPlannedExpenses(items: readonly PlannedExpenseState[]): PlannedExpenseState[] {
  return [...items].sort((left, right) =>
    PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority] ||
    (left.dueDate == null ? 1 : right.dueDate == null ? -1 : left.dueDate - right.dueDate) ||
    left.createdAt - right.createdAt ||
    left.id.localeCompare(right.id)
  );
}

export function compatibleAccountIds(
  accounts: FinancialStateSnapshot["accounts"],
  currency: string,
): string[] {
  return accounts
    .filter((account) => account.isActive && account.currency === currency)
    .map((account) => account.id);
}

type ExpenseDraft = {
  label: string;
  amount: string;
  currency: string;
  categoryId: string;
  priority: PlannedExpensePriority;
  dueDate: string;
  note: string;
};

type DraftErrors = Partial<Record<keyof ExpenseDraft, string>> & { form?: string };

function newDraft(snapshot: FinancialStateSnapshot): ExpenseDraft {
  return {
    label: "",
    amount: "",
    currency: snapshot.baseCurrency,
    categoryId: "",
    priority: "medium",
    dueDate: "",
    note: "",
  };
}

function editDraft(item: PlannedExpenseState): ExpenseDraft {
  return {
    label: item.label,
    amount: String(item.estimatedAmount.minorUnits / 10 ** currencyFractionDigits(item.estimatedAmount.currency)),
    currency: item.estimatedAmount.currency,
    categoryId: item.categoryId,
    priority: item.priority,
    dueDate: item.dueDate == null ? "" : formatLocalDateInput(new Date(item.dueDate)),
    note: item.note,
  };
}

function ExpenseFields({
  draft,
  errors,
  categories,
  currencies,
  onChange,
}: {
  draft: ExpenseDraft;
  errors: DraftErrors;
  categories: FinancialStateSnapshot["categories"];
  currencies: string[];
  onChange: (patch: Partial<ExpenseDraft>) => void;
}) {
  const { t } = useTranslation();
  const fieldError = (field: keyof ExpenseDraft) => errors[field] == null ? undefined : `${field}-error`;

  return (
    <div className="grid gap-4 pt-2 sm:grid-cols-2">
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="planned-label">{t("capture.plannedExpenses.fields.label")}</Label>
        <Input id="planned-label" value={draft.label} onChange={(event) => onChange({ label: event.target.value })}
          aria-invalid={errors.label != null} aria-describedby={fieldError("label")} autoFocus required />
        {errors.label != null && <p id="label-error" role="alert" className="text-sm text-destructive">{errors.label}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="planned-amount">{t("capture.plannedExpenses.fields.estimatedAmount")}</Label>
        <Input id="planned-amount" type="text" inputMode="decimal" placeholder="0.00" value={draft.amount}
          onChange={(event) => onChange({ amount: event.target.value })}
          aria-invalid={errors.amount != null} aria-describedby={fieldError("amount")} required />
        {errors.amount != null && <p id="amount-error" role="alert" className="text-sm text-destructive">{errors.amount}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="planned-currency">{t("capture.plannedExpenses.fields.currency")}</Label>
        <Select value={draft.currency} onValueChange={(currency) => onChange({ currency })}>
          <SelectTrigger id="planned-currency"><SelectValue /></SelectTrigger>
          <SelectContent>{currencies.map((currency) => <SelectItem key={currency} value={currency}>{currency}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="planned-category">{t("capture.plannedExpenses.fields.category")}</Label>
        <Select value={draft.categoryId} onValueChange={(categoryId) => onChange({ categoryId })}>
          <SelectTrigger id="planned-category" aria-invalid={errors.categoryId != null} aria-describedby={fieldError("categoryId")}>
            <SelectValue placeholder={t("capture.plannedExpenses.fields.selectCategory")} />
          </SelectTrigger>
          <SelectContent>{categories.map((category) => (
            <SelectItem key={category.id} value={category.id}>{categoryDisplayName(category, t)}</SelectItem>
          ))}</SelectContent>
        </Select>
        {errors.categoryId != null && <p id="categoryId-error" role="alert" className="text-sm text-destructive">{errors.categoryId}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="planned-priority">{t("capture.plannedExpenses.fields.priority")}</Label>
        <Select value={draft.priority} onValueChange={(priority) => onChange({ priority: priority as PlannedExpensePriority })}>
          <SelectTrigger id="planned-priority"><SelectValue /></SelectTrigger>
          <SelectContent>{PRIORITIES.map((priority) => (
            <SelectItem key={priority} value={priority}>{t(`capture.plannedExpenses.priorities.${priority}`)}</SelectItem>
          ))}</SelectContent>
        </Select>
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="planned-due-date">{t("capture.plannedExpenses.fields.dueDate")}</Label>
        <Input id="planned-due-date" type="date" value={draft.dueDate} onChange={(event) => onChange({ dueDate: event.target.value })}
          aria-invalid={errors.dueDate != null} aria-describedby={fieldError("dueDate")} />
        {errors.dueDate != null && <p id="dueDate-error" role="alert" className="text-sm text-destructive">{errors.dueDate}</p>}
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="planned-note">{t("capture.plannedExpenses.fields.note")}</Label>
        <textarea id="planned-note" value={draft.note} onChange={(event) => onChange({ note: event.target.value })}
          className="min-h-24 w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-ring" />
      </div>
    </div>
  );
}

function validateDraft(draft: ExpenseDraft, t: (key: string) => string): {
  errors: DraftErrors;
  amount: number | null;
  dueDate: number | null;
} {
  const errors: DraftErrors = {};
  const amount = parseMajorUnits(draft.amount, draft.currency);
  const dueDate = draft.dueDate === "" ? null : parseLocalDateInput(draft.dueDate);
  if (draft.label.trim() === "") errors.label = t("capture.plannedExpenses.errors.labelRequired");
  if (amount == null || amount <= 0) errors.amount = t("capture.plannedExpenses.errors.positiveAmount");
  if (draft.categoryId === "") errors.categoryId = t("capture.plannedExpenses.errors.categoryRequired");
  if (draft.dueDate !== "" && dueDate == null) errors.dueDate = t("capture.plannedExpenses.errors.invalidDate");
  return { errors, amount, dueDate };
}

export function PlannedExpensesSection({
  snapshot,
  onOpenAccounts,
}: {
  snapshot: FinancialStateSnapshot;
  onOpenAccounts: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { settings: reminderSettings } = useReminders();
  const activeCategories = snapshot.categories.filter((category) => !category.isArchived);
  const currencies = useMemo(() => [...new Set([
    snapshot.baseCurrency,
    ...snapshot.accounts.filter((account) => account.isActive).map((account) => account.currency),
  ])].sort(), [snapshot.accounts, snapshot.baseCurrency]);
  const activeItems = useMemo(() => sortPlannedExpenses(
    snapshot.plannedExpenses.filter((item) => item.status === "pending"),
  ), [snapshot.plannedExpenses]);
  const history = useMemo(() => snapshot.plannedExpenses
    .filter((item) => item.status !== "pending")
    .sort((left, right) =>
      (right.completedAt ?? right.cancelledAt ?? right.updatedAt) -
      (left.completedAt ?? left.cancelledAt ?? left.updatedAt) || right.id.localeCompare(left.id)
    ), [snapshot.plannedExpenses]);

  const createMutation = useCreatePlannedExpense();
  const updateMutation = useUpdatePlannedExpense();
  const cancelMutation = useCancelPlannedExpense();
  const completeMutation = useCompletePlannedExpense();
  const isWriting = createMutation.isPending || updateMutation.isPending || cancelMutation.isPending || completeMutation.isPending;

  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState<ExpenseDraft>(() => newDraft(snapshot));
  const [draftErrors, setDraftErrors] = useState<DraftErrors>({});
  const [editing, setEditing] = useState<PlannedExpenseState | null>(null);
  const [editState, setEditState] = useState<ExpenseDraft>(() => newDraft(snapshot));
  const [editErrors, setEditErrors] = useState<DraftErrors>({});
  const [completing, setCompleting] = useState<PlannedExpenseState | null>(null);
  const [actualAmount, setActualAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [occurredDate, setOccurredDate] = useState(() => formatLocalDateInput());
  const [completeError, setCompleteError] = useState<string | null>(null);

  const date = (timestamp: number) => new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" }).format(timestamp);
  const categoryName = (categoryId: string) => {
    const category = snapshot.categories.find((candidate) => candidate.id === categoryId);
    return category == null ? t("capture.plannedExpenses.unknownCategory") : categoryDisplayName(category, t);
  };
  const accountName = (id: string | null) => id == null
    ? t("capture.plannedExpenses.unknownAccount")
    : snapshot.accounts.find((account) => account.id === id)?.name ?? t("capture.plannedExpenses.unknownAccount");

  const openEdit = (item: PlannedExpenseState) => {
    setEditing(item);
    setEditState(editDraft(item));
    setEditErrors({});
  };

  const openComplete = (item: PlannedExpenseState) => {
    const compatible = snapshot.accounts.filter((account) => account.isActive && account.currency === item.estimatedAmount.currency);
    setCompleting(item);
    setActualAmount(editDraft(item).amount);
    setAccountId(compatible[0]?.id ?? "");
    setOccurredDate(formatLocalDateInput());
    setCompleteError(null);
  };

  const submitCreate = (event: FormEvent) => {
    event.preventDefault();
    if (isWriting) return;
    const validated = validateDraft(draft, t);
    setDraftErrors(validated.errors);
    if (Object.keys(validated.errors).length > 0 || validated.amount == null) return;
    createMutation.mutate({
      label: draft.label.trim(),
      estimatedAmount: { minorUnits: validated.amount, currency: draft.currency },
      categoryId: draft.categoryId,
      priority: draft.priority,
      dueDate: validated.dueDate,
      note: draft.note.trim(),
    }, {
      onSuccess: () => {
        setDraft(newDraft(snapshot));
        setDraftErrors({});
        setCreateOpen(false);
        toast.success(t("capture.plannedExpenses.success.created"));
      },
      onError: () => setDraftErrors({ form: t("capture.plannedExpenses.errors.createFailed") }),
    });
  };

  const submitEdit = (event: FormEvent) => {
    event.preventDefault();
    if (editing == null || isWriting) return;
    const validated = validateDraft(editState, t);
    setEditErrors(validated.errors);
    if (Object.keys(validated.errors).length > 0 || validated.amount == null) return;
    updateMutation.mutate({
      plannedExpenseId: editing.id,
      label: editState.label.trim(),
      estimatedAmount: { minorUnits: validated.amount, currency: editState.currency },
      categoryId: editState.categoryId,
      priority: editState.priority,
      dueDate: validated.dueDate,
      note: editState.note.trim(),
    }, {
      onSuccess: () => {
        setEditing(null);
        toast.success(t("capture.plannedExpenses.success.updated"));
      },
      onError: () => setEditErrors({ form: t("capture.plannedExpenses.errors.updateFailed") }),
    });
  };

  const quickPriority = (item: PlannedExpenseState, priority: PlannedExpensePriority) => {
    if (isWriting || priority === item.priority) return;
    updateMutation.mutate({
      plannedExpenseId: item.id,
      label: item.label,
      estimatedAmount: item.estimatedAmount,
      categoryId: item.categoryId,
      priority,
      dueDate: item.dueDate,
      note: item.note,
    }, {
      onSuccess: () => toast.success(t("capture.plannedExpenses.success.priorityUpdated")),
      onError: () => toast.error(t("capture.plannedExpenses.errors.updateFailed")),
    });
  };

  const cancel = (item: PlannedExpenseState) => {
    if (isWriting || !window.confirm(t("capture.plannedExpenses.confirmCancel", { label: item.label }))) return;
    cancelMutation.mutate({ plannedExpenseId: item.id }, {
      onSuccess: () => toast.success(t("capture.plannedExpenses.success.cancelled")),
      onError: () => toast.error(t("capture.plannedExpenses.errors.cancelFailed")),
    });
  };

  const submitComplete = (event: FormEvent) => {
    event.preventDefault();
    if (completing == null || isWriting) return;
    setCompleteError(null);
    const amount = parseMajorUnits(actualAmount, completing.estimatedAmount.currency);
    const occurredAt = parseLocalDateInput(occurredDate);
    if (amount == null || amount <= 0) {
      setCompleteError(t("capture.plannedExpenses.errors.positiveAmount"));
      return;
    }
    if (accountId === "") {
      setCompleteError(t("capture.plannedExpenses.errors.accountRequired"));
      return;
    }
    if (occurredAt == null) {
      setCompleteError(t("capture.plannedExpenses.errors.invalidDate"));
      return;
    }
    completeMutation.mutate({
      plannedExpenseId: completing.id,
      accountId,
      actualAmount: { minorUnits: amount, currency: completing.estimatedAmount.currency },
      occurredAt,
    }, {
      onSuccess: () => {
        setCompleting(null);
        toast.success(t("capture.plannedExpenses.success.completed"));
      },
      onError: () => setCompleteError(t("capture.plannedExpenses.errors.completeFailed")),
    });
  };

  const compatibleAccounts = completing == null ? [] : snapshot.accounts.filter(
    (account) => compatibleAccountIds(snapshot.accounts, completing.estimatedAmount.currency).includes(account.id),
  );

  return (
    <Card className="overflow-hidden border-primary/25 bg-card shadow-none">
      <CardHeader className="border-b border-border bg-muted">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-lg">{t("capture.plannedExpenses.title")}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{t("capture.plannedExpenses.description")}</p>
          </div>
          <Button type="button" onClick={() => { setDraft(newDraft(snapshot)); setDraftErrors({}); setCreateOpen(true); }} disabled={isWriting}>
            <Plus className="mr-2 h-4 w-4" />{t("capture.plannedExpenses.add")}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {PRIORITIES.map((priority) => {
          const items = activeItems.filter((item) => item.priority === priority);
          return (
            <section key={priority} className="grid border-b border-border last:border-b-0 lg:grid-cols-[8rem_minmax(0,1fr)]" aria-labelledby={`planned-${priority}`}>
              <header className="border-b border-border bg-muted p-4 lg:border-b-0 lg:border-r">
                <p aria-hidden="true" className="text-4xl font-semibold leading-none tabular-nums text-primary">{PRIORITY_NUMBER[priority]}</p>
                <h3 id={`planned-${priority}`} className="mt-2 text-sm font-semibold">{t(`capture.plannedExpenses.priorityGroups.${priority}`)}</h3>
              </header>
              {items.length === 0 ? (
                <p className="p-5 text-sm text-muted-foreground">{t("capture.plannedExpenses.emptyPriority")}</p>
              ) : (
                <ul className="grid gap-3 p-3 lg:block lg:divide-y lg:divide-border lg:p-0">{items.map((item) => (
                  <li key={item.id} className="grid gap-4 border border-border bg-card p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start lg:border-0">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <p className="font-semibold">{item.label}</p>
                        <p className="font-semibold tabular-nums">{formatMoney(item.estimatedAmount)}</p>
                      </div>
                      <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
                        <div><dt className="sr-only">{t("capture.plannedExpenses.fields.category")}</dt><dd>{categoryName(item.categoryId)}</dd></div>
                        <div className="flex items-center gap-1.5"><CalendarDays className="h-4 w-4" /><dt className="sr-only">{t("capture.plannedExpenses.fields.dueDate")}</dt><dd>{item.dueDate == null ? t("capture.plannedExpenses.noDueDate") : date(item.dueDate)}</dd></div>
                      </dl>
                      {item.note && <p className="mt-2 text-sm text-foreground/80">{item.note}</p>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 md:justify-end">
                      {item.dueDate != null && (
                        <Button type="button" size="sm" variant="outline" onClick={() => downloadCalendarExport(createReminderCalendar({
                          id: `planned-expense-${item.id}`,
                          label: item.label,
                          startsAt: item.dueDate!,
                          locale: i18n.language.toLowerCase().startsWith("fr") ? "fr" : "en",
                          alarmMinutesBefore: reminderSettings.types.planned_expense.leadDays.map((day) => day * 24 * 60),
                        }))}>
                          <CalendarPlus className="mr-1.5 h-4 w-4" />{t("reminders.calendar.add")}
                        </Button>
                      )}
                      <Select value={item.priority} onValueChange={(value) => quickPriority(item, value as PlannedExpensePriority)} disabled={isWriting}>
                        <SelectTrigger className="h-9 w-32" aria-label={t("capture.plannedExpenses.quickPriority", { label: item.label })}><SelectValue /></SelectTrigger>
                        <SelectContent>{PRIORITIES.map((candidate) => <SelectItem key={candidate} value={candidate}>{t(`capture.plannedExpenses.priorities.${candidate}`)}</SelectItem>)}</SelectContent>
                      </Select>
                      <Button type="button" size="sm" variant="outline" onClick={() => openEdit(item)} disabled={isWriting}><Pencil className="mr-1.5 h-4 w-4" />{t("capture.plannedExpenses.actions.edit")}</Button>
                      <Button type="button" size="sm" onClick={() => openComplete(item)} disabled={isWriting}><CheckCircle2 className="mr-1.5 h-4 w-4" />{t("capture.plannedExpenses.actions.complete")}</Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => cancel(item)} disabled={isWriting}><Trash2 className="mr-1.5 h-4 w-4" />{t("capture.plannedExpenses.actions.cancel")}</Button>
                    </div>
                  </li>
                ))}</ul>
              )}
            </section>
          );
        })}

        <details className="border-t border-border">
          <summary className="cursor-pointer bg-muted px-4 py-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset">
            {t("capture.plannedExpenses.history.title")} <span className="font-normal tabular-nums text-muted-foreground">({history.length})</span>
          </summary>
          {history.length === 0 ? <p className="p-5 text-sm text-muted-foreground">{t("capture.plannedExpenses.history.empty")}</p> : (
            <ul className="divide-y divide-border">{history.map((item) => {
              const closedAt = item.completedAt ?? item.cancelledAt ?? item.updatedAt;
              return (
                <li key={item.id} className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_auto]">
                  <div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <p className="font-semibold">{item.label}</p>
                      <p className="text-sm font-medium">{t(`capture.plannedExpenses.statuses.${item.status}`)}</p>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{categoryName(item.categoryId)} · {t(`capture.plannedExpenses.priorities.${item.priority}`)}</p>
                  </div>
                  <dl className="grid gap-x-5 gap-y-1 text-sm md:grid-cols-2 md:text-right">
                    <div><dt className="text-muted-foreground">{t("capture.plannedExpenses.history.estimated")}</dt><dd className="font-medium tabular-nums">{formatMoney(item.estimatedAmount)}</dd></div>
                    {item.actualAmount && <div><dt className="text-muted-foreground">{t("capture.plannedExpenses.history.actual")}</dt><dd className="font-medium tabular-nums">{formatMoney(item.actualAmount)}</dd></div>}
                    {item.status === "completed" && <div><dt className="text-muted-foreground">{t("capture.plannedExpenses.history.account")}</dt><dd>{accountName(item.completedAccountId)}</dd></div>}
                    <div><dt className="text-muted-foreground">{t(item.status === "completed" ? "capture.plannedExpenses.history.completedAt" : "capture.plannedExpenses.history.cancelledAt")}</dt><dd>{date(closedAt)}</dd></div>
                  </dl>
                </li>
              );
            })}</ul>
          )}
        </details>
      </CardContent>

      <Dialog open={createOpen} onOpenChange={(open) => { if (!isWriting) setCreateOpen(open); }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>{t("capture.plannedExpenses.createTitle")}</DialogTitle><DialogDescription>{t("capture.plannedExpenses.createDescription")}</DialogDescription></DialogHeader>
          <form onSubmit={submitCreate} noValidate>
            {draftErrors.form != null && <p role="alert" className="text-sm text-destructive">{draftErrors.form}</p>}
            <ExpenseFields draft={draft} errors={draftErrors} categories={activeCategories} currencies={currencies} onChange={(patch) => { setDraft((current) => ({ ...current, ...patch })); setDraftErrors((current) => ({ ...current, ...Object.fromEntries(Object.keys(patch).map((key) => [key, undefined])) })); }} />
            <Button type="submit" disabled={isWriting || activeCategories.length === 0} className="mt-5 w-full sm:w-auto">{createMutation.isPending ? t("capture.plannedExpenses.actions.saving") : t("capture.plannedExpenses.actions.create")}</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={editing != null} onOpenChange={(open) => { if (!open && !isWriting) setEditing(null); }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>{t("capture.plannedExpenses.editTitle")}</DialogTitle></DialogHeader>
          <form onSubmit={submitEdit} noValidate>
            {editErrors.form != null && <p role="alert" className="text-sm text-destructive">{editErrors.form}</p>}
            <ExpenseFields draft={editState} errors={editErrors} categories={activeCategories} currencies={[...new Set([...currencies, editState.currency])]} onChange={(patch) => { setEditState((current) => ({ ...current, ...patch })); setEditErrors((current) => ({ ...current, ...Object.fromEntries(Object.keys(patch).map((key) => [key, undefined])) })); }} />
            <Button type="submit" disabled={isWriting} className="mt-5 w-full sm:w-auto">{updateMutation.isPending ? t("capture.plannedExpenses.actions.saving") : t("capture.plannedExpenses.actions.save")}</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={completing != null} onOpenChange={(open) => { if (!open && !isWriting) setCompleting(null); }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("capture.plannedExpenses.completeTitle")}</DialogTitle>
            <DialogDescription>{t("capture.plannedExpenses.completeWarning")}</DialogDescription>
          </DialogHeader>
          {completing && <form onSubmit={submitComplete} className="space-y-4 pt-2" noValidate>
            {completeError != null && <p role="alert" className="text-sm text-destructive">{completeError}</p>}
            <div className="grid gap-3 border-y border-border bg-muted px-3 py-3 sm:grid-cols-2">
              <div><p className="text-xs text-muted-foreground">{t("capture.plannedExpenses.fields.label")}</p><p className="font-medium">{completing.label}</p></div>
              <div><p className="text-xs text-muted-foreground">{t("capture.plannedExpenses.fields.category")}</p><p className="font-medium">{categoryName(completing.categoryId)}</p></div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="planned-actual">{t("capture.plannedExpenses.fields.actualAmount")}</Label>
              <div className="grid grid-cols-[1fr_auto] gap-2"><Input id="planned-actual" inputMode="decimal" value={actualAmount} onChange={(event) => setActualAmount(event.target.value)} required /><span className="flex items-center border-l border-border pl-3 text-sm font-semibold">{completing.estimatedAmount.currency}</span></div>
            </div>
            {compatibleAccounts.length === 0 ? (
              <div className="border border-primary/30 bg-muted p-4">
                <p className="text-sm">{t("capture.plannedExpenses.noCompatibleAccount", { currency: completing.estimatedAmount.currency })}</p>
                <Button type="button" variant="outline" className="mt-3" onClick={() => { setCompleting(null); onOpenAccounts(); }}>{t("capture.plannedExpenses.openAccounts")}</Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="planned-account">{t("capture.plannedExpenses.fields.account")}</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger id="planned-account"><SelectValue placeholder={t("capture.plannedExpenses.fields.selectAccount")} /></SelectTrigger>
                  <SelectContent>{compatibleAccounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.name} · {account.currency}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2"><Label htmlFor="planned-occurred">{t("capture.plannedExpenses.fields.occurredAt")}</Label><Input id="planned-occurred" type="date" value={occurredDate} onChange={(event) => setOccurredDate(event.target.value)} required /></div>
            <Button type="submit" disabled={isWriting || compatibleAccounts.length === 0} className="w-full sm:w-auto">{completeMutation.isPending ? t("capture.plannedExpenses.actions.completing") : t("capture.plannedExpenses.actions.confirmComplete")}</Button>
          </form>}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
