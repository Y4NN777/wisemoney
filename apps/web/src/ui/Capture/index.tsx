import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useFinancialState, useRecordTransaction, useRecordGoalContribution, useRecordTransfer } from "../../hooks/useFinancialState.ts";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card.tsx";
import { Input } from "../../components/ui/input.tsx";
import { Label } from "../../components/ui/label.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Select, SelectContent, SelectEmptyState, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs.tsx";
import { Skeleton } from "../../components/ui/skeleton.tsx";
import { Plus, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import { categoryDisplayName } from "../../lib/categoryName.ts";
import { parseMajorUnits } from "../../types/money.ts";
import { parseCaptureSearch, Route, type CaptureTab, type ManageSection } from "../../routes/capture.tsx";
import { ManagementSections } from "./ManagementSections.tsx";
import { recordCoachFormFault } from "../../coach/index.ts";

function AccountRequired({ onManage }: { onManage: () => void }) {
  const { t } = useTranslation();
  return (
    <Card className="max-w-[720px] border-ocean-primary/25">
      <CardContent className="flex flex-col items-start gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-base">{t("capture.prerequisite.accountTitle")}</CardTitle>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">{t("capture.prerequisite.accountBody")}</p>
        </div>
        <Button type="button" className="shrink-0" onClick={onManage}>
          <Plus className="mr-1 h-4 w-4" />
          {t("capture.prerequisite.createAccount")}
        </Button>
      </CardContent>
    </Card>
  );
}
export default function Capture() {
  const { t } = useTranslation();
  const rawSearch: unknown = Route.useSearch();
  const parsedSearch = parseCaptureSearch(
    typeof rawSearch === "object" && rawSearch != null ? rawSearch as Record<string, unknown> : {},
  );
  const tab: CaptureTab = parsedSearch.tab ?? "transaction";
  const manageSection: ManageSection = parsedSearch.section ?? "accounts";
  const navigate = Route.useNavigate();
  const { data: snapshot, isLoading } = useFinancialState();
  const recordTx = useRecordTransaction();
  const recordGoalContrib = useRecordGoalContribution();
  const recordTransfer = useRecordTransfer();

  const [direction, setDirection] = useState<"expense" | "income">(parsedSearch.direction ?? "expense");
  const [amountStr, setAmountStr] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [note, setNote] = useState("");
  const [txError, setTxError] = useState<string | null>(null);

  const [goalId, setGoalId] = useState("");
  const [goalAmountStr, setGoalAmountStr] = useState("");
  const [goalError, setGoalError] = useState<string | null>(null);

  const [transferFrom, setTransferFrom] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [transferExternal, setTransferExternal] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferNote, setTransferNote] = useState("");
  const [transferError, setTransferError] = useState<string | null>(null);


  const handleTransferSubmit = (e: FormEvent) => {
    e.preventDefault();
    setTransferError(null);
    if (!transferFrom) { recordCoachFormFault("capture.transfer.source", "virements"); setTransferError(t("capture.transfer.errors.selectFrom")); return; }
    if (!transferTo && !transferExternal.trim()) { recordCoachFormFault("capture.transfer.destination", "virements"); setTransferError(t("capture.transfer.errors.selectDestination")); return; }
    const sourceAccount = accounts.find((account) => account.id === transferFrom);
    const currency = sourceAccount?.currency ?? snapshot?.baseCurrency ?? "XOF";
    const amount = parseMajorUnits(transferAmount, currency);
    if (amount == null || amount <= 0) { recordCoachFormFault("capture.transfer.amount", "virements"); setTransferError(t("capture.transfer.errors.validAmount")); return; }
    const money = { minorUnits: amount, currency };
    recordTransfer.mutate({
      fromAccountId: transferFrom,
      ...(transferTo ? { toAccountId: transferTo } : {}),
      ...(transferExternal.trim() ? { externalDestination: transferExternal.trim() } : {}),
      amount: money,
      ...(transferNote ? { note: transferNote } : {}),
    }, {
      onSuccess: () => {
        setTransferAmount("");
        setTransferNote("");
        setTransferFrom("");
        setTransferTo("");
        setTransferExternal("");
        setTransferError(null);
        toast.success(t("capture.transfer.recorded"));
      },
      onError: () => {
        recordCoachFormFault("capture.transfer.save", "virements");
        const message = t("capture.transfer.errors.failed");
        setTransferError(message);
        toast.error(message);
      },
    });
  };

  const handleTransactionSubmit = (e: FormEvent) => {
    e.preventDefault();
    setTxError(null);
    if (!categoryId) { recordCoachFormFault("capture.transaction.category", "transactions"); setTxError(t("capture.transaction.errors.selectCategory")); return; }
    if (!accountId) { recordCoachFormFault("capture.transaction.account", "transactions"); setTxError(t("capture.transaction.errors.selectAccount")); return; }
    const selectedAccount = accounts.find((account) => account.id === accountId);
    const currency = selectedAccount?.currency ?? snapshot?.baseCurrency ?? "XOF";
    const amount = parseMajorUnits(amountStr, currency);
    if (amount == null || amount <= 0) { recordCoachFormFault("capture.transaction.amount", "transactions"); setTxError(t("capture.transaction.errors.validAmount")); return; }
    const money = { minorUnits: amount, currency };
    recordTx.mutate({ accountId, categoryId, amount: money, direction, ...(note ? { note } : {}) }, {
      onSuccess: () => {
        setAmountStr("");
        setNote("");
        setTxError(null);
        toast.success(t(direction === "income" ? "capture.transaction.incomeRecorded" : "capture.transaction.expenseRecorded"));
      },
      onError: () => {
        recordCoachFormFault("capture.transaction.save", "transactions");
        const message = t("capture.transaction.errors.failed");
        setTxError(message);
        toast.error(message);
      },
    });
  };

  const handleGoalContribution = (e: FormEvent) => {
    e.preventDefault();
    setGoalError(null);
    if (!goalId) { recordCoachFormFault("capture.goal.selection", "objectifs"); setGoalError(t("capture.goal.errors.selectGoal")); return; }
    const selectedGoal = activeGoals.find((goal) => goal.id === goalId);
    const currency = selectedGoal?.targetAmount.currency ?? snapshot?.baseCurrency ?? "XOF";
    const amount = parseMajorUnits(goalAmountStr, currency);
    if (amount == null || amount <= 0) { recordCoachFormFault("capture.goal.amount", "objectifs"); setGoalError(t("capture.goal.errors.validAmount")); return; }
    const money = { minorUnits: amount, currency };
    recordGoalContrib.mutate({ goalId, amount: money }, {
      onSuccess: () => {
        setGoalAmountStr("");
        setGoalError(null);
        toast.success(t("capture.goal.recorded"));
      },
      onError: () => {
        recordCoachFormFault("capture.goal.save", "objectifs");
        const message = t("capture.goal.errors.failed");
        setGoalError(message);
        toast.error(message);
      },
    });
  };

  if (isLoading) {
    return (
    <main aria-label={t("capture.ariaLabel")} className="app-page">
        <h1 className="page-title">{t("capture.title")}</h1>
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
      </main>
    );
  }

  const categories = snapshot?.categories.filter((category) => !category.isArchived) ?? [];
  const accounts = snapshot?.accounts.filter((a) => a.isActive) ?? [];
  const activeGoals = snapshot?.goals.filter((g) => !g.isArchived) ?? [];
  const transactionCurrency = accounts.find((account) => account.id === accountId)?.currency ?? snapshot?.baseCurrency ?? "XOF";
  const transferCurrency = accounts.find((account) => account.id === transferFrom)?.currency ?? snapshot?.baseCurrency ?? "XOF";
  const goalCurrency = activeGoals.find((goal) => goal.id === goalId)?.targetAmount.currency ?? snapshot?.baseCurrency ?? "XOF";
  const selectTab = (nextTab: CaptureTab) => {
    void navigate({ search: nextTab === "manage" ? { tab: nextTab, section: "accounts" } : { tab: nextTab }, replace: true });
  };
  const selectManageSection = (section: ManageSection) => {
    void navigate({ search: { tab: "manage", section }, replace: true });
  };

  return (
    <main aria-label={t("capture.ariaLabel")} className="app-page">
      <div className="page-head">
        <div>
          <h1 className="page-title">{t("capture.heading")}</h1>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(value) => selectTab(value as CaptureTab)}>
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-4 lg:w-[560px]">
          <TabsTrigger value="transaction">{t("capture.tabs.transaction")}</TabsTrigger>
          <TabsTrigger value="transfer">{t("capture.tabs.transfer")}</TabsTrigger>
          <TabsTrigger value="goal">{t("capture.tabs.goal")}</TabsTrigger>
          <TabsTrigger value="manage">{t("capture.tabs.manage")}</TabsTrigger>
        </TabsList>

        <TabsContent value="transaction">
          {accounts.length === 0 ? (
            <AccountRequired onManage={() => selectTab("manage")} />
          ) : (
          <Card className="max-w-[720px]">
            <CardHeader>
              <CardTitle className="text-base">{t("capture.transaction.title")}</CardTitle>
            </CardHeader>
            <CardContent>
              {txError != null && (
                <p role="alert" className="text-destructive text-sm mb-4">{txError}</p>
              )}
              <form onSubmit={handleTransactionSubmit} className="space-y-4">
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    type="button"
                    variant={direction === "expense" ? "default" : "outline"}
                    className="w-full"
                    onClick={() => setDirection("expense")}
                  >
                    <ArrowUp className="h-4 w-4 mr-1" />
                    {t("capture.transaction.expense")}
                  </Button>
                  <Button
                    type="button"
                    variant={direction === "income" ? "default" : "outline"}
                    className="w-full"
                    onClick={() => setDirection("income")}
                  >
                    <ArrowDown className="h-4 w-4 mr-1" />
                    {t("capture.transaction.income")}
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="amount">{t("capture.transaction.amount")}</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                      {transactionCurrency}
                    </span>
                    <Input
                      id="amount"
                      type="text"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={amountStr}
                      onChange={(e) => setAmountStr(e.target.value)}
                      className="pl-14"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="account">{t("capture.transaction.account")}</Label>
                  <Select value={accountId} onValueChange={setAccountId}>
                    <SelectTrigger id="account"><SelectValue placeholder={t("capture.transaction.selectAccount")} /></SelectTrigger>
                    <SelectContent>
                      {accounts.length === 0 ? (
                        <SelectEmptyState>{t("capture.empty.accountsManage")}</SelectEmptyState>
                      ) : (
                        accounts.map((a) => (
                          <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="category">{t("capture.transaction.category")}</Label>
                  <Select value={categoryId} onValueChange={setCategoryId}>
                    <SelectTrigger id="category"><SelectValue placeholder={t("capture.transaction.selectCategory")} /></SelectTrigger>
                    <SelectContent>
                      {categories.length === 0 ? (
                        <SelectEmptyState>{t("capture.empty.categoriesManage")}</SelectEmptyState>
                      ) : (
                        categories.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{categoryDisplayName(c, t)}</SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="note">{t("capture.transaction.note")}</Label>
                  <Input
                    id="note"
                    type="text"
                    placeholder={t("capture.transaction.notePlaceholder")}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </div>

                <Button type="submit" disabled={recordTx.isPending} className="w-full sm:w-auto">
                  {recordTx.isPending ? t("capture.transaction.submitting") : t("capture.transaction.submit")}
                </Button>
              </form>
            </CardContent>
          </Card>
          )}
        </TabsContent>

        <TabsContent value="transfer">
          {accounts.length === 0 ? (
            <AccountRequired onManage={() => selectTab("manage")} />
          ) : (
          <Card className="max-w-[720px]">
            <CardHeader>
              <CardTitle className="text-base">{t("capture.transfer.title")}</CardTitle>
            </CardHeader>
            <CardContent>
              {transferError != null && (
                <p role="alert" className="text-destructive text-sm mb-4">{transferError}</p>
              )}
              <form onSubmit={handleTransferSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="transfer-from">{t("capture.transfer.from")}</Label>
                  <Select value={transferFrom} onValueChange={setTransferFrom}>
                    <SelectTrigger id="transfer-from"><SelectValue placeholder={t("capture.transfer.fromPlaceholder")} /></SelectTrigger>
                    <SelectContent>
                      {accounts.length === 0 ? (
                        <SelectEmptyState>{t("capture.empty.accountsManage")}</SelectEmptyState>
                      ) : (
                        accounts.map((a) => (
                          <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="transfer-to">{t("capture.transfer.to")} <span className="text-xs text-muted-foreground">{t("capture.transfer.toOptional")}</span></Label>
                  <Select value={transferTo} onValueChange={(v) => { setTransferTo(v); setTransferExternal(""); }}>
                    <SelectTrigger id="transfer-to"><SelectValue placeholder={t("capture.transfer.toPlaceholder")} /></SelectTrigger>
                    <SelectContent>
                      {accounts.filter((a) => a.id !== transferFrom).length === 0 ? (
                        <SelectEmptyState>{t("capture.empty.noOtherAccounts")}</SelectEmptyState>
                      ) : (
                        accounts.filter((a) => a.id !== transferFrom).map((a) => (
                          <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="transfer-external">{t("capture.transfer.external")}</Label>
                  <Input
                    id="transfer-external"
                    type="text"
                    placeholder={t("capture.transfer.externalPlaceholder")}
                    value={transferExternal}
                    onChange={(e) => { setTransferExternal(e.target.value); if (e.target.value) setTransferTo(""); }}
                    disabled={transferTo !== ""}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="transfer-amount">{t("capture.transfer.amount")}</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">{transferCurrency}</span>
                    <Input
                      id="transfer-amount"
                      type="text"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={transferAmount}
                      onChange={(e) => setTransferAmount(e.target.value)}
                      className="pl-14"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="transfer-note">{t("capture.transfer.note")}</Label>
                  <Input
                    id="transfer-note"
                    type="text"
                    placeholder={t("capture.transfer.notePlaceholder")}
                    value={transferNote}
                    onChange={(e) => setTransferNote(e.target.value)}
                  />
                </div>

                <Button type="submit" disabled={recordTransfer.isPending} className="w-full sm:w-auto">
                  {recordTransfer.isPending ? t("capture.transfer.submitting") : t("capture.transfer.submit")}
                </Button>
              </form>
            </CardContent>
          </Card>
          )}
        </TabsContent>

        <TabsContent value="goal">
          <Card className="max-w-[720px]">
            <CardHeader>
              <CardTitle className="text-base">{t("capture.goal.title")}</CardTitle>
            </CardHeader>
            <CardContent>
              {goalError != null && (
                <p role="alert" className="text-destructive text-sm mb-4">{goalError}</p>
              )}
              <form onSubmit={handleGoalContribution} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="goal">{t("capture.tabs.goal")}</Label>
                  <Select value={goalId} onValueChange={setGoalId}>
                    <SelectTrigger id="goal"><SelectValue placeholder={t("capture.goal.selectGoal")} /></SelectTrigger>
                    <SelectContent>
                      {activeGoals.length === 0 ? (
                        <SelectEmptyState>{t("capture.empty.goalsPlanning")}</SelectEmptyState>
                      ) : (
                        activeGoals.map((g) => (
                          <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="goalAmount">{t("capture.goal.amount")}</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">{goalCurrency}</span>
                    <Input
                      id="goalAmount"
                      type="text"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={goalAmountStr}
                      onChange={(e) => setGoalAmountStr(e.target.value)}
                      className="pl-14"
                      required
                    />
                  </div>
                </div>
                <Button type="submit" disabled={recordGoalContrib.isPending} className="w-full sm:w-auto">
                  {recordGoalContrib.isPending ? t("capture.goal.submitting") : t("capture.goal.submit")}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="manage">
          <div className="max-w-4xl space-y-3">
            <div className="grid grid-cols-2 border border-border bg-muted" role="tablist" aria-label={t("capture.manage.sectionsLabel")}>
              {(["accounts", "categories"] as const).map((section) => (
                <button
                  key={section}
                  type="button"
                  role="tab"
                  aria-selected={manageSection === section}
                  onClick={() => selectManageSection(section)}
                  className={`min-h-12 border-primary px-4 text-left text-sm font-semibold transition-colors first:border-r ${manageSection === section ? "bg-primary text-primary-foreground" : "bg-card text-card-foreground hover:bg-muted"}`}
                >
                  {t(`capture.manage.${section}`)}
                </button>
              ))}
            </div>
            {snapshot != null && <ManagementSections snapshot={snapshot} section={manageSection} />}
          </div>
        </TabsContent>
      </Tabs>
    </main>
  );
}
