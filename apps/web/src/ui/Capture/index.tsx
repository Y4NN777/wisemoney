import { useState, type FormEvent } from "react";
import { useFinancialState, useRecordTransaction, useCreateCategory, useRenameCategory, useArchiveCategory, useCreateAccount, useUpdateAccount, useArchiveAccount, useRecordGoalContribution, useRecordTransfer } from "../../hooks/useFinancialState.ts";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card.tsx";
import { Input } from "../../components/ui/input.tsx";
import { Label } from "../../components/ui/label.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../../components/ui/dialog.tsx";
import { Skeleton } from "../../components/ui/skeleton.tsx";
import { Plus, ArrowUp, ArrowDown, Pencil, Wallet, Tags, Search, CreditCard, Trash2, Check, ChevronsUpDown } from "lucide-react";

function parseAmount(input: string): number | null {
  const cleaned = input.replace(/[^0-9.,]/g, "").replace(/,/g, ".");
  const parts = cleaned.split(".");
  if (parts.length > 2) return null;
  const major = parts[0] ?? "0";
  const minor = parts[1] ?? "";
  if (minor.length > 2) return null;
  const majorInt = parseInt(major, 10);
  if (isNaN(majorInt)) return null;
  return majorInt * 100 + parseInt(minor.padEnd(2, "0"), 10);
}

