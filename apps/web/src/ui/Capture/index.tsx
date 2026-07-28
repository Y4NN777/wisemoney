import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useFinancialState, useRecordTransaction, useCreateCategory, useRenameCategory, useArchiveCategory, useCreateAccount, useUpdateAccount, useArchiveAccount, useRecordGoalContribution, useRecordTransfer } from "../../hooks/useFinancialState.ts";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card.tsx";
import { Input } from "../../components/ui/input.tsx";
import { Label } from "../../components/ui/label.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Select, SelectContent, SelectEmptyState, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../../components/ui/dialog.tsx";
import { Skeleton } from "../../components/ui/skeleton.tsx";
import { Plus, ArrowUp, ArrowDown, Pencil, Wallet, Tags, Search, CreditCard, Trash2, Check, ChevronsUpDown } from "lucide-react";
import { toast } from "sonner";
import { formatMoney as formatMoneyValue, parseMajorUnits } from "../../types/money.ts";

function formatMoney(minorUnits: number, currency: string): string {
  return formatMoneyValue({ minorUnits, currency });
}

type AccountCurrencyOption = {
  code: string;
  name: string;
  region: "Africa" | "Global";
  countries: string;
};

const AFRICAN_ACCOUNT_CURRENCY_DETAILS: AccountCurrencyOption[] = [
  { code: "DZD", name: "Algerian Dinar", region: "Africa", countries: "Algeria" },
  { code: "AOA", name: "Angolan Kwanza", region: "Africa", countries: "Angola" },
  { code: "BWP", name: "Botswana Pula", region: "Africa", countries: "Botswana" },
  { code: "BIF", name: "Burundian Franc", region: "Africa", countries: "Burundi" },
  { code: "CVE", name: "Cape Verdean Escudo", region: "Africa", countries: "Cape Verde Cabo Verde" },
  { code: "KMF", name: "Comorian Franc", region: "Africa", countries: "Comoros" },
  { code: "CDF", name: "Congolese Franc", region: "Africa", countries: "Democratic Republic of Congo DRC Congo Kinshasa" },
  { code: "DJF", name: "Djiboutian Franc", region: "Africa", countries: "Djibouti" },
  { code: "EGP", name: "Egyptian Pound", region: "Africa", countries: "Egypt" },
  { code: "ERN", name: "Eritrean Nakfa", region: "Africa", countries: "Eritrea" },
  { code: "ETB", name: "Ethiopian Birr", region: "Africa", countries: "Ethiopia" },
  { code: "GMD", name: "Gambian Dalasi", region: "Africa", countries: "Gambia" },
  { code: "GHS", name: "Ghanaian Cedi", region: "Africa", countries: "Ghana" },
  { code: "GNF", name: "Guinean Franc", region: "Africa", countries: "Guinea" },
  { code: "KES", name: "Kenyan Shilling", region: "Africa", countries: "Kenya" },
  { code: "LSL", name: "Lesotho Loti", region: "Africa", countries: "Lesotho" },
  { code: "LRD", name: "Liberian Dollar", region: "Africa", countries: "Liberia" },
  { code: "LYD", name: "Libyan Dinar", region: "Africa", countries: "Libya" },
  { code: "MGA", name: "Malagasy Ariary", region: "Africa", countries: "Madagascar" },
  { code: "MWK", name: "Malawian Kwacha", region: "Africa", countries: "Malawi" },
  { code: "MUR", name: "Mauritian Rupee", region: "Africa", countries: "Mauritius" },
  { code: "MRU", name: "Mauritanian Ouguiya", region: "Africa", countries: "Mauritania" },
  { code: "MAD", name: "Moroccan Dirham", region: "Africa", countries: "Morocco Western Sahara" },
  { code: "MZN", name: "Mozambican Metical", region: "Africa", countries: "Mozambique" },
  { code: "NAD", name: "Namibian Dollar", region: "Africa", countries: "Namibia" },
  { code: "NGN", name: "Nigerian Naira", region: "Africa", countries: "Nigeria" },
  { code: "RWF", name: "Rwandan Franc", region: "Africa", countries: "Rwanda" },
  { code: "STN", name: "Sao Tome and Principe Dobra", region: "Africa", countries: "Sao Tome Principe" },
  { code: "SCR", name: "Seychellois Rupee", region: "Africa", countries: "Seychelles" },
  { code: "SLE", name: "Sierra Leonean Leone", region: "Africa", countries: "Sierra Leone" },
  { code: "SOS", name: "Somali Shilling", region: "Africa", countries: "Somalia" },
  { code: "SSP", name: "South Sudanese Pound", region: "Africa", countries: "South Sudan" },
  { code: "SDG", name: "Sudanese Pound", region: "Africa", countries: "Sudan" },
  { code: "SZL", name: "Swazi Lilangeni", region: "Africa", countries: "Eswatini Swaziland" },
  { code: "TZS", name: "Tanzanian Shilling", region: "Africa", countries: "Tanzania" },
  { code: "TND", name: "Tunisian Dinar", region: "Africa", countries: "Tunisia" },
  { code: "UGX", name: "Ugandan Shilling", region: "Africa", countries: "Uganda" },
  { code: "XAF", name: "Central African CFA Franc", region: "Africa", countries: "Cameroon Central African Republic Chad Republic of Congo Equatorial Guinea Gabon CEMAC" },
  { code: "XOF", name: "West African CFA Franc", region: "Africa", countries: "Benin Burkina Faso Guinea-Bissau Ivory Coast Cote d'Ivoire Mali Niger Senegal Togo WAEMU UEMOA" },
  { code: "ZAR", name: "South African Rand", region: "Africa", countries: "South Africa Lesotho Namibia Eswatini" },
  { code: "ZMW", name: "Zambian Kwacha", region: "Africa", countries: "Zambia" },
  { code: "ZWL", name: "Zimbabwean Dollar", region: "Africa", countries: "Zimbabwe" },
];

