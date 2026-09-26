import { useState, type FormEvent } from "react";
import { Check, ChevronRight, Landmark, ListChecks, Map as MapIcon, PlusCircle, Target, Wallet } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../components/ui/button.tsx";
import { Input } from "../components/ui/input.tsx";
import { Label } from "../components/ui/label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select.tsx";
import { useOpenCaptureSheet } from "../components/CaptureSheet/index.tsx";
import type { FinancialStateSnapshot } from "../domain/financialState.ts";
import { categoryDisplayName } from "../lib/categoryName.ts";
import { formatMoney, parseMajorUnits } from "../types/money.ts";
import { useCreateAccount, useCreateBudget, useCreateGoal, useUpdateAccount } from "../hooks/useFinancialState.ts";
import { AccountCurrencyPicker } from "../ui/Capture/ManagementSections.tsx";
import { useChangeStartingCurrency, useSaveFirstSession } from "./hooks.ts";
import { FIRST_SESSION_STEPS, isAccountsStepDone, isPlanStepDone, type FirstSessionState, type FirstSessionStep } from "./firstSession.ts";

const ACCOUNT_TYPES = ["cash", "mobile_money", "checking", "savings", "credit", "investment"] as const;

/**
 * Home until the first session is done: one step at a time, each step is the real action, and a
 * step only unlocks "Continue" once the data shows it happened (TickTick pattern, track 1).
 */