function formatMoney(minorUnits: number, currency: string): string {
  const symbol: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", XOF: "CFA ", XAF: "FCFA ", NGN: "₦", GHS: "₵", KES: "KSh ", ZAR: "R" };
  const sym = symbol[currency] ?? currency + " ";
  const abs = Math.abs(minorUnits);
  return `${minorUnits < 0 ? "-" : ""}${sym}${Math.floor(abs / 100).toLocaleString()}.${(abs % 100).toString().padStart(2, "0")}`;
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

function buildAccountCurrencyOptions(): AccountCurrencyOption[] {
  const displayNames = typeof Intl.DisplayNames === "function" ? new Intl.DisplayNames(["en"], { type: "currency" }) : null;
  const intlCodes = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("currency") : [];
  const detailsByCode = new Map(AFRICAN_ACCOUNT_CURRENCY_DETAILS.map((currency) => [currency.code, currency]));
  const codes = Array.from(new Set([...intlCodes, ...AFRICAN_ACCOUNT_CURRENCY_DETAILS.map((currency) => currency.code), "USD", "EUR", "GBP"]));

  return codes
    .map((code) => {
      const details = detailsByCode.get(code);
      return details ?? {
        code,
        name: displayNames?.of(code) ?? code,
        region: "Global" as const,
        countries: "",
      };
    })
    .sort((a, b) => {
      const regionRank = a.region === b.region ? 0 : a.region === "Africa" ? -1 : 1;
      return regionRank !== 0 ? regionRank : a.name.localeCompare(b.name);
    });
}

const ACCOUNT_CURRENCIES = buildAccountCurrencyOptions();

const ACCOUNT_TYPES = [
  { value: "checking", label: "Checking" },
  { value: "savings", label: "Savings" },
  { value: "credit", label: "Credit Card" },
  { value: "cash", label: "Cash" },
  { value: "mobile_money", label: "Mobile Money" },
  { value: "investment", label: "Investment" },
] as const;

function AccountCurrencyPicker({ value, onValueChange }: { value: string; onValueChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = ACCOUNT_CURRENCIES.find((currency) => currency.code === value);
  const filteredCurrencies = ACCOUNT_CURRENCIES.filter((currency) => {
    const normalized = query.trim().toLowerCase();
    if (normalized.length === 0) return true;
    return (
      currency.code.toLowerCase().includes(normalized) ||
      currency.name.toLowerCase().includes(normalized) ||
      currency.region.toLowerCase().includes(normalized) ||
      currency.countries.toLowerCase().includes(normalized)
    );
  });

  return (
    <div className="space-y-2">
      <button
        id="accCurrency"
        type="button"
        className="flex min-h-12 w-full items-center justify-between gap-3 rounded-md border border-input bg-card px-3 py-2 text-left text-sm shadow-sm transition-colors hover:border-primary/30 focus-visible:border-primary"
        onClick={() => setOpen((next) => !next)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="min-w-0">
          <span className="block truncate font-semibold">{selected != null ? `${selected.code} - ${selected.name}` : value}</span>
          {selected?.countries != null && selected.countries.length > 0 && (
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">{selected.countries}</span>
          )}
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div className="w-full min-w-0 rounded-lg border border-border bg-background shadow-sm max-sm:max-w-[calc(100vw-2rem)]">
          <div className="border-b border-border p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search currency (${value})`}
                className="pl-9"
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-[min(18rem,42dvh)] overflow-y-auto p-1" role="listbox" aria-label="Account currency">
            {filteredCurrencies.length === 0 ? (
              <p className="px-3 py-4 text-sm text-muted-foreground">No matching currency.</p>
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
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{currency.code} - {currency.name}</span>
                    {currency.countries.length > 0 && <span className="mt-0.5 block truncate text-xs leading-snug text-muted-foreground">{currency.countries}</span>}
                  </span>
                  <span className="flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs">
                    {currency.code === value && <Check className="h-3 w-3" />}
                    {currency.region}
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
  const [catSearch, setCatSearch] = useState("");
  const [renameDialog, setRenameDialog] = useState<{ id: string; name: string } | null>(null);
  const [renameName, setRenameName] = useState("");
  const [catError, setCatError] = useState<string | null>(null);
  const [newAccName, setNewAccName] = useState("");
  const [newAccType, setNewAccType] = useState("checking");
  const [newAccCurrency, setNewAccCurrency] = useState(() => localStorage.getItem("wisemoney_default_currency") ?? "XOF");
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

  const parseTransferAmount = (input: string): number | null => {
    const cleaned = input.replace(/[^0-9.,]/g, "").replace(/,/g, ".");
    const parts = cleaned.split(".");
    if (parts.length > 2) return null;
    const major = parts[0] ?? "0";
    const minor = parts[1] ?? "";
    if (minor.length > 2) return null;
    const majorInt = parseInt(major, 10);
    if (isNaN(majorInt)) return null;
    return majorInt * 100 + parseInt(minor.padEnd(2, "0"), 10);
  };

  const handleTransferSubmit = (e: FormEvent) => {
    e.preventDefault();
    setTransferError(null);
    const amount = parseTransferAmount(transferAmount);
    if (amount == null || amount <= 0) { setTransferError("Enter a valid amount"); return; }
    if (!transferFrom) { setTransferError("Select a source account"); return; }
    if (!transferTo && !transferExternal.trim()) { setTransferError("Select a destination account or enter an external destination"); return; }
    const money = { minorUnits: amount, currency: snapshot?.totalBalance.currency ?? "USD" };
    recordTransfer.mutate({
      fromAccountId: transferFrom,
      ...(transferTo ? { toAccountId: transferTo } : {}),
      ...(transferExternal.trim() ? { externalDestination: transferExternal.trim() } : {}),
      amount: money,
      ...(transferNote ? { note: transferNote } : {}),
    }, {
      onSuccess: () => { setTransferAmount(""); setTransferNote(""); setTransferFrom(""); setTransferTo(""); setTransferExternal(""); setTransferError(null); },
      onError: (err) => { setTransferError(err instanceof Error ? err.message : "Failed to record transfer"); },
    });
  };

  const handleTransactionSubmit = (e: FormEvent) => {
    e.preventDefault();
    setTxError(null);
    const amount = parseAmount(amountStr);
    if (amount == null || amount <= 0) { setTxError("Enter a valid amount"); return; }
    if (!categoryId) { setTxError("Select a category"); return; }
    if (!accountId) { setTxError("Select an account"); return; }
    const money = { minorUnits: direction === "expense" ? -amount : amount, currency: snapshot?.totalBalance.currency ?? "USD" };
    recordTx.mutate({ accountId, categoryId, amount: money, direction, ...(note ? { note } : {}) }, {
      onSuccess: () => { setAmountStr(""); setNote(""); setTxError(null); },
      onError: (err) => { setTxError(err instanceof Error ? err.message : "Failed to record transaction"); },
    });
  };

  const handleCreateCategory = (e: FormEvent) => {
    e.preventDefault();
    setCatError(null);
    if (!newCatName.trim()) return;
    createCat.mutate({ name: newCatName.trim() }, {
      onSuccess: () => setNewCatName(""),
      onError: (err) => setCatError(err instanceof Error ? err.message : "Failed to create category"),
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
      },
      onError: (err) => setCatError(err instanceof Error ? err.message : "Failed to rename category"),
    });
  };

  const handleArchiveCategory = (categoryId: string, categoryName: string) => {
    setCatError(null);
    if (!window.confirm(`Archive category "${categoryName}"? Existing history stays intact.`)) return;
    archiveCat.mutate({ categoryId }, {
      onError: (err) => setCatError(err instanceof Error ? err.message : "Failed to archive category"),
    });
  };

  const handleCreateAccount = (e: FormEvent) => {
    e.preventDefault();
    setAccountError(null);
    if (!newAccName.trim()) return;
    const parsedBalance = newAccBalance.trim().length > 0 ? parseAmount(newAccBalance) : 0;
    if (parsedBalance == null) {
      setAccountError("Enter a valid opening balance");
      return;
    }
    const money = { minorUnits: parsedBalance, currency: newAccCurrency };
    createAccount.mutate({ name: newAccName.trim(), type: newAccType, initialBalance: money }, {
      onSuccess: () => {
        setNewAccName("");
        setNewAccBalance("");
      },
      onError: (err) => setAccountError(err instanceof Error ? err.message : "Failed to create account"),
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
      },
      onError: (err) => setAccountError(err instanceof Error ? err.message : "Failed to update account"),
    });
  };

  const handleArchiveAccount = (accountId: string, accountName: string) => {
    setAccountError(null);
    if (!window.confirm(`Archive account "${accountName}"? Existing history stays intact.`)) return;
    archiveAccount.mutate({ accountId }, {
      onError: (err) => setAccountError(err instanceof Error ? err.message : "Failed to archive account"),
    });
  };

  const handleGoalContribution = (e: FormEvent) => {
    e.preventDefault();
    setGoalError(null);
    const amount = parseAmount(goalAmountStr);
    if (amount == null || amount <= 0) { setGoalError("Enter a valid amount"); return; }
    if (!goalId) { setGoalError("Select a goal"); return; }
    const money = { minorUnits: amount, currency: "USD" };
    recordGoalContrib.mutate({ goalId, amount: money }, {
      onSuccess: () => { setGoalAmountStr(""); setGoalError(null); },
      onError: (err) => { setGoalError(err instanceof Error ? err.message : "Failed"); },
    });
  };

  if (isLoading) {
    return (
    <main aria-label="Capture transaction" className="app-page">
        <h1 className="page-title">Capture</h1>
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
      </main>
    );
  }

  const categories = snapshot?.categories.filter((c) => !c.isSystemDefault) ?? [];
  const accounts = snapshot?.accounts.filter((a) => a.isActive) ?? [];
  const activeGoals = snapshot?.goals.filter((g) => !g.isArchived) ?? [];
  const filteredCategories = categories.filter((category) => category.name.toLowerCase().includes(catSearch.trim().toLowerCase()));
  const filteredAccounts = accounts.filter((account) =>
    `${account.name} ${account.type} ${account.currency}`.toLowerCase().includes(accountSearch.trim().toLowerCase())
  );
  const totalManagedBalance = accounts.reduce((sum, account) => {
    if (account.balance.currency !== (accounts[0]?.balance.currency ?? account.balance.currency)) return sum;
    return sum + account.balance.minorUnits;
  }, 0);
  const balanceCurrency = accounts[0]?.balance.currency ?? newAccCurrency;

  return (
    <main aria-label="Capture transaction" className="app-page">
      <div className="page-head">
        <div>
          <p className="page-kicker">Capture</p>
          <h1 className="page-title">Record Money Movement</h1>
        </div>
      </div>

      <Tabs defaultValue="transaction">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-4 lg:w-[560px]">
          <TabsTrigger value="transaction">Transaction</TabsTrigger>
          <TabsTrigger value="transfer">Transfer</TabsTrigger>
          <TabsTrigger value="goal">Goal</TabsTrigger>
          <TabsTrigger value="manage">Manage</TabsTrigger>
        </TabsList>

        <TabsContent value="transaction">
          <Card className="max-w-4xl">
            <CardHeader>
              <CardTitle className="text-base">Record Transaction</CardTitle>
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
                    Expense
                  </Button>
                  <Button
                    type="button"
                    variant={direction === "income" ? "default" : "outline"}
                    className="w-full"
                    onClick={() => setDirection("income")}
                  >
                    <ArrowDown className="h-4 w-4 mr-1" />
                    Income
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="amount">Amount</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                      $
                    </span>
                    <Input
                      id="amount"
                      type="text"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={amountStr}
                      onChange={(e) => setAmountStr(e.target.value)}
                      className="pl-7"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="account">Account</Label>
                  <Select value={accountId} onValueChange={setAccountId}>
                    <SelectTrigger id="account"><SelectValue placeholder="Select account" /></SelectTrigger>
                    <SelectContent>
                      {accounts.length === 0 ? (
                        <SelectItem value="__no_accounts__" disabled>No accounts yet. Create one in Manage.</SelectItem>
                      ) : (
                        accounts.map((a) => (
                          <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="category">Category</Label>
                  <Select value={categoryId} onValueChange={setCategoryId}>
                    <SelectTrigger id="category"><SelectValue placeholder="Select category" /></SelectTrigger>
                    <SelectContent>
                      {categories.length === 0 ? (
                        <SelectItem value="__no_categories__" disabled>No categories yet. Create one in Manage.</SelectItem>
                      ) : (
                        categories.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="note">Note (optional)</Label>
                  <Input
                    id="note"
                    type="text"
                    placeholder="Groceries, rent, etc."
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </div>

                <Button type="submit" disabled={recordTx.isPending} className="w-full sm:w-auto">
                  {recordTx.isPending ? "Recording…" : "Record Transaction"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transfer">
          <Card className="max-w-4xl">
            <CardHeader>
              <CardTitle className="text-base">Transfer Between Accounts</CardTitle>
            </CardHeader>
            <CardContent>
              {transferError != null && (
                <p role="alert" className="text-destructive text-sm mb-4">{transferError}</p>
              )}
              <form onSubmit={handleTransferSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="transfer-from">From Account</Label>
                  <Select value={transferFrom} onValueChange={setTransferFrom}>
                    <SelectTrigger id="transfer-from"><SelectValue placeholder="Select source account" /></SelectTrigger>
                    <SelectContent>
                      {accounts.length === 0 ? (
                        <SelectItem value="__no_accounts__" disabled>No accounts yet. Create one in Manage.</SelectItem>
                      ) : (
                        accounts.map((a) => (
                          <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="transfer-to">To Account <span className="text-xs text-muted-foreground">(optional for external transfer)</span></Label>
                  <Select value={transferTo} onValueChange={(v) => { setTransferTo(v); setTransferExternal(""); }}>
                    <SelectTrigger id="transfer-to"><SelectValue placeholder="Select destination account" /></SelectTrigger>
                    <SelectContent>
                      {accounts.filter((a) => a.id !== transferFrom).length === 0 ? (
                        <SelectItem value="__no_accounts__" disabled>No other accounts available.</SelectItem>
                      ) : (
                        accounts.filter((a) => a.id !== transferFrom).map((a) => (
                          <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="transfer-external">Or external destination</Label>
                  <Input
                    id="transfer-external"
                    type="text"
                    placeholder="e.g. External bank, PayPal, etc."
                    value={transferExternal}
                    onChange={(e) => { setTransferExternal(e.target.value); if (e.target.value) setTransferTo(""); }}
                    disabled={transferTo !== ""}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="transfer-amount">Amount</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                    <Input
                      id="transfer-amount"
                      type="text"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={transferAmount}
                      onChange={(e) => setTransferAmount(e.target.value)}
                      className="pl-7"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="transfer-note">Note (optional)</Label>
                  <Input
                    id="transfer-note"
                    type="text"
                    placeholder="Transfer note"
                    value={transferNote}
                    onChange={(e) => setTransferNote(e.target.value)}
                  />
                </div>

                <Button type="submit" disabled={recordTransfer.isPending} className="w-full sm:w-auto">
                  {recordTransfer.isPending ? "Processing…" : "Record Transfer"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="goal">
          <Card className="max-w-4xl">
            <CardHeader>
              <CardTitle className="text-base">Contribute to Goal</CardTitle>
            </CardHeader>
            <CardContent>
              {goalError != null && (
                <p role="alert" className="text-destructive text-sm mb-4">{goalError}</p>
              )}
              <form onSubmit={handleGoalContribution} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="goal">Goal</Label>
                  <Select value={goalId} onValueChange={setGoalId}>
                    <SelectTrigger id="goal"><SelectValue placeholder="Select goal" /></SelectTrigger>
                    <SelectContent>
                      {activeGoals.length === 0 ? (
                        <SelectItem value="__no_goals__" disabled>No goals yet. Create one in Planning.</SelectItem>
                      ) : (
                        activeGoals.map((g) => (
                          <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="goalAmount">Amount</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                    <Input
                      id="goalAmount"
                      type="text"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={goalAmountStr}
                      onChange={(e) => setGoalAmountStr(e.target.value)}
                      className="pl-7"
                      required
                    />
                  </div>
                </div>
                <Button type="submit" disabled={recordGoalContrib.isPending} className="w-full sm:w-auto">
                  {recordGoalContrib.isPending ? "Adding…" : "Add Contribution"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="manage">
          <div className="max-w-6xl space-y-3">
            <section className="grid gap-3 sm:grid-cols-3" aria-label="Management summary">
              <div className="rounded-lg border border-border bg-card p-3">
                <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Wallet className="h-4 w-4" />Accounts</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums">{accounts.length}</p>
              </div>
              <div className="rounded-lg border border-border bg-card p-3">
                <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><CreditCard className="h-4 w-4" />Managed balance</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums">{formatMoney(totalManagedBalance, balanceCurrency)}</p>
              </div>
              <div className="rounded-lg border border-border bg-card p-3">
                <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Tags className="h-4 w-4" />Custom categories</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums">{categories.length}</p>
              </div>
            </section>

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
              <Card className="interactive-surface">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-base">
                    Categories
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm"><Plus className="h-4 w-4 mr-1" />New</Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-xl">
                        <DialogHeader>
                          <DialogTitle>Create Category</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleCreateCategory} className="space-y-4 pt-4">
                          {catError != null && <p role="alert" className="text-sm text-destructive">{catError}</p>}
                          <div className="space-y-2">
                            <Label htmlFor="catName">Category name</Label>
                            <Input
                              id="catName"
                              value={newCatName}
                              onChange={(e) => setNewCatName(e.target.value)}
                              placeholder="e.g. Dining Out"
                              required
                            />
                          </div>
                          <Button type="submit" disabled={createCat.isPending} className="w-full sm:w-auto">
                            {createCat.isPending ? "Creating…" : "Create Category"}
                          </Button>
                        </form>
                      </DialogContent>
                    </Dialog>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={catSearch} onChange={(e) => setCatSearch(e.target.value)} placeholder="Search categories" className="pl-9" />
                  </div>
                  {categories.length === 0 ? (
                    <p className="empty-state">No custom categories yet. Create one to organize transactions.</p>
                  ) : filteredCategories.length === 0 ? (
                    <p className="empty-state">No categories match your search.</p>
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
                              aria-label={`Rename ${c.name}`}
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
                              aria-label={`Archive ${c.name}`}
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
                    Accounts
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm"><Plus className="h-4 w-4 mr-1" />New</Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-xl">
                        <DialogHeader>
                          <DialogTitle>Create Account</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleCreateAccount} className="space-y-4 pt-4">
                          {accountError != null && <p role="alert" className="text-sm text-destructive">{accountError}</p>}
                          <div className="space-y-2">
                            <Label htmlFor="accName">Account name</Label>
                            <Input id="accName" value={newAccName} onChange={(e) => setNewAccName(e.target.value)} placeholder="e.g. Orange Money, Checking, Cash" required />
                          </div>
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-2">
                              <Label htmlFor="accType">Type</Label>
                              <Select value={newAccType} onValueChange={setNewAccType}>
                                <SelectTrigger id="accType"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {ACCOUNT_TYPES.map((type) => (
                                    <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="accCurrency">Currency</Label>
                              <AccountCurrencyPicker value={newAccCurrency} onValueChange={setNewAccCurrency} />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="accBalance">Opening balance</Label>
                            <Input id="accBalance" type="text" inputMode="decimal" value={newAccBalance} onChange={(e) => setNewAccBalance(e.target.value)} placeholder="0.00" />
                          </div>
                          <Button type="submit" disabled={createAccount.isPending} className="w-full sm:w-auto">
                            {createAccount.isPending ? "Creating…" : "Create Account"}
                          </Button>
                        </form>
                      </DialogContent>
                    </Dialog>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={accountSearch} onChange={(e) => setAccountSearch(e.target.value)} placeholder="Search accounts" className="pl-9" />
                  </div>
                  {accounts.length === 0 ? (
                    <p className="empty-state">No accounts yet. Create cash, mobile money, bank, or card accounts.</p>
                  ) : filteredAccounts.length === 0 ? (
                    <p className="empty-state">No accounts match your search.</p>
                  ) : (
                    <ul className="space-y-2">
                      {filteredAccounts.map((a) => (
                        <li key={a.id} className="rounded-lg border border-border bg-accent/35 p-3">
                          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold">{a.name}</p>
                              <p className="text-xs capitalize text-muted-foreground">{a.type.replace(/_/g, " ")} &middot; {a.currency}</p>
                            </div>
                            <div className="flex min-w-0 items-center justify-between gap-2 sm:justify-end">
                              <p className="min-w-0 truncate text-sm font-semibold tabular-nums">{formatMoney(a.balance.minorUnits, a.balance.currency)}</p>
                              <div className="flex shrink-0 items-center gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                aria-label={`Edit ${a.name}`}
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
                                aria-label={`Archive ${a.name}`}
                                disabled={archiveAccount.isPending}
                                onClick={() => handleArchiveAccount(a.id, a.name)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                              </div>
                            </div>
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">Opening balance: {formatMoney(a.initialBalance.minorUnits, a.initialBalance.currency)}</p>
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
                  <DialogTitle>Rename Category</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleRenameCategory} className="space-y-4 pt-4">
                  {catError != null && <p role="alert" className="text-sm text-destructive">{catError}</p>}
                  <div className="space-y-2">
                    <Label htmlFor="renameCategoryName">Category name</Label>
                    <Input id="renameCategoryName" value={renameName} onChange={(e) => setRenameName(e.target.value)} placeholder={renameDialog?.name ?? "Category name"} required autoFocus />
                  </div>
                  <Button type="submit" disabled={renameCat.isPending || renameName.trim().length === 0} className="w-full sm:w-auto">
                    {renameCat.isPending ? "Saving…" : "Save Rename"}
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
                  <DialogTitle>Edit Account</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleUpdateAccount} className="space-y-4 pt-4">
                  {accountError != null && <p role="alert" className="text-sm text-destructive">{accountError}</p>}
                  <div className="space-y-2">
                    <Label htmlFor="editAccountName">Account name</Label>
                    <Input id="editAccountName" value={editAccName} onChange={(e) => setEditAccName(e.target.value)} required autoFocus />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="editAccountType">Type</Label>
                    <Select value={editAccType} onValueChange={setEditAccType}>
                      <SelectTrigger id="editAccountType"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ACCOUNT_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="submit" disabled={updateAccount.isPending || editAccName.trim().length === 0} className="w-full sm:w-auto">
                    {updateAccount.isPending ? "Saving…" : "Save Account"}
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