function buildAccountCurrencyOptions(locale: string): AccountCurrencyOption[] {
  const displayNames = typeof Intl.DisplayNames === "function" ? new Intl.DisplayNames([locale], { type: "currency" }) : null;
  const intlCodes = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("currency") : [];
  const detailsByCode = new Map(AFRICAN_ACCOUNT_CURRENCY_DETAILS.map((currency) => [currency.code, currency]));
  const codes = Array.from(new Set([...intlCodes, ...AFRICAN_ACCOUNT_CURRENCY_DETAILS.map((currency) => currency.code), "USD", "EUR", "GBP"]));

  return codes
    .map((code) => {
      const details = detailsByCode.get(code);
      return {
        code,
        name: displayNames?.of(code) ?? details?.name ?? code,
        region: details?.region ?? "Global" as const,
        countries: details?.countries ?? "",
      };
    })
    .sort((a, b) => {
      const regionRank = a.region === b.region ? 0 : a.region === "Africa" ? -1 : 1;
      return regionRank !== 0 ? regionRank : a.name.localeCompare(b.name);
    });
}

const ACCOUNT_TYPES = [
  "checking", "savings", "credit", "cash", "mobile_money", "investment",
] as const;

function AccountCurrencyPicker({ value, onValueChange }: { value: string; onValueChange: (value: string) => void }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const currencies = useMemo(() => buildAccountCurrencyOptions(i18n.resolvedLanguage ?? i18n.language), [i18n.language, i18n.resolvedLanguage]);
  const selected = currencies.find((currency) => currency.code === value);
  const filteredCurrencies = currencies.filter((currency) => {
    const normalized = query.trim().toLowerCase();
    if (normalized.length === 0) return true;
    return (
      currency.code.toLowerCase().includes(normalized) ||
      currency.name.toLowerCase().includes(normalized) ||
      currency.region.toLowerCase().includes(normalized) ||
      currency.countries.toLowerCase().includes(normalized)
    );
  });

  useEffect(() => {
    if (!open) return;

    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      const picker = pickerRef.current;
      if (picker !== null && !picker.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeOnOutsidePointerDown);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointerDown);
    };
  }, [open]);

  return (
    <div ref={pickerRef} className="min-w-0 space-y-2">
      <button
        id="accCurrency"
        type="button"
        className="flex min-h-12 w-full max-w-full items-center justify-between gap-3 overflow-hidden rounded-md border border-input bg-card px-3 py-2 text-left text-sm shadow-sm transition-colors hover:border-primary/30 focus-visible:border-primary"
        onClick={() => setOpen((next) => !next)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
          }
        }}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{selected != null ? `${selected.code} - ${selected.name}` : value}</span>
          {selected?.countries != null && selected.countries.length > 0 && (
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">{selected.countries}</span>
          )}
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div className="w-full min-w-0 max-w-full rounded-lg border border-border bg-background shadow-sm">
          <div className="border-b border-border p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("capture.manage.currencySearch", { currency: value })}
                className="pl-9"
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-[min(18rem,42dvh)] overflow-y-auto p-1" role="listbox" aria-label={t("capture.manage.accountCurrency")}>
            {filteredCurrencies.length === 0 ? (
              <p className="px-3 py-4 text-sm text-muted-foreground">{t("capture.manage.noCurrency")}</p>
            ) : (
              filteredCurrencies.map((currency) => (
                <button
                  key={currency.code}
                  type="button"
                  role="option"
                  aria-selected={currency.code === value}
                  className={`flex w-full items-start justify-between gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent ${currency.code === value ? "bg-accent text-accent-foreground" : ""}`}
                  onClick={() => {
                    onValueChange(currency.code);
                    setQuery("");
                    setOpen(false);
                  }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{currency.code} - {currency.name}</span>
                    {currency.countries.length > 0 && <span className="mt-0.5 block truncate text-xs leading-snug text-muted-foreground">{currency.countries}</span>}
                  </span>
                  <span className="flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs">
                    {currency.code === value && <Check className="h-3 w-3" />}
                    {t(`capture.manage.regions.${currency.region.toLowerCase()}`)}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Capture() {
  const { t } = useTranslation();
  const { data: snapshot, isLoading } = useFinancialState();
  const recordTx = useRecordTransaction();
  const createCat = useCreateCategory();
  const renameCat = useRenameCategory();
  const archiveCat = useArchiveCategory();
  const createAccount = useCreateAccount();
  const updateAccount = useUpdateAccount();
  const archiveAccount = useArchiveAccount();
  const recordGoalContrib = useRecordGoalContribution();
  const recordTransfer = useRecordTransfer();

  const [direction, setDirection] = useState<"expense" | "income">("expense");
  const [amountStr, setAmountStr] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [note, setNote] = useState("");
  const [txError, setTxError] = useState<string | null>(null);

  const [newCatName, setNewCatName] = useState("");
  const [createCategoryOpen, setCreateCategoryOpen] = useState(false);
  const [catSearch, setCatSearch] = useState("");
  const [renameDialog, setRenameDialog] = useState<{ id: string; name: string } | null>(null);
  const [renameName, setRenameName] = useState("");
  const [catError, setCatError] = useState<string | null>(null);
  const [newAccName, setNewAccName] = useState("");
  const [createAccountOpen, setCreateAccountOpen] = useState(false);
  const [newAccType, setNewAccType] = useState("checking");
  const [newAccCurrency, setNewAccCurrency] = useState("XOF");
  const accountCurrencyInitialized = useRef(false);
  const [newAccBalance, setNewAccBalance] = useState("");
  const [editAccountDialog, setEditAccountDialog] = useState<{ id: string; name: string; type: string } | null>(null);
  const [editAccName, setEditAccName] = useState("");
  const [editAccType, setEditAccType] = useState("checking");
  const [accountSearch, setAccountSearch] = useState("");
  const [accountError, setAccountError] = useState<string | null>(null);

  const [goalId, setGoalId] = useState("");
  const [goalAmountStr, setGoalAmountStr] = useState("");
  const [goalError, setGoalError] = useState<string | null>(null);

  const [transferFrom, setTransferFrom] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [transferExternal, setTransferExternal] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferNote, setTransferNote] = useState("");
  const [transferError, setTransferError] = useState<string | null>(null);

  useEffect(() => {
    if (!accountCurrencyInitialized.current && snapshot != null) {
      accountCurrencyInitialized.current = true;
      setNewAccCurrency(snapshot.baseCurrency);
    }
  }, [snapshot]);

  const handleTransferSubmit = (e: FormEvent) => {
    e.preventDefault();
    setTransferError(null);
    if (!transferFrom) { setTransferError(t("capture.transfer.errors.selectFrom")); return; }
    if (!transferTo && !transferExternal.trim()) { setTransferError(t("capture.transfer.errors.selectDestination")); return; }
    const sourceAccount = accounts.find((account) => account.id === transferFrom);
    const currency = sourceAccount?.currency ?? snapshot?.baseCurrency ?? "XOF";
    const amount = parseMajorUnits(transferAmount, currency);
    if (amount == null || amount <= 0) { setTransferError(t("capture.transfer.errors.validAmount")); return; }
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
      onError: (err) => {
        const message = err instanceof Error ? err.message : t("capture.transfer.errors.failed");
        setTransferError(message);
        toast.error(message);
      },
    });
  };

  const handleTransactionSubmit = (e: FormEvent) => {
    e.preventDefault();
    setTxError(null);
    if (!categoryId) { setTxError(t("capture.transaction.errors.selectCategory")); return; }
    if (!accountId) { setTxError(t("capture.transaction.errors.selectAccount")); return; }
    const selectedAccount = accounts.find((account) => account.id === accountId);
    const currency = selectedAccount?.currency ?? snapshot?.baseCurrency ?? "XOF";
    const amount = parseMajorUnits(amountStr, currency);
    if (amount == null || amount <= 0) { setTxError(t("capture.transaction.errors.validAmount")); return; }
    const money = { minorUnits: amount, currency };
    recordTx.mutate({ accountId, categoryId, amount: money, direction, ...(note ? { note } : {}) }, {
      onSuccess: () => {
        setAmountStr("");
        setNote("");
        setTxError(null);
        toast.success(t(direction === "income" ? "capture.transaction.incomeRecorded" : "capture.transaction.expenseRecorded"));
      },
      onError: (err) => {
        const message = err instanceof Error ? err.message : t("capture.transaction.errors.failed");
        setTxError(message);
        toast.error(message);
      },
    });
  };

  const handleCreateCategory = (e: FormEvent) => {
    e.preventDefault();
    setCatError(null);
    if (!newCatName.trim()) return;
    const categoryName = newCatName.trim();
    createCat.mutate({ name: categoryName }, {
      onSuccess: () => {
        setNewCatName("");
        setCreateCategoryOpen(false);
        toast.success(t("capture.manage.categoryCreated"), { description: categoryName });
      },
      onError: (err) => {
        const message = err instanceof Error ? err.message : t("capture.manage.errors.failed");
        setCatError(message);
        toast.error(message);
      },
    });
  };

  const handleRenameCategory = (e: FormEvent) => {
    e.preventDefault();
    setCatError(null);
    if (renameDialog == null || !renameName.trim()) return;
    renameCat.mutate({ categoryId: renameDialog.id, newName: renameName.trim() }, {
      onSuccess: () => {
        setRenameDialog(null);
        setRenameName("");
        toast.success(t("capture.manage.categoryRenamed"));
      },
      onError: (err) => {
        const message = err instanceof Error ? err.message : t("capture.manage.errors.renameCategoryFailed");
        setCatError(message);
        toast.error(message);
      },
    });
  };

  const handleArchiveCategory = (categoryId: string, categoryName: string) => {
    setCatError(null);
    if (!window.confirm(t("capture.manage.confirmArchiveCategory", { name: categoryName }))) return;
    archiveCat.mutate({ categoryId }, {
      onSuccess: () => toast.success(t("capture.manage.categoryArchived"), { description: categoryName }),
      onError: (err) => {
        const message = err instanceof Error ? err.message : t("capture.manage.errors.archiveCategoryFailed");
        setCatError(message);
        toast.error(message);
      },
    });
  };

  const handleCreateAccount = (e: FormEvent) => {
    e.preventDefault();
    setAccountError(null);
    if (!newAccName.trim()) return;
    const parsedBalance = newAccBalance.trim().length > 0 ? parseMajorUnits(newAccBalance, newAccCurrency) : 0;
    if (parsedBalance == null) {
      setAccountError(t("capture.manage.errorsAccount.validBalance"));
      return;
    }
    const money = { minorUnits: parsedBalance, currency: newAccCurrency };
    const accountName = newAccName.trim();
    createAccount.mutate({ name: accountName, type: newAccType, initialBalance: money }, {
      onSuccess: () => {
        setNewAccName("");
        setNewAccBalance("");
        setCreateAccountOpen(false);
        toast.success(t("capture.manage.accountCreated"), { description: accountName });
      },
      onError: (err) => {
        const message = err instanceof Error ? err.message : t("capture.manage.errorsAccount.failed");
        setAccountError(message);
        toast.error(message);
      },
    });
  };

  const handleUpdateAccount = (e: FormEvent) => {
    e.preventDefault();
    setAccountError(null);
    if (editAccountDialog == null || !editAccName.trim()) return;
    updateAccount.mutate({ accountId: editAccountDialog.id, name: editAccName.trim(), type: editAccType }, {
      onSuccess: () => {
        setEditAccountDialog(null);
        setEditAccName("");
        setEditAccType("checking");
        toast.success(t("capture.manage.accountUpdated"));
      },
      onError: (err) => {
        const message = err instanceof Error ? err.message : t("capture.manage.errorsAccount.updateFailed");
        setAccountError(message);
        toast.error(message);
      },
    });
  };

  const handleArchiveAccount = (accountId: string, accountName: string) => {
    setAccountError(null);
    if (!window.confirm(t("capture.manage.confirmArchiveAccount", { name: accountName }))) return;
    archiveAccount.mutate({ accountId }, {
      onSuccess: () => toast.success(t("capture.manage.accountArchived"), { description: accountName }),
      onError: (err) => {
        const message = err instanceof Error ? err.message : t("capture.manage.errorsAccount.archiveFailed");
        setAccountError(message);
        toast.error(message);
      },
    });
  };

  const handleGoalContribution = (e: FormEvent) => {
    e.preventDefault();
    setGoalError(null);
    if (!goalId) { setGoalError(t("capture.goal.errors.selectGoal")); return; }
    const selectedGoal = activeGoals.find((goal) => goal.id === goalId);
    const currency = selectedGoal?.targetAmount.currency ?? snapshot?.baseCurrency ?? "XOF";
    const amount = parseMajorUnits(goalAmountStr, currency);
    if (amount == null || amount <= 0) { setGoalError(t("capture.goal.errors.validAmount")); return; }
    const money = { minorUnits: amount, currency };
    recordGoalContrib.mutate({ goalId, amount: money }, {
      onSuccess: () => {
        setGoalAmountStr("");
        setGoalError(null);
        toast.success(t("capture.goal.recorded"));
      },
      onError: (err) => {
        const message = err instanceof Error ? err.message : t("capture.goal.errors.failed");
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
  const filteredCategories = categories.filter((category) => category.name.toLowerCase().includes(catSearch.trim().toLowerCase()));
  const filteredAccounts = accounts.filter((account) =>
    `${account.name} ${account.type} ${account.currency}`.toLowerCase().includes(accountSearch.trim().toLowerCase())
  );
  const managedBalance = snapshot?.totalBalance ?? { minorUnits: 0, currency: snapshot?.baseCurrency ?? newAccCurrency };
  const transactionCurrency = accounts.find((account) => account.id === accountId)?.currency ?? snapshot?.baseCurrency ?? "XOF";
  const transferCurrency = accounts.find((account) => account.id === transferFrom)?.currency ?? snapshot?.baseCurrency ?? "XOF";
  const goalCurrency = activeGoals.find((goal) => goal.id === goalId)?.targetAmount.currency ?? snapshot?.baseCurrency ?? "XOF";

  return (
    <main aria-label={t("capture.ariaLabel")} className="app-page">
      <div className="page-head">
        <div>
          <p className="page-kicker">{t("capture.title")}</p>
          <h1 className="page-title">{t("capture.heading")}</h1>
        </div>
      </div>

      <Tabs defaultValue="transaction">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-4 lg:w-[560px]">
          <TabsTrigger value="transaction">{t("capture.tabs.transaction")}</TabsTrigger>
          <TabsTrigger value="transfer">{t("capture.tabs.transfer")}</TabsTrigger>
          <TabsTrigger value="goal">{t("capture.tabs.goal")}</TabsTrigger>
          <TabsTrigger value="manage">{t("capture.tabs.manage")}</TabsTrigger>
        </TabsList>

        <TabsContent value="transaction">
          <Card className="max-w-4xl">
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
                    <ArrowUp className="h-4 w-4 mr-1 rotate-180" />
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
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
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
        </TabsContent>

        <TabsContent value="transfer">
          <Card className="max-w-4xl">
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
        </TabsContent>

        <TabsContent value="goal">
          <Card className="max-w-4xl">
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
          <div className="max-w-6xl space-y-3">
            <section className="grid gap-3 sm:grid-cols-3" aria-label={t("capture.manage.summary")}>
              <div className="rounded-lg border border-border bg-card p-3">
                <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Wallet className="h-4 w-4" />{t("capture.manage.accounts")}</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums">{accounts.length}</p>
              </div>
              <div className="rounded-lg border border-border bg-card p-3">
                <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><CreditCard className="h-4 w-4" />{t("capture.manage.managedBalance")}</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums">{formatMoney(managedBalance.minorUnits, managedBalance.currency)}</p>
              </div>
              <div className="rounded-lg border border-border bg-card p-3">
                <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Tags className="h-4 w-4" />{t("capture.manage.customCategories")}</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums">{categories.length}</p>
              </div>
            </section>

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
              <Card className="interactive-surface">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-base">
                    {t("capture.manage.categories")}
                    <Dialog
                      open={createCategoryOpen}
                      onOpenChange={(open) => {
                        setCreateCategoryOpen(open);
                        if (open) setCatError(null);
                      }}
                    >
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm"><Plus className="h-4 w-4 mr-1" />{t("capture.manage.new")}</Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-xl">
                        <DialogHeader>
                          <DialogTitle>{t("capture.manage.createCategory")}</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleCreateCategory} className="space-y-4 pt-4">
                          {catError != null && <p role="alert" className="text-sm text-destructive">{catError}</p>}
                          <div className="space-y-2">
                            <Label htmlFor="catName">{t("capture.manage.categoryName")}</Label>
                            <Input
                              id="catName"
                              value={newCatName}
                              onChange={(e) => setNewCatName(e.target.value)}
                              placeholder={t("capture.manage.categoryNamePlaceholder")}
                              required
                            />
                          </div>
                          <Button type="submit" disabled={createCat.isPending} className="w-full sm:w-auto">
                            {createCat.isPending ? t("capture.manage.submitting") : t("capture.manage.submit")}
                          </Button>
                        </form>
                      </DialogContent>
                    </Dialog>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={catSearch} onChange={(e) => setCatSearch(e.target.value)} placeholder={t("capture.manage.searchCategories")} className="pl-9" />
                  </div>
                  {categories.length === 0 ? (
                    <p className="empty-state">{t("capture.manage.noCategories")}</p>
                  ) : filteredCategories.length === 0 ? (
                    <p className="empty-state">{t("capture.manage.noCategoryMatch")}</p>
                  ) : (
                    <ul className="grid gap-2 sm:grid-cols-2">
                      {filteredCategories.map((c) => (
                        <li key={c.id} className="flex items-center justify-between rounded-lg border border-border bg-accent/35 px-3 py-2">
                          <span className="min-w-0 truncate text-sm font-medium">{c.name}</span>
                          <div className="flex shrink-0 items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label={t("capture.manage.renameCategoryAria", { name: c.name })}
                              onClick={() => {
                                setRenameDialog({ id: c.id, name: c.name });
                                setRenameName(c.name);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              aria-label={t("capture.manage.archiveCategoryAria", { name: c.name })}
                              disabled={archiveCat.isPending}
                              onClick={() => handleArchiveCategory(c.id, c.name)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card className="interactive-surface">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-base">
                    {t("capture.manage.accounts")}
                    <Dialog
                      open={createAccountOpen}
                      onOpenChange={(open) => {
                        setCreateAccountOpen(open);
                        if (open) setAccountError(null);
                      }}
                    >
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm"><Plus className="h-4 w-4 mr-1" />{t("capture.manage.new")}</Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-xl">
                        <DialogHeader>
                          <DialogTitle>{t("capture.manage.createAccount")}</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleCreateAccount} className="min-w-0 space-y-4 pt-4">
                          {accountError != null && <p role="alert" className="text-sm text-destructive">{accountError}</p>}
                          <div className="space-y-2">
                            <Label htmlFor="accName">{t("capture.manage.accountName")}</Label>
                            <Input id="accName" value={newAccName} onChange={(e) => setNewAccName(e.target.value)} placeholder={t("capture.manage.accountNamePlaceholder")} required />
                          </div>
                          <div className="grid min-w-0 gap-3 md:grid-cols-2">
                            <div className="min-w-0 space-y-2">
                              <Label htmlFor="accType">{t("capture.manage.accountType")}</Label>
                              <Select value={newAccType} onValueChange={setNewAccType}>
                                <SelectTrigger id="accType"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {ACCOUNT_TYPES.map((type) => (
                                    <SelectItem key={type} value={type}>{t(`capture.manage.accountTypes.${type}`)}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="min-w-0 space-y-2">
                              <Label htmlFor="accCurrency">{t("capture.manage.accountCurrency")}</Label>
                              <AccountCurrencyPicker value={newAccCurrency} onValueChange={setNewAccCurrency} />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="accBalance">{t("capture.manage.accountBalance")}</Label>
                            <Input id="accBalance" type="text" inputMode="decimal" value={newAccBalance} onChange={(e) => setNewAccBalance(e.target.value)} placeholder="0.00" />
                          </div>
                          <Button type="submit" disabled={createAccount.isPending} className="w-full sm:w-auto">
                            {createAccount.isPending ? t("capture.manage.submittingAccount") : t("capture.manage.submitAccount")}
                          </Button>
                        </form>
                      </DialogContent>
                    </Dialog>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={accountSearch} onChange={(e) => setAccountSearch(e.target.value)} placeholder={t("capture.manage.searchAccounts")} className="pl-9" />
                  </div>
                  {accounts.length === 0 ? (
                    <p className="empty-state">{t("capture.manage.noAccounts")}</p>
                  ) : filteredAccounts.length === 0 ? (
                    <p className="empty-state">{t("capture.manage.noAccountMatch")}</p>
                  ) : (
                    <ul className="space-y-2">
                      {filteredAccounts.map((a) => (
                        <li key={a.id} className="rounded-lg border border-border bg-accent/35 p-3">
                          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold">{a.name}</p>
                              <p className="text-xs text-muted-foreground">{t(`capture.manage.accountTypes.${a.type}`, { defaultValue: a.type.replace(/_/g, " ") })} &middot; {a.currency}</p>
                            </div>
                            <div className="flex min-w-0 items-center justify-between gap-2 sm:justify-end">
                              <p className="min-w-0 truncate text-sm font-semibold tabular-nums">{formatMoney(a.balance.minorUnits, a.balance.currency)}</p>
                              <div className="flex shrink-0 items-center gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                aria-label={t("capture.manage.editAccountAria", { name: a.name })}
                                onClick={() => {
                                  setEditAccountDialog({ id: a.id, name: a.name, type: a.type });
                                  setEditAccName(a.name);
                                  setEditAccType(a.type);
                                }}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                aria-label={t("capture.manage.archiveAccountAria", { name: a.name })}
                                disabled={archiveAccount.isPending}
                                onClick={() => handleArchiveAccount(a.id, a.name)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                              </div>
                            </div>
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">{t("capture.manage.openingBalance", { amount: formatMoney(a.initialBalance.minorUnits, a.initialBalance.currency) })}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>

            <Dialog open={renameDialog != null} onOpenChange={(open) => {
              if (!open) {
                setRenameDialog(null);
                setRenameName("");
              }
            }}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("capture.manage.renameCategory")}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleRenameCategory} className="space-y-4 pt-4">
                  {catError != null && <p role="alert" className="text-sm text-destructive">{catError}</p>}
                  <div className="space-y-2">
                    <Label htmlFor="renameCategoryName">{t("capture.manage.categoryName")}</Label>
                    <Input id="renameCategoryName" value={renameName} onChange={(e) => setRenameName(e.target.value)} placeholder={renameDialog?.name ?? t("capture.manage.categoryName")} required autoFocus />
                  </div>
                  <Button type="submit" disabled={renameCat.isPending || renameName.trim().length === 0} className="w-full sm:w-auto">
                    {renameCat.isPending ? t("capture.manage.saving") : t("capture.manage.saveRename")}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>

            <Dialog open={editAccountDialog != null} onOpenChange={(open) => {
              if (!open) {
                setEditAccountDialog(null);
                setEditAccName("");
                setEditAccType("checking");
              }
            }}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("capture.manage.editAccount")}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleUpdateAccount} className="space-y-4 pt-4">
                  {accountError != null && <p role="alert" className="text-sm text-destructive">{accountError}</p>}
                  <div className="space-y-2">
                    <Label htmlFor="editAccountName">{t("capture.manage.accountName")}</Label>
                    <Input id="editAccountName" value={editAccName} onChange={(e) => setEditAccName(e.target.value)} required autoFocus />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="editAccountType">{t("capture.manage.accountType")}</Label>
                    <Select value={editAccType} onValueChange={setEditAccType}>
                      <SelectTrigger id="editAccountType"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ACCOUNT_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>{t(`capture.manage.accountTypes.${type}`)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="submit" disabled={updateAccount.isPending || editAccName.trim().length === 0} className="w-full sm:w-auto">
                    {updateAccount.isPending ? t("capture.manage.saving") : t("capture.manage.saveAccount")}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </TabsContent>
      </Tabs>
    </main>
  );
}
