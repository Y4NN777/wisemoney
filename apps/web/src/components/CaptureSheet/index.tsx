import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useRouter } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowRightLeft, ArrowUp, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog.tsx";
import { Input } from "../ui/input.tsx";
import { Label } from "../ui/label.tsx";
import { Button } from "../ui/button.tsx";
import { Select, SelectContent, SelectEmptyState, SelectItem, SelectTrigger, SelectValue } from "../ui/select.tsx";
import {
  useCreateAccount, useCurrencyContext, useDeleteTransaction, useFinancialState,
  useRecordGoalContribution, useRecordTransaction, useRecordTransfer, useTransactionsInRange,
} from "../../hooks/useFinancialState.ts";
import { convertUsingContext, DEFAULT_BASE_CURRENCY } from "../../domain/currencyStore.ts";
import { categoryDisplayName } from "../../lib/categoryName.ts";
import { formatMoney, parseMajorUnits } from "../../types/money.ts";
import { orderCategoriesForDirection, recentAccountIds, recentCategoryIds } from "../../domain/captureOrdering.ts";
import { recordCoachFormFault } from "../../coach/index.ts";

export type CaptureMode = "transaction" | "transfer" | "goal";
const CAPTURE_MODES: readonly CaptureMode[] = ["transaction", "transfer", "goal"];
const DIRECTIONS = ["income", "expense"] as const;
type Direction = (typeof DIRECTIONS)[number];

/**
 * Opens the capture sheet over the current screen by adding `capture` to the
 * URL search (replaced on close — the sheet is an overlay, not a destination).
 * The router's own history instance is used directly: search reducers are typed
 * against route-level search contracts the sheet (route-agnostic) cannot satisfy.
 */
export function useOpenCaptureSheet(): (mode: CaptureMode, direction?: Direction) => void {
  const router = useRouter();
  const history = router.history as { replace: (path: string) => void };
  return (mode, direction) => {
    const url = new URL(window.location.href);
    url.searchParams.set("capture", mode);
    if (direction != null) url.searchParams.set("direction", direction);
    history.replace(`${url.pathname}${url.search}`);
  };
}

function isCaptureMode(value: unknown): value is CaptureMode {
  return typeof value === "string" && (CAPTURE_MODES as readonly string[]).includes(value);
}

function isDirection(value: unknown): value is Direction {
  return typeof value === "string" && (DIRECTIONS as readonly string[]).includes(value);
}

function todayIsoDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Local-noon timestamp for a YYYY-MM-DD date input value (DST-safe). */
function isoDateToTimestamp(value: string): number {
  return new Date(`${value}T12:00:00`).getTime();
}

