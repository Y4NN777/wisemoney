import { useState, type FormEvent } from "react";
import { useFinancialState, useCreateRecurringItem, useArchiveRecurringItem, useRealiseRecurringOccurrence } from "../../hooks/useFinancialState.ts";
import { Card, CardContent } from "../../components/ui/card.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Input } from "../../components/ui/input.tsx";
import { Label } from "../../components/ui/label.tsx";
import { Select, SelectContent, SelectEmptyState, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../../components/ui/dialog.tsx";
import { Skeleton } from "../../components/ui/skeleton.tsx";
import { Plus, Repeat, CheckCircle2, Archive, CalendarPlus } from "lucide-react";
import { toast } from "sonner";
import { currencyInputStep, formatMoney as formatMoneyValue, parseMajorUnits } from "../../types/money.ts";
import { formatLocalDateInput, parseLocalDateInput } from "../../lib/localDate.ts";
import { useTranslation } from "react-i18next";
import { categoryDisplayName } from "../../lib/categoryName.ts";
import { computeProjectedOccurrences } from "../../domain/financialState.ts";
import { createReminderCalendar, downloadCalendarExport } from "../../calendar/ics.ts";
import { useReminders } from "../../reminders/ReminderProvider.tsx";

function formatMoney(minorUnits: number, currency: string): string {
  return formatMoneyValue({ minorUnits, currency });
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(document.documentElement.lang || undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function Recurring() {
  const { t, i18n } = useTranslation();
  const { settings: reminderSettings } = useReminders();
  const { data: snapshot, isLoading } = useFinancialState();
  const createItem = useCreateRecurringItem();
  const archiveItem = useArchiveRecurringItem();
  const realise = useRealiseRecurringOccurrence();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [label, setLabel] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [direction, setDirection] = useState<"expense" | "income">("expense");
  const [frequency, setFrequency] = useState<"weekly" | "monthly" | "yearly">("monthly");
  const [startDate, setStartDate] = useState(formatLocalDateInput);
  const [createError, setCreateError] = useState<string | null>(null);

  const [realiseAccountId, setRealiseAccountId] = useState<string>("");
  const [realiseDialog, setRealiseDialog] = useState<{
    itemId: string;
    categoryId: string;
    label: string;
    amount: { minorUnits: number; currency: string };
    direction: "income" | "expense";
  } | null>(null);

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    if (!label.trim()) {
      setCreateError(t("recurring.errors.labelRequired"));
      return;
    }
    if (!categoryId) {
      setCreateError(t("recurring.errors.selectCategory"));
      return;
    }
    const currency = snapshot?.baseCurrency ?? "XOF";
    const minorUnits = parseMajorUnits(amountStr, currency);
    if (minorUnits == null || minorUnits <= 0) {
      setCreateError(t("recurring.errors.validAmount"));
      return;
    }
    const itemLabel = label.trim();

    const startTimestamp = parseLocalDateInput(startDate);
    if (startTimestamp == null) {
      setCreateError(t("recurring.errors.validStartDate"));
      return;
    }

    createItem.mutate(
      {
        categoryId,
        label: itemLabel,
        amount: { minorUnits, currency },
        direction,
        frequency,
        startDate: startTimestamp,
      },
      {
        onSuccess: () => {
          setDialogOpen(false);
          setCategoryId("");
          setLabel("");
          setAmountStr("");
          setCreateError(null);
          toast.success(t("recurring.created"), { description: itemLabel });
        },
        onError: () => {
          const message = t("recurring.errors.failed");
          setCreateError(message);
          toast.error(message);
        },
      }
    );
  };

  const handleRealise = (fallbackCategoryId: string) => {
    if (realiseDialog == null) return;
    if (!realiseAccountId) return;

    realise.mutate(
      {
        itemId: realiseDialog.itemId,
        accountId: realiseAccountId,
        categoryId: fallbackCategoryId,
        amount: realiseDialog.amount,
        direction: realiseDialog.direction,
        label: realiseDialog.label,
      },
      {
        onSuccess: () => {
          setRealiseDialog(null);
          setRealiseAccountId("");
          toast.success(t("recurring.recorded"), { description: realiseDialog.label });
        },
        onError: () => {
          const message = t("recurring.errors.recordFailed");
          toast.error(message);
        },
      }
    );
  };

  if (isLoading) {
    return (
      <main aria-label={t("recurring.title")} className="app-page">
        <h1 className="page-title">{t("recurring.title")}</h1>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </main>
    );
  }

  const allCategories = snapshot?.categories ?? [];
  const categories = allCategories.filter((category) => !category.isArchived);
  const accounts = snapshot?.accounts.filter((a) => a.isActive) ?? [];
  const compatibleAccounts = realiseDialog == null
    ? accounts
    : accounts.filter((account) => account.currency === realiseDialog.amount.currency);
  const recurringItems = snapshot?.recurringItems.filter((item) => !item.isArchived) ?? [];

  return (
    <main aria-label={t("recurring.title")} className="app-page">
      <div className="page-head">
        <div>
          <h1 className="page-title">{t("recurring.title")}</h1>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" />
              {t("recurring.add")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("recurring.create")}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              {createError != null && (
                <p role="alert" className="text-destructive text-sm">{createError}</p>
              )}
              <div className="space-y-2">
                <Label htmlFor="recur-label">{t("recurring.label")}</Label>
                <Input
                  id="recur-label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder={t("recurring.labelPlaceholder")}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="recur-category">{t("recurring.category")}</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger id="recur-category">
                    <SelectValue placeholder={t("recurring.categoryPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.length === 0 ? (
                      <SelectEmptyState>{t("common.noCategories")}</SelectEmptyState>
                    ) : (
                      categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{categoryDisplayName(c, t)}</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="recur-amount">{t("recurring.amount", { currency: snapshot?.baseCurrency ?? "XOF" })}</Label>
                <Input
                  id="recur-amount"
                  type="number"
                  step={currencyInputStep(snapshot?.baseCurrency ?? "XOF")}
                  min={currencyInputStep(snapshot?.baseCurrency ?? "XOF")}
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="recur-direction">{t("recurring.direction")}</Label>
                  <Select value={direction} onValueChange={(v) => setDirection(v as "expense" | "income")}>
                    <SelectTrigger id="recur-direction">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="expense">{t("recurring.expense")}</SelectItem>
                      <SelectItem value="income">{t("recurring.income")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="recur-frequency">{t("recurring.frequency")}</Label>
                  <Select value={frequency} onValueChange={(v) => setFrequency(v as "weekly" | "monthly" | "yearly")}>
                    <SelectTrigger id="recur-frequency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">{t("recurring.weekly")}</SelectItem>
                      <SelectItem value="monthly">{t("recurring.monthly")}</SelectItem>
                      <SelectItem value="yearly">{t("recurring.yearly")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="recur-start">{t("recurring.startDate")}</Label>
                <Input
                  id="recur-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" disabled={createItem.isPending} className="w-full">
                {createItem.isPending ? t("recurring.creating") : t("recurring.create")}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {recurringItems.length === 0 && (
        <div className="empty-state">
          <Repeat className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p>{t("recurring.empty")}</p>
        </div>
      )}

      <div className="panel-grid">
        {recurringItems.map((item) => {
          const cat = allCategories.find((c) => c.id === item.categoryId);
          return (
            <Card key={item.id} className="interactive-surface">
              <CardContent className="pt-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {cat?.name ?? t("recurring.unknown")} &middot; {t(`recurring.${item.frequency}`)}
                    </p>
                  </div>
                  <span className={`text-sm font-medium ${item.direction === "income" ? "text-green-600" : "text-red-500"}`}>
                    {item.direction === "income" ? "+" : "-"}
                    {formatMoney(item.amount.minorUnits, item.amount.currency)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {t("recurring.started")} {formatDate(item.startDate)}
                    {item.lastRealised != null && <span> &middot; {t("recurring.last")}: {formatDate(item.lastRealised)}</span>}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const nextOccurrence = computeProjectedOccurrences([item], Date.now())[0];
                        if (nextOccurrence == null) return;
                        downloadCalendarExport(createReminderCalendar({
                          id: `recurring-${item.id}`,
                          label: item.label,
                          startsAt: nextOccurrence.dueDate,
                          locale: i18n.language.toLowerCase().startsWith("fr") ? "fr" : "en",
                          recurrence: { frequency: item.frequency },
                          alarmMinutesBefore: reminderSettings.types.recurring_item.leadDays.map((day) => day * 24 * 60),
                        }));
                      }}
                    >
                      <CalendarPlus className="h-3 w-3 mr-1" />
                      {t("reminders.calendar.add")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setRealiseDialog({
                          itemId: item.id,
                          categoryId: item.categoryId,
                          label: item.label,
                          amount: item.amount,
                          direction: item.direction,
                        });
                        setRealiseAccountId(accounts[0]?.id ?? "");
                      }}
                    >
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      {t("recurring.realise")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title={t("recurring.archiveAria", { label: item.label })}
                      aria-label={t("recurring.archiveAria", { label: item.label })}
                      disabled={archiveItem.isPending}
                      onClick={() => archiveItem.mutate(
                        { itemId: item.id },
                        {
                          onSuccess: () => toast.success(t("recurring.archivedSuccess"), { description: item.label }),
                          onError: () => toast.error(t("recurring.errors.archiveFailed")),
                        }
                      )}
                    >
                      <Archive className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Realise dialog - pick account */}
      <Dialog
        open={realiseDialog != null}
        onOpenChange={(open) => {
          if (!open) {
            setRealiseDialog(null);
            setRealiseAccountId("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("recurring.realiseTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {realiseDialog != null && (
              <>
                <p className="text-sm text-muted-foreground">
                  {t("recurring.realiseDescription", { direction: t(`recurring.${realiseDialog.direction}`) })}{" "}
                  <strong>{realiseDialog.label}</strong> ({formatMoney(realiseDialog.amount.minorUnits, realiseDialog.amount.currency)})
                </p>
                <div className="space-y-2">
                  <Label htmlFor="realise-account">{t("recurring.account")}</Label>
                  <Select value={realiseAccountId} onValueChange={setRealiseAccountId}>
                    <SelectTrigger id="realise-account">
                      <SelectValue placeholder={t("recurring.accountPlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      {compatibleAccounts.length === 0 ? (
                        <SelectEmptyState>{t("recurring.noCompatibleAccount", { currency: realiseDialog.amount.currency })}</SelectEmptyState>
                      ) : (
                        compatibleAccounts.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name} ({formatMoney(a.balance.minorUnits, a.balance.currency)})
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={() => handleRealise(realiseDialog.categoryId)}
                  disabled={!realiseAccountId || realise.isPending}
                  className="w-full"
                >
                  {realise.isPending ? t("recurring.recording") : t("recurring.recordOccurrence")}
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