export default function FirstSessionFlow({
  snapshot,
  hasMovement,
  state,
  derivedStep,
  defaultAccountNames,
  cursor,
  onCursorChange,
}: {
  snapshot: FinancialStateSnapshot;
  hasMovement: boolean;
  state: FirstSessionState | null;
  derivedStep: Exclude<FirstSessionStep, "done">;
  defaultAccountNames: readonly string[];
  /** Owned by the parent (which never unmounts) so a data refetch cannot reset the step in view. */
  cursor: Exclude<FirstSessionStep, "done">;
  onCursorChange: (step: Exclude<FirstSessionStep, "done">) => void;
}) {
  const { t } = useTranslation();
  const save = useSaveFirstSession();
  // The cursor lags the derived step so a finished step shows its tick and a Continue button
  // instead of jumping away the instant the data changes.
  const setCursor = onCursorChange;
  const index = FIRST_SESSION_STEPS.indexOf(cursor);
  const derivedIndex = FIRST_SESSION_STEPS.indexOf(derivedStep);
  const stepDone = derivedIndex > index;
  const persist = (patch: Partial<FirstSessionState>) => save.mutate({ completed: false, planLater: false, ...(state ?? {}), ...patch });
  const advance = () => setCursor(FIRST_SESSION_STEPS[Math.min(index + 1, FIRST_SESSION_STEPS.length - 1)]!);

  return (
    <main aria-label={t("firstSession.aria")} className="app-page max-w-2xl">
      <ol aria-label={t("firstSession.progressAria")} className="flex items-center gap-2">
        {FIRST_SESSION_STEPS.map((step, i) => {
          const done = i < derivedIndex || (i === index && stepDone);
          const current = i === index;
          return (
            <li key={step} className="flex flex-1 items-center gap-2" aria-current={current ? "step" : undefined}>
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${done ? "bg-positive text-white" : current ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"}`}>
                {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className={`hidden truncate text-xs sm:block ${current ? "font-semibold" : "text-muted-foreground"}`}>{t(`firstSession.${step}.label`)}</span>
            </li>
          );
        })}
      </ol>

      <section className="rounded-lg border border-border bg-card p-4 sm:p-6">
        <h1 className="text-lg font-semibold sm:text-xl">{t(`firstSession.${cursor}.title`)}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t(`firstSession.${cursor}.body`)}</p>
        <div className="mt-5">
          {cursor === "accounts" && <AccountsStep snapshot={snapshot} hasMovement={hasMovement} done={isAccountsStepDone(snapshot, defaultAccountNames)} />}
          {cursor === "movement" && <MovementStep done={hasMovement} />}
          {cursor === "plan" && <PlanStep snapshot={snapshot} done={isPlanStepDone(snapshot) || state?.planLater === true} onLater={() => persist({ planLater: true })} />}
          {cursor === "tour" && <TourStep />}
        </div>
        <div className="mt-6 flex justify-end">
          {cursor === "tour" ? (
            <Button type="button" onClick={() => persist({ completed: true })} disabled={save.isPending}>
              {t("firstSession.finish")}
              <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button type="button" onClick={advance} disabled={!stepDone}>
              {t("firstSession.continue")}
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </section>
    </main>
  );
}

function AccountsStep({ snapshot, hasMovement, done }: { snapshot: FinancialStateSnapshot; hasMovement: boolean; done: boolean }) {
  const { t } = useTranslation();
  const changeCurrency = useChangeStartingCurrency();
  const updateAccount = useUpdateAccount();
  const createAccount = useCreateAccount();
  const accounts = snapshot.accounts.filter((account) => account.isActive);
  const [names, setNames] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<string>("mobile_money");
  const [balance, setBalance] = useState("");
  const [error, setError] = useState<string | null>(null);

  const rename = (accountId: string, current: string, accountType: string) => {
    const next = (names[accountId] ?? current).trim();
    if (next === "" || next === current) return;
    updateAccount.mutate({ accountId, name: next, type: accountType });
  };
  const add = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const minorUnits = balance.trim() === "" ? 0 : parseMajorUnits(balance, snapshot.baseCurrency);
    if (name.trim() === "" || minorUnits == null || minorUnits < 0) {
      setError(t("firstSession.accounts.invalid"));
      return;
    }
    createAccount.mutate({ name: name.trim(), type, initialBalance: { minorUnits, currency: snapshot.baseCurrency } }, {
      onSuccess: () => { setAdding(false); setName(""); setBalance(""); },
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="accCurrency">{t("firstSession.accounts.currencyLabel")}</Label>
        <AccountCurrencyPicker value={snapshot.baseCurrency} onChange={(currency) => changeCurrency.mutate({ currency, snapshot, hasMovement })} />
        <p className="text-xs text-muted-foreground">{t("firstSession.accounts.currencyHint")}</p>
      </div>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {accounts.map((account) => (
          <li key={account.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
            <Wallet className="hidden h-4 w-4 shrink-0 text-ocean-primary sm:block" />
            <Label htmlFor={`first-session-account-${account.id}`} className="sr-only">{t("firstSession.accounts.nameLabel", { name: account.name })}</Label>
            <Input
              id={`first-session-account-${account.id}`}
              value={names[account.id] ?? account.name}
              onChange={(event) => setNames((value) => ({ ...value, [account.id]: event.target.value }))}
              onBlur={() => rename(account.id, account.name, account.type)}
              className="sm:max-w-xs"
            />
            <span className="text-xs text-muted-foreground sm:ml-auto">{t(`capture.manage.accountTypes.${account.type}`)} · {formatMoney(account.balance)}</span>
            <Button type="button" size="sm" variant="outline" onClick={() => rename(account.id, account.name, account.type)} disabled={(names[account.id] ?? account.name).trim() === account.name}>
              {t("firstSession.accounts.save")}
            </Button>
          </li>
        ))}
      </ul>
      {adding ? (
        <form onSubmit={add} className="space-y-3 rounded-lg border border-dashed border-border p-3">
          {error != null && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="space-y-2">
            <Label htmlFor="first-session-new-name">{t("capture.manage.accountName")}</Label>
            <Input id="first-session-new-name" value={name} onChange={(event) => setName(event.target.value)} required autoFocus />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="first-session-new-type">{t("capture.manage.accountType")}</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger id="first-session-new-type"><SelectValue /></SelectTrigger>
                <SelectContent>{ACCOUNT_TYPES.map((candidate) => <SelectItem key={candidate} value={candidate}>{t(`capture.manage.accountTypes.${candidate}`)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="first-session-new-balance">{t("capture.manage.accountBalance")}</Label>
              <Input id="first-session-new-balance" inputMode="decimal" value={balance} onChange={(event) => setBalance(event.target.value)} placeholder="0" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(false)}>{t("common.cancel")}</Button>
            <Button type="submit" size="sm" disabled={createAccount.isPending}>{t("firstSession.accounts.add")}</Button>
          </div>
        </form>
      ) : (
        <Button type="button" variant="outline" onClick={() => setAdding(true)}>
          <PlusCircle className="h-4 w-4" />
          {t("firstSession.accounts.addAnother")}
        </Button>
      )}
      {done && <p className="flex items-center gap-2 text-sm text-positive"><Check className="h-4 w-4" />{t("firstSession.accounts.done")}</p>}
    </div>
  );
}

function MovementStep({ done }: { done: boolean }) {
  const { t } = useTranslation();
  const openCapture = useOpenCaptureSheet();
  return (
    <div className="space-y-4">
      <Button type="button" size="lg" className="w-full justify-between sm:w-auto" onClick={() => openCapture("transaction")}>
        {t("firstSession.movement.record")}
        <PlusCircle className="h-4 w-4" />
      </Button>
      {done && <p className="flex items-center gap-2 text-sm text-positive"><Check className="h-4 w-4" />{t("firstSession.movement.done")}</p>}
    </div>
  );
}

function PlanStep({ snapshot, done, onLater }: { snapshot: FinancialStateSnapshot; done: boolean; onLater: () => void }) {
  const { t } = useTranslation();
  const createBudget = useCreateBudget();
  const createGoal = useCreateGoal();
  const [kind, setKind] = useState<"budget" | "goal" | null>(null);
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const categories = snapshot.categories.filter((category) => !category.isArchived);
  const currency = snapshot.baseCurrency;
  const now = new Date();
  const periodMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const minorUnits = parseMajorUnits(amount, currency);
    if (name.trim() === "" || minorUnits == null || minorUnits <= 0 || (kind === "budget" && categoryId === "")) {
      setError(t("firstSession.plan.invalid"));
      return;
    }
    if (kind === "budget") createBudget.mutate({ name: name.trim(), categoryId, limit: { minorUnits, currency }, periodMonth });
    else createGoal.mutate({ name: name.trim(), targetAmount: { minorUnits, currency } });
  };

  if (done) {
    return <p className="flex items-center gap-2 text-sm text-positive"><Check className="h-4 w-4" />{t("firstSession.plan.done")}</p>;
  }
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2">
        <Button type="button" variant={kind === "budget" ? "default" : "outline"} className="justify-start" onClick={() => setKind("budget")}>
          <Landmark className="h-4 w-4" />{t("firstSession.plan.budget")}
        </Button>
        <Button type="button" variant={kind === "goal" ? "default" : "outline"} className="justify-start" onClick={() => setKind("goal")}>
          <Target className="h-4 w-4" />{t("firstSession.plan.goal")}
        </Button>
      </div>
      {kind != null && (
        <form onSubmit={submit} className="space-y-3 rounded-lg border border-dashed border-border p-3">
          {error != null && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="space-y-2">
            <Label htmlFor="first-session-plan-name">{t(kind === "budget" ? "budgets.name" : "goals.name")}</Label>
            <Input id="first-session-plan-name" value={name} onChange={(event) => setName(event.target.value)} required autoFocus />
          </div>
          {kind === "budget" && (
            <div className="space-y-2">
              <Label htmlFor="first-session-plan-category">{t("budgets.category")}</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger id="first-session-plan-category"><SelectValue placeholder={t("capture.transaction.categoryPlaceholder", { defaultValue: "" })} /></SelectTrigger>
                <SelectContent>{categories.map((category) => <SelectItem key={category.id} value={category.id}>{categoryDisplayName(category, t)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="first-session-plan-amount">{t(kind === "budget" ? "budgets.monthlyLimit" : "goals.targetAmount", { currency })}</Label>
            <Input id="first-session-plan-amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} required />
          </div>
          <Button type="submit" size="sm" disabled={createBudget.isPending || createGoal.isPending}>{t("firstSession.plan.save")}</Button>
        </form>
      )}
      <Button type="button" variant="ghost" size="sm" onClick={onLater}>{t("firstSession.plan.later")}</Button>
    </div>
  );
}

function TourStep() {
  const { t } = useTranslation();
  const items = [
    { icon: <ListChecks className="h-4 w-4" />, key: "home" },
    { icon: <MapIcon className="h-4 w-4" />, key: "activity" },
    { icon: <Target className="h-4 w-4" />, key: "plan" },
    { icon: <PlusCircle className="h-4 w-4" />, key: "capture" },
  ] as const;
  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {items.map((item) => (
        <li key={item.key} className="flex items-start gap-3 p-3">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-ocean-wash text-ocean-primary">{item.icon}</span>
          <span>
            <span className="block text-sm font-semibold">{t(`firstSession.tour.${item.key}.title`)}</span>
            <span className="block text-xs text-muted-foreground">{t(`firstSession.tour.${item.key}.body`)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