export default function CaptureSheet() {
  const { t } = useTranslation();
  const location = useLocation();
  const router = useRouter();
  const rawCapture = (location.search as Record<string, unknown>).capture;
  const rawDirection = (location.search as Record<string, unknown>).direction;
  const open = isCaptureMode(rawCapture);
  const mode: CaptureMode = open ? rawCapture : "transaction";
  const initialDirection: Direction = isDirection(rawDirection) ? rawDirection : "expense";

  const mutateSearch = (mutate: (params: URLSearchParams) => void) => {
    const url = new URL(window.location.href);
    mutate(url.searchParams);
    const history = router.history as { replace: (path: string) => void };
    history.replace(`${url.pathname}${url.search}`);
  };

  const closeSheet = () => {
    mutateSearch((params) => {
      params.delete("capture");
      params.delete("direction");
    });
  };

  const switchMode = (nextMode: CaptureMode) => {
    mutateSearch((params) => {
      params.set("capture", nextMode);
    });
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) closeSheet(); }}>
      {open && (
        <DialogContent
          className="inset-x-0 bottom-0 top-auto max-h-[92dvh] w-full translate-x-0 translate-y-0 rounded-t-2xl rounded-b-none border-b-0 p-4 pt-2 data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom sm:bottom-auto sm:left-[50%] sm:top-[50%] sm:w-[calc(100%-2rem)] sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:rounded-b-none sm:border-b sm:data-[state=closed]:slide-out-to-bottom-0 sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:slide-in-from-bottom-0 sm:data-[state=open]:zoom-in-95"
          aria-describedby={undefined}
        >
          {/* Visible title row: the close button lives here, clear of the tab list. */}
          <DialogHeader className="flex flex-row items-center pr-10 pb-2 pt-1">
            <DialogTitle className="text-sm font-semibold">{t("capture.heading")}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-1 rounded-md border border-border bg-muted p-1" role="tablist" aria-label={t("capture.ariaLabel")}>
            {CAPTURE_MODES.map((candidate) => (
              <button
                key={candidate}
                type="button"
                role="tab"
                aria-selected={mode === candidate}
                onClick={() => switchMode(candidate)}
                className={`min-h-10 rounded-sm px-2 text-sm font-medium transition-colors ${mode === candidate ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {t(`capture.tabs.${candidate}`)}
              </button>
            ))}
          </div>
          {mode === "transaction" && <TransactionForm direction={initialDirection} onDone={closeSheet} />}
          {mode === "transfer" && <TransferForm onDone={closeSheet} />}
          {mode === "goal" && <GoalForm onDone={closeSheet} />}
        </DialogContent>
      )}
    </Dialog>
  );
}

function useActiveAccounts() {
  const { data: snapshot } = useFinancialState();
  const accounts = useMemo(() => snapshot?.accounts.filter((account) => account.isActive) ?? [], [snapshot]);
  const categories = useMemo(() => snapshot?.categories ?? [], [snapshot]);
  return { snapshot, accounts, categories };
}

/** Categories ordered for the picker; recency is derived from the last 90 days. */
function useOrderedCategories(direction: Direction) {
  const { categories } = useActiveAccounts();
  const recentWindow = useMemo(
    () => ({ start: Date.now() - 90 * 24 * 60 * 60 * 1000, end: Date.now() }),
    [],
  );
  const recentTransactions = useTransactionsInRange(recentWindow.start, recentWindow.end);
  return useMemo(() => orderCategoriesForDirection(
    categories,
    direction,
    recentCategoryIds(recentTransactions.data ?? []),
  ), [categories, direction, recentTransactions.data]);
}

function useRecentAccountId(): string | null {
  const recentWindow = useMemo(
    () => ({ start: Date.now() - 90 * 24 * 60 * 60 * 1000, end: Date.now() }),
    [],
  );
  const recentTransactions = useTransactionsInRange(recentWindow.start, recentWindow.end);
  return useMemo(() => recentAccountIds(recentTransactions.data ?? [], 1)[0] ?? null, [recentTransactions.data]);
}

type TransactionFormProps = {
  direction: Direction;
  onDone: () => void;
};

function TransactionForm({ direction, onDone }: TransactionFormProps) {
  const { t } = useTranslation();
  const { accounts } = useActiveAccounts();
  const currencyContextQuery = useCurrencyContext();
  const recordTx = useRecordTransaction();
  const createAccountMutation = useCreateAccount();
  const deleteTx = useDeleteTransaction();
  const amountRef = useRef<HTMLInputElement | null>(null);

  const [selectedDirection, setSelectedDirection] = useState<Direction>(direction);
  const [amountStr, setAmountStr] = useState("");
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [note, setNote] = useState("");
  const [dateStr, setDateStr] = useState(todayIsoDate());
  const [error, setError] = useState<string | null>(null);
  const [creatingAccount, setCreatingAccount] = useState(false);

  const orderedCategories = useOrderedCategories(selectedDirection);
  const recentAccountId = useRecentAccountId();

  useEffect(() => {
    setSelectedDirection(direction);
    setAccountId(accounts.find((account) => account.id === recentAccountId)?.id ?? accounts[0]?.id ?? "");
    // Prefill only when the sheet mounts with new intent
  }, [direction, recentAccountId, accounts.length]);

  useEffect(() => {
    const timerId = window.setTimeout(() => amountRef.current?.focus(), 120);
    return () => window.clearTimeout(timerId);
  }, []);

  const baseCurrency = currencyContextQuery.data?.baseCurrency ?? DEFAULT_BASE_CURRENCY;
  const selectedAccount = accounts.find((account) => account.id === accountId);
  const currency = selectedAccount?.currency ?? baseCurrency;
  const amount = parseMajorUnits(amountStr, currency);
  const dateIsToday = dateStr === todayIsoDate();

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (amount == null || amount <= 0) {
      recordCoachFormFault("capture.transaction.amount", "transactions");
      setError(t("capture.transaction.errors.validAmount"));
      return;
    }
    if (categoryId === "") {
      recordCoachFormFault("capture.transaction.category", "transactions");
      setError(t("capture.transaction.errors.selectCategory"));
      return;
    }
    try {
      let resolvedAccountId = accountId;
      if (resolvedAccountId === "") {
        // Silent default account: the first movement never requires setup.
        setCreatingAccount(true);
        resolvedAccountId = await createAccountMutation.mutateAsync({
          name: t("captureSheet.cashName"),
          type: "cash",
          initialBalance: { minorUnits: 0, currency: baseCurrency },
        });
        setCreatingAccount(false);
      }
      const recordedEventId = await recordTx.mutateAsync({
        accountId: resolvedAccountId,
        categoryId,
        amount: { minorUnits: amount, currency },
        direction: selectedDirection,
        ...(note ? { note } : {}),
        ...(dateIsToday ? {} : { occurredAt: isoDateToTimestamp(dateStr) }),
      });
      toast.success(t(selectedDirection === "income" ? "capture.transaction.incomeRecorded" : "capture.transaction.expenseRecorded"), {
        action: {
          label: t("captureSheet.undo"),
          onClick: () => deleteTx.mutate({ originalEventId: recordedEventId }),
        },
      });
      setAmountStr("");
      setNote("");
      onDone();
    } catch {
      setCreatingAccount(false);
      recordCoachFormFault("capture.transaction.save", "transactions");
      const message = t("capture.transaction.errors.failed");
      setError(message);
      toast.error(message);
    }
  };

  return (
    <form onSubmit={(event) => { void handleSubmit(event); }} className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant={selectedDirection === "expense" ? "default" : "outline"} className="w-full" onClick={() => setSelectedDirection("expense")}>
          <ArrowUp className="mr-1 h-4 w-4" />
          {t("capture.transaction.expense")}
        </Button>
        <Button type="button" variant={selectedDirection === "income" ? "default" : "outline"} className="w-full" onClick={() => setSelectedDirection("income")}>
          <ArrowDown className="mr-1 h-4 w-4" />
          {t("capture.transaction.income")}
        </Button>
      </div>

      <div className="space-y-2">
        <Label htmlFor="capture-sheet-amount">{t("capture.transaction.amount")}</Label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{currency}</span>
          <Input
            id="capture-sheet-amount"
            ref={amountRef}
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={amountStr}
            onChange={(event) => setAmountStr(event.target.value)}
            className="h-14 pl-14 text-xl tabular-nums"
            required
          />
        </div>
      </div>

      {accounts.length > 1 && (
        <div className="space-y-2">
          <Label htmlFor="capture-sheet-account">{t("capture.transaction.account")}</Label>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger id="capture-sheet-account"><SelectValue placeholder={t("capture.transaction.selectAccount")} /></SelectTrigger>
            <SelectContent>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="capture-sheet-category">{t("capture.transaction.category")}</Label>
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger id="capture-sheet-category"><SelectValue placeholder={t("capture.transaction.selectCategory")} /></SelectTrigger>
          <SelectContent>
            {orderedCategories.length === 0 ? (
              <SelectEmptyState>{t("capture.empty.categoriesManage")}</SelectEmptyState>
            ) : (
              orderedCategories.map((category) => (
                <SelectItem key={category.id} value={category.id}>{categoryDisplayName(category, t)}</SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="capture-sheet-date">{t("captureSheet.date")}</Label>
          <Input
            id="capture-sheet-date"
            type="date"
            value={dateStr}
            max={todayIsoDate()}
            onChange={(event) => setDateStr(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="capture-sheet-note">{t("capture.transaction.note")}</Label>
          <Input
            id="capture-sheet-note"
            type="text"
            placeholder={t("capture.transaction.notePlaceholder")}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
      </div>

      {error != null && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={recordTx.isPending || creatingAccount} className="min-h-12 w-full">
        {recordTx.isPending || creatingAccount ? t("capture.transaction.submitting") : t("captureSheet.add")}
      </Button>
    </form>
  );
}

function TransferForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const { accounts, categories } = useActiveAccounts();
  const currencyContextQuery = useCurrencyContext();
  const recordTx = useRecordTransaction();
  const recordTransfer = useRecordTransfer();
  const createAccountMutation = useCreateAccount();
  const amountRef = useRef<HTMLInputElement | null>(null);

  const [fromAccountId, setFromAccountId] = useState("");
  const [destinationType, setDestinationType] = useState<"internal" | "external">("internal");
  const [toAccountId, setToAccountId] = useState("");
  const [externalDestination, setExternalDestination] = useState("");
  const [transferCategoryId, setTransferCategoryId] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creatingAccount, setCreatingAccount] = useState(false);

  useEffect(() => {
    const timerId = window.setTimeout(() => amountRef.current?.focus(), 120);
    return () => window.clearTimeout(timerId);
  }, []);

  const baseCurrency = currencyContextQuery.data?.baseCurrency ?? DEFAULT_BASE_CURRENCY;
  const sourceAccount = accounts.find((account) => account.id === fromAccountId);
  const targetAccount = accounts.find((account) => account.id === toAccountId);
  const currency = sourceAccount?.currency ?? baseCurrency;
  const minorUnits = parseMajorUnits(amountStr, currency);
  const transferPreview = destinationType === "internal" && sourceAccount != null && targetAccount != null && minorUnits != null && minorUnits > 0
    ? convertUsingContext(
        { minorUnits, currency: sourceAccount.currency },
        targetAccount.currency,
        currencyContextQuery.data ?? { rates: new Map() },
      )
    : null;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (accounts.length === 0 && destinationType === "internal") {
      setError(t("captureSheet.transferNeedsAccounts"));
      return;
    }
    if (fromAccountId === "" && destinationType === "external") {
      // Silent default account also serves outbound external payments.
      try {
        setCreatingAccount(true);
        const createdId = await createAccountMutation.mutateAsync({
          name: t("captureSheet.cashName"),
          type: "cash",
          initialBalance: { minorUnits: 0, currency: baseCurrency },
        });
        setCreatingAccount(false);
        setFromAccountId(createdId);
      } catch {
        setCreatingAccount(false);
        setError(t("capture.transfer.errors.internalFailed"));
        return;
      }
    }
    const resolvedSourceId = fromAccountId !== "" ? fromAccountId : accounts[0]?.id ?? "";
    const resolvedSource = accounts.find((account) => account.id === resolvedSourceId);
    const resolvedCurrency = resolvedSource?.currency ?? baseCurrency;
    const resolvedAmount = parseMajorUnits(amountStr, resolvedCurrency);
    if (resolvedAmount == null || resolvedAmount <= 0) {
      recordCoachFormFault("capture.transfer.amount", "virements");
      setError(t("capture.transfer.errors.validAmount"));
      return;
    }
    if (destinationType === "internal" && toAccountId === "") {
      recordCoachFormFault("capture.transfer.destination", "virements");
      setError(t("capture.transfer.errors.selectInternalDestination"));
      return;
    }
    if (destinationType === "external" && externalDestination.trim() === "") {
      recordCoachFormFault("capture.transfer.destination", "virements");
      setError(t("capture.transfer.errors.enterExternalDestination"));
      return;
    }
    if (destinationType === "external" && transferCategoryId === "") {
      recordCoachFormFault("capture.transfer.category", "virements");
      setError(t("capture.transfer.errors.selectCategory"));
      return;
    }
    const money = { minorUnits: resolvedAmount, currency: resolvedCurrency };
    try {
      if (destinationType === "internal") {
        if (resolvedSource != null && targetAccount != null && resolvedSource.currency !== targetAccount.currency && transferPreview == null) {
          setError(t("capture.transfer.errors.missingRate", { from: resolvedSource.currency, to: targetAccount.currency }));
          return;
        }
        await recordTransfer.mutateAsync({
          fromAccountId: resolvedSourceId,
          toAccountId,
          amount: money,
          ...(note ? { note } : {}),
        });
        toast.success(t("capture.transfer.internalRecorded"));
      } else {
        await recordTx.mutateAsync({
          accountId: resolvedSourceId,
          categoryId: transferCategoryId,
          amount: money,
          direction: "expense",
          merchant: externalDestination.trim(),
          ...(note ? { note } : {}),
        });
        toast.success(t("capture.transfer.externalRecorded"));
      }
      setAmountStr("");
      setNote("");
      setExternalDestination("");
      setTransferCategoryId("");
      onDone();
    } catch {
      recordCoachFormFault("capture.transfer.save", "virements");
      const message = t(destinationType === "internal" ? "capture.transfer.errors.internalFailed" : "capture.transfer.errors.externalFailed");
      setError(message);
      toast.error(message);
    }
  };

  const otherAccounts = accounts.filter((account) => account.id !== fromAccountId);
  const showCrossCurrencyHint = destinationType === "internal" && sourceAccount != null && targetAccount != null && sourceAccount.currency !== targetAccount.currency && minorUnits != null && minorUnits > 0;
  const transferRate = sourceAccount != null && targetAccount != null
    ? currencyContextQuery.data?.rates.get(`${sourceAccount.currency}/${targetAccount.currency}`)
      ?? currencyContextQuery.data?.rates.get(`${targetAccount.currency}/${sourceAccount.currency}`)
      ?? null
    : null;

  return (
    <form onSubmit={(event) => { void handleSubmit(event); }} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="capture-sheet-transfer-from">{t("capture.transfer.from")}</Label>
        <Select value={fromAccountId} onValueChange={(value) => { setFromAccountId(value); if (value === toAccountId) setToAccountId(""); }}>
          <SelectTrigger id="capture-sheet-transfer-from"><SelectValue placeholder={t("capture.transfer.fromPlaceholder")} /></SelectTrigger>
          <SelectContent>
            {accounts.length === 0 ? (
              <SelectEmptyState>{t("captureSheet.transferNeedsAccounts")}</SelectEmptyState>
            ) : (
              accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2" role="group" aria-label={t("capture.transfer.destinationType")}>
        <Label>{t("capture.transfer.destinationType")}</Label>
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant={destinationType === "internal" ? "default" : "outline"} className="h-auto min-h-12 justify-start whitespace-normal px-3 py-2 text-left" onClick={() => { setDestinationType("internal"); setExternalDestination(""); setTransferCategoryId(""); }}>
            <ArrowRightLeft className="mr-2 h-4 w-4 shrink-0" />
            {t("capture.transfer.internalDestination")}
          </Button>
          <Button type="button" variant={destinationType === "external" ? "default" : "outline"} className="h-auto min-h-12 justify-start whitespace-normal px-3 py-2 text-left" onClick={() => { setDestinationType("external"); setToAccountId(""); }}>
            <ShoppingBag className="mr-2 h-4 w-4 shrink-0" />
            {t("capture.transfer.externalDestination")}
          </Button>
        </div>
      </div>

      {destinationType === "internal" ? (
        <div className="space-y-2">
          <Label htmlFor="capture-sheet-transfer-to">{t("capture.transfer.to")}</Label>
          <Select value={toAccountId} onValueChange={setToAccountId}>
            <SelectTrigger id="capture-sheet-transfer-to"><SelectValue placeholder={t("capture.transfer.toPlaceholder")} /></SelectTrigger>
            <SelectContent>
              {otherAccounts.length === 0 ? (
                <SelectEmptyState>{t("capture.empty.noOtherAccounts")}</SelectEmptyState>
              ) : (
                otherAccounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>{account.name} · {account.currency}</SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <Label htmlFor="capture-sheet-transfer-external">{t("capture.transfer.external")}</Label>
            <Input id="capture-sheet-transfer-external" type="text" placeholder={t("capture.transfer.externalPlaceholder")} value={externalDestination} onChange={(event) => setExternalDestination(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="capture-sheet-transfer-category">{t("capture.transfer.category")}</Label>
            <Select value={transferCategoryId} onValueChange={setTransferCategoryId}>
              <SelectTrigger id="capture-sheet-transfer-category"><SelectValue placeholder={t("capture.transaction.selectCategory")} /></SelectTrigger>
              <SelectContent>
                {categories.filter((category) => !category.isArchived).length === 0 ? (
                  <SelectEmptyState>{t("capture.empty.categoriesManage")}</SelectEmptyState>
                ) : categories.filter((category) => !category.isArchived).map((category) => (
                  <SelectItem key={category.id} value={category.id}>{categoryDisplayName(category, t)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      )}

      <div className="space-y-2">
        <Label htmlFor="capture-sheet-transfer-amount">{t("capture.transfer.amount")}</Label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{currency}</span>
          <Input
            id="capture-sheet-transfer-amount"
            ref={amountRef}
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={amountStr}
            onChange={(event) => setAmountStr(event.target.value)}
            className="h-14 pl-14 text-xl tabular-nums"
            required
          />
        </div>
      </div>

      {showCrossCurrencyHint && (
        transferPreview != null ? (
          <div className="border-l-2 border-ocean-primary bg-ocean-wash/45 px-3 py-2 text-sm">
            <p className="font-medium text-foreground">{t("capture.transfer.destinationReceives", { amount: formatMoney(transferPreview) })}</p>
            {transferRate != null && <p className="mt-1 text-xs text-muted-foreground">{t("capture.transfer.rateUsed", { base: transferRate.baseCurrency, rate: transferRate.rate, quote: transferRate.quoteCurrency })}</p>}
            <p className="mt-1 text-xs text-muted-foreground">{t("capture.transfer.conversionSaved")}</p>
          </div>
        ) : !currencyContextQuery.isLoading ? (
          <div className="rounded-lg border border-border bg-accent/45 p-3 text-sm">
            <p className="font-medium text-foreground">{t("capture.transfer.errors.missingRate", { from: sourceAccount?.currency, to: targetAccount?.currency })}</p>
            <Button asChild type="button" variant="link" className="mt-1 h-auto p-0 text-ocean-primary">
              <Link to="/settings">{t("capture.transfer.addRate")}</Link>
            </Button>
          </div>
        ) : null
      )}

      <div className="space-y-2">
        <Label htmlFor="capture-sheet-transfer-note">{t("capture.transfer.note")}</Label>
        <Input id="capture-sheet-transfer-note" type="text" placeholder={t("capture.transfer.notePlaceholder")} value={note} onChange={(event) => setNote(event.target.value)} />
      </div>

      {error != null && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={recordTransfer.isPending || recordTx.isPending || creatingAccount} className="min-h-12 w-full">
        {recordTransfer.isPending || recordTx.isPending || creatingAccount
          ? t("capture.transfer.submitting")
          : t(destinationType === "internal" ? "capture.transfer.submitInternal" : "capture.transfer.submitExternal")}
      </Button>
    </form>
  );
}

function GoalForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const { snapshot } = useActiveAccounts();
  const recordGoalContribMutation = useRecordGoalContribution();
  const amountRef = useRef<HTMLInputElement | null>(null);
  const activeGoals = useMemo(() => snapshot?.goals.filter((goal) => !goal.isArchived) ?? [], [snapshot]);

  const [goalId, setGoalId] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timerId = window.setTimeout(() => amountRef.current?.focus(), 120);
    return () => window.clearTimeout(timerId);
  }, []);

  const baseCurrency = snapshot?.baseCurrency ?? "";
  const goalCurrency = activeGoals.find((goal) => goal.id === goalId)?.targetAmount.currency ?? baseCurrency;
  const amount = parseMajorUnits(amountStr, goalCurrency);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (goalId === "") {
      recordCoachFormFault("capture.goal.selection", "objectifs");
      setError(t("capture.goal.errors.selectGoal"));
      return;
    }
    if (amount == null || amount <= 0) {
      recordCoachFormFault("capture.goal.amount", "objectifs");
      setError(t("capture.goal.errors.validAmount"));
      return;
    }
    try {
      await recordGoalContribMutation.mutateAsync({ goalId, amount: { minorUnits: amount, currency: goalCurrency } });
      toast.success(t("capture.goal.recorded"));
      setAmountStr("");
      onDone();
    } catch {
      recordCoachFormFault("capture.goal.save", "objectifs");
      const message = t("capture.goal.errors.failed");
      setError(message);
      toast.error(message);
    }
  };

  return (
    <form onSubmit={(event) => { void handleSubmit(event); }} className="space-y-4">
      {activeGoals.length === 0 ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{t("captureSheet.goalsEmpty")}</p>
          <Button asChild type="button" variant="outline" className="w-full">
            <Link to="/planning">{t("captureSheet.openPlanning")}</Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <Label htmlFor="capture-sheet-goal">{t("capture.tabs.goal")}</Label>
            <Select value={goalId} onValueChange={setGoalId}>
              <SelectTrigger id="capture-sheet-goal"><SelectValue placeholder={t("capture.goal.selectGoal")} /></SelectTrigger>
              <SelectContent>
                {activeGoals.map((goal) => (
                  <SelectItem key={goal.id} value={goal.id}>{goal.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="capture-sheet-goal-amount">{t("capture.goal.amount")}</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{goalCurrency}</span>
              <Input
                id="capture-sheet-goal-amount"
                ref={amountRef}
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={amountStr}
                onChange={(event) => setAmountStr(event.target.value)}
                className="h-14 pl-14 text-xl tabular-nums"
                required
              />
            </div>
          </div>
          {error != null && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={recordGoalContribMutation.isPending} className="min-h-12 w-full">
            {recordGoalContribMutation.isPending ? t("capture.goal.submitting") : t("capture.goal.submit")}
          </Button>
        </>
      )}
    </form>
  );
}
