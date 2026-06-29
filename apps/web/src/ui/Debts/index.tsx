import { useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Bell, CheckCircle2, Clock3, HandCoins, Plus, RefreshCw } from "lucide-react";
import { useCreateDebtCredit, useFinancialState, useUpdateDebtCreditStatus } from "../../hooks/useFinancialState.ts";
import type { DebtCreditKind, DebtCreditState, DebtCreditStatus } from "../../domain/financialState.ts";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Badge } from "../../components/ui/badge.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../../components/ui/dialog.tsx";
import { Input } from "../../components/ui/input.tsx";
import { Label } from "../../components/ui/label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select.tsx";
import { Skeleton } from "../../components/ui/skeleton.tsx";

const STATUS_BADGE_CLASS: Record<DebtCreditStatus, string> = {
  pending: "border-amber bg-amber-wash text-amber",
  partial: "border-ocean-primary bg-ocean-wash text-ocean-dark",
  settled: "border-sage bg-sage-wash text-sage",
};

function formatMoney(minorUnits: number, currency: string): string {
  const symbol: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", JPY: "¥" };
  const sym = symbol[currency] ?? currency + " ";
  const abs = Math.abs(minorUnits);
  return `${minorUnits < 0 ? "-" : ""}${sym}${Math.floor(abs / 100).toLocaleString()}.${(abs % 100).toString().padStart(2, "0")}`;
}

function todayInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

function toDateInputTimestamp(value: string): number {
  return new Date(`${value}T12:00:00`).getTime();
}

function displayDate(timestamp: number, language: string): string {
  return new Date(timestamp).toLocaleDateString(language);
}

function statusIcon(status: DebtCreditStatus) {
  if (status === "settled") return <CheckCircle2 className="h-4 w-4 text-sage" />;
  if (status === "partial") return <RefreshCw className="h-4 w-4 text-ocean-primary" />;
  return <Clock3 className="h-4 w-4 text-amber" />;
}

function totalFor(items: DebtCreditState[]): number {
  return items.reduce((sum, item) => item.status === "settled" ? sum : sum + item.amount.minorUnits, 0);
}

type DebtCreditColumnProps = {
  title: string;
  emptyText: string;
  partyLabel: string;
  motiveLabel: string;
  amountLabel: string;
  dateLabel: string;
  statusAriaLabel: string;
  statusLabels: Record<DebtCreditStatus, string>;
  items: DebtCreditState[];
  onStatusChange: (id: string, status: DebtCreditStatus, label: string) => void;
  updating: boolean;
};

function DebtCreditColumn({
  title,
  emptyText,
  partyLabel,
  motiveLabel,
  amountLabel,
  dateLabel,
  statusAriaLabel,
  statusLabels,
  items,
  onStatusChange,
  updating,
}: DebtCreditColumnProps) {
  const { i18n } = useTranslation();

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
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

export default function Debts() {
  const { t } = useTranslation();
  const { data: snapshot, isLoading } = useFinancialState();
  const createDebtCredit = useCreateDebtCredit();
  const updateStatus = useUpdateDebtCreditStatus();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [kind, setKind] = useState<DebtCreditKind>("receivable");
  const [partyName, setPartyName] = useState("");
  const [motive, setMotive] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [dateValue, setDateValue] = useState(todayInputValue());
  const [status, setStatus] = useState<DebtCreditStatus>("pending");
  const [createError, setCreateError] = useState<string | null>(null);

  const debtCredits = useMemo(
    () => [...(snapshot?.debtCredits ?? [])].sort((a, b) => b.date - a.date),
    [snapshot?.debtCredits],
  );
  const receivables = debtCredits.filter((item) => item.kind === "receivable");
  const debts = debtCredits.filter((item) => item.kind === "debt");
  const unsettledReceivables = receivables.filter((item) => item.status !== "settled");

  const currency = debtCredits[0]?.amount.currency ?? snapshot?.accounts[0]?.currency ?? "USD";
  const receivableTotal = totalFor(receivables);
  const debtTotal = totalFor(debts);
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
    setStatus("pending");
    setCreateError(null);
  };

  const handleCreate = (event: FormEvent) => {
    event.preventDefault();
    setCreateError(null);

    const amount = Number.parseFloat(amountStr);
    if (!partyName.trim()) {
      setCreateError(kind === "debt" ? t("debts.errors.creditorRequired") : t("debts.errors.debtorRequired"));
      return;
    }
    if (!motive.trim()) {
      setCreateError(t("debts.errors.motiveRequired"));
      return;
    }
    if (Number.isNaN(amount) || amount <= 0) {
      setCreateError(t("debts.errors.invalidAmount"));
      return;
    }

    const label = partyName.trim();
    createDebtCredit.mutate(
      {
        kind,
        partyName: label,
        motive: motive.trim(),
        amount: { minorUnits: Math.round(amount * 100), currency },
        date: toDateInputTimestamp(dateValue),
        status,
      },
      {
        onSuccess: () => {
          setDialogOpen(false);
          resetForm();
          toast.success(kind === "debt" ? t("debts.toasts.debtCreated") : t("debts.toasts.receivableCreated"), { description: label });
        },
        onError: (err) => {
          const message = err instanceof Error ? err.message : t("debts.errors.createFailed");
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
        onError: (err) => {
          const message = err instanceof Error ? err.message : t("debts.errors.statusUpdateFailed");
          toast.error(message);
        },
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
          <p className="page-kicker">{t("debts.kicker")}</p>
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
                    min="0.01"
                    step="0.01"
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
            <p className="text-2xl font-semibold">{formatMoney(receivableTotal, currency)}</p>
          </CardContent>
        </Card>
        <Card className="metric-surface">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t("debts.metrics.unsettledDebts")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{formatMoney(debtTotal, currency)}</p>
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
          statusAriaLabel={t("debts.statusAria")}
          statusLabels={statusLabels}
          items={receivables}
          onStatusChange={handleStatusChange}
          updating={updateStatus.isPending}
        />
        <DebtCreditColumn
          title={t("debts.sections.debts")}
          emptyText={t("debts.empty.debts")}
          partyLabel={t("debts.fields.creditorName")}
          motiveLabel={t("debts.fields.motive")}
          amountLabel={t("debts.fields.amountShort")}
          dateLabel={t("debts.fields.date")}
          statusAriaLabel={t("debts.statusAria")}
          statusLabels={statusLabels}
          items={debts}
          onStatusChange={handleStatusChange}
          updating={updateStatus.isPending}
        />
      </div>
    </main>
  );
}
