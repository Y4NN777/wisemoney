import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronsUpDown, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import type { FinancialStateSnapshot } from "@/domain/financialState.ts";
import {
  useArchiveAccount, useArchiveCategory, useCreateAccount, useCreateCategory,
  useRenameCategory, useUpdateAccount,
} from "@/hooks/useFinancialState.ts";
import { categoryDisplayName } from "@/lib/categoryName.ts";
import type { ManageSection } from "@/routes/capture.tsx";
import { formatMoney, parseMajorUnits } from "@/types/money.ts";

type AccountCurrencyOption = {
  code: string;
  name: string;
  region: "Africa" | "Global";
  countries: string;
};

const AFRICAN_CURRENCIES: AccountCurrencyOption[] = [
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

const ACCOUNT_TYPES = ["checking", "savings", "credit", "cash", "mobile_money", "investment"] as const;

function currencyOptions(locale: string): AccountCurrencyOption[] {
  const names = typeof Intl.DisplayNames === "function" ? new Intl.DisplayNames([locale], { type: "currency" }) : null;
  const intlCodes = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("currency") : [];
  const details = new Map(AFRICAN_CURRENCIES.map((currency) => [currency.code, currency]));
  return [...new Set([...intlCodes, ...AFRICAN_CURRENCIES.map(({ code }) => code), "USD", "EUR", "GBP"])]
    .map((code) => {
      const detail = details.get(code);
      return { code, name: names?.of(code) ?? detail?.name ?? code, region: detail?.region ?? "Global" as const, countries: detail?.countries ?? "" };
    })
    .sort((left, right) => left.region === right.region ? left.name.localeCompare(right.name) : left.region === "Africa" ? -1 : 1);
}

function AccountCurrencyPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const options = useMemo(() => currencyOptions(i18n.resolvedLanguage ?? i18n.language), [i18n.language, i18n.resolvedLanguage]);
  const normalized = query.trim().toLowerCase();
  const filtered = options.filter((currency) => normalized === "" || `${currency.code} ${currency.name} ${currency.countries}`.toLowerCase().includes(normalized));
  const selected = options.find(({ code }) => code === value);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (rootRef.current != null && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button id="accCurrency" type="button" aria-expanded={open} aria-haspopup="listbox" onClick={() => setOpen((current) => !current)}
        className="flex min-h-12 w-full items-center justify-between gap-3 border border-input bg-white px-3 py-2 text-left text-sm">
        <span className="min-w-0 truncate font-semibold">{selected == null ? value : `${selected.code} — ${selected.name}`}</span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute inset-x-0 top-[calc(100%+0.25rem)] z-50 border border-border bg-white shadow-lg">
          <div className="border-b border-border p-2">
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("capture.manage.currencySearch", { currency: value })} autoFocus />
          </div>
          <div className="max-h-[min(18rem,42dvh)] overflow-y-auto p-1" role="listbox">
            {filtered.length === 0 ? <p className="p-3 text-sm text-muted-foreground">{t("capture.manage.noCurrency")}</p> : filtered.map((currency) => (
              <button key={currency.code} type="button" role="option" aria-selected={currency.code === value}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-[#F7F7F8]"
                onClick={() => { onChange(currency.code); setOpen(false); setQuery(""); }}>
                <span className="min-w-0 truncate"><strong>{currency.code}</strong> — {currency.name}</span>
                {currency.code === value && <Check className="h-4 w-4 shrink-0 text-ocean-primary" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function ManagementSections({ snapshot, section }: { snapshot: FinancialStateSnapshot; section: ManageSection }) {
  const { t } = useTranslation();
  const categories = snapshot.categories.filter((category) => !category.isArchived);
  const accounts = snapshot.accounts.filter((account) => account.isActive);

  const createCategory = useCreateCategory();
  const renameCategory = useRenameCategory();
  const archiveCategory = useArchiveCategory();
  const createAccount = useCreateAccount();
  const updateAccount = useUpdateAccount();
  const archiveAccount = useArchiveAccount();

  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [accountName, setAccountName] = useState("");
  const [accountType, setAccountType] = useState<string>("checking");
  const [accountCurrency, setAccountCurrency] = useState(snapshot.baseCurrency);
  const [openingBalance, setOpeningBalance] = useState("");
  const [editingAccount, setEditingAccount] = useState<{ id: string; name: string; type: string } | null>(null);

  useEffect(() => { setSearch(""); setError(null); setCreateOpen(false); }, [section]);

  const createCategorySubmit = (event: FormEvent) => {
    event.preventDefault();
    const name = categoryName.trim();
    if (name === "") return;
    createCategory.mutate({ name }, {
      onSuccess: () => { setCategoryName(""); setCreateOpen(false); toast.success(t("capture.manage.categoryCreated"), { description: name }); },
      onError: () => setError(t("capture.manage.errors.failed")),
    });
  };

  const renameCategorySubmit = (event: FormEvent) => {
    event.preventDefault();
    if (renaming == null || categoryName.trim() === "") return;
    renameCategory.mutate({ categoryId: renaming.id, newName: categoryName.trim() }, {
      onSuccess: () => { setRenaming(null); setCategoryName(""); toast.success(t("capture.manage.categoryRenamed")); },
      onError: () => setError(t("capture.manage.errors.renameCategoryFailed")),
    });
  };

  const createAccountSubmit = (event: FormEvent) => {
    event.preventDefault();
    const name = accountName.trim();
    const balance = openingBalance.trim() === "" ? 0 : parseMajorUnits(openingBalance, accountCurrency);
    if (name === "" || balance == null) { setError(t("capture.manage.errorsAccount.validBalance")); return; }
    createAccount.mutate({ name, type: accountType, initialBalance: { minorUnits: balance, currency: accountCurrency } }, {
      onSuccess: () => { setAccountName(""); setOpeningBalance(""); setCreateOpen(false); toast.success(t("capture.manage.accountCreated"), { description: name }); },
      onError: () => setError(t("capture.manage.errorsAccount.failed")),
    });
  };

  const updateAccountSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (editingAccount == null || accountName.trim() === "") return;
    updateAccount.mutate({ accountId: editingAccount.id, name: accountName.trim(), type: accountType }, {
      onSuccess: () => { setEditingAccount(null); setAccountName(""); toast.success(t("capture.manage.accountUpdated")); },
      onError: () => setError(t("capture.manage.errorsAccount.updateFailed")),
    });
  };

  const archiveCategoryItem = (categoryId: string, name: string) => {
    if (!window.confirm(t("capture.manage.confirmArchiveCategory", { name }))) return;
    archiveCategory.mutate({ categoryId }, {
      onSuccess: () => toast.success(t("capture.manage.categoryArchived"), { description: name }),
      onError: () => toast.error(t("capture.manage.errors.archiveCategoryFailed")),
    });
  };

  const archiveAccountItem = (accountId: string, name: string) => {
    if (!window.confirm(t("capture.manage.confirmArchiveAccount", { name }))) return;
    archiveAccount.mutate({ accountId }, {
      onSuccess: () => toast.success(t("capture.manage.accountArchived"), { description: name }),
      onError: () => toast.error(t("capture.manage.errorsAccount.archiveFailed")),
    });
  };

  const normalized = search.trim().toLowerCase();
  const visibleCategories = categories.filter((category) => categoryDisplayName(category, t).toLowerCase().includes(normalized));
  const visibleAccounts = accounts.filter((account) => `${account.name} ${account.type} ${account.currency}`.toLowerCase().includes(normalized));
  const isCategories = section === "categories";

  return (
    <>
      <Card className="overflow-hidden rounded-none border-border shadow-none">
        <CardHeader className="border-b border-border bg-white">
          <CardTitle className="flex items-center justify-between text-base">
            {t(`capture.manage.${section}`)}
            <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); setError(null); }}>
              <DialogTrigger asChild><Button variant="outline" size="sm"><Plus className="mr-1 h-4 w-4" />{t("capture.manage.new")}</Button></DialogTrigger>
              <DialogContent className="sm:max-w-xl">
                <DialogHeader><DialogTitle>{t(isCategories ? "capture.manage.createCategory" : "capture.manage.createAccount")}</DialogTitle></DialogHeader>
                <form onSubmit={isCategories ? createCategorySubmit : createAccountSubmit} className="space-y-4 pt-4">
                  {error != null && <p role="alert" className="text-sm text-destructive">{error}</p>}
                  <div className="space-y-2">
                    <Label htmlFor="manage-name">{t(isCategories ? "capture.manage.categoryName" : "capture.manage.accountName")}</Label>
                    <Input id="manage-name" value={isCategories ? categoryName : accountName} onChange={(event) => isCategories ? setCategoryName(event.target.value) : setAccountName(event.target.value)} required autoFocus />
                  </div>
                  {!isCategories && <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2"><Label htmlFor="accType">{t("capture.manage.accountType")}</Label><Select value={accountType} onValueChange={setAccountType}><SelectTrigger id="accType"><SelectValue /></SelectTrigger><SelectContent>{ACCOUNT_TYPES.map((type) => <SelectItem key={type} value={type}>{t(`capture.manage.accountTypes.${type}`)}</SelectItem>)}</SelectContent></Select></div>
                      <div className="space-y-2"><Label htmlFor="accCurrency">{t("capture.manage.accountCurrency")}</Label><AccountCurrencyPicker value={accountCurrency} onChange={setAccountCurrency} /></div>
                    </div>
                    <div className="space-y-2"><Label htmlFor="openingBalance">{t("capture.manage.accountBalance")}</Label><Input id="openingBalance" inputMode="decimal" value={openingBalance} onChange={(event) => setOpeningBalance(event.target.value)} placeholder="0.00" /></div>
                  </>}
                  <Button type="submit" disabled={createCategory.isPending || createAccount.isPending} className="w-full sm:w-auto">{t(isCategories ? "capture.manage.submit" : "capture.manage.submitAccount")}</Button>
                </form>
              </DialogContent>
            </Dialog>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-4">
          <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t(isCategories ? "capture.manage.searchCategories" : "capture.manage.searchAccounts")} className="pl-9" /></div>
          {isCategories ? (
            visibleCategories.length === 0 ? <p className="empty-state">{t(categories.length === 0 ? "capture.manage.noCategories" : "capture.manage.noCategoryMatch")}</p> :
              <ul className="divide-y divide-border border-y border-border">{visibleCategories.map((category) => {
                const name = categoryDisplayName(category, t);
                return <li key={category.id} className="flex min-h-12 items-center justify-between gap-3 py-2"><span className="min-w-0 truncate text-sm font-medium">{name}</span><div className="flex shrink-0"><Button variant="ghost" size="icon" aria-label={t("capture.manage.renameCategoryAria", { name })} onClick={() => { setError(null); setRenaming({ id: category.id, name: category.name }); setCategoryName(category.name); }}><Pencil /></Button><Button variant="ghost" size="icon" className="text-destructive" aria-label={t("capture.manage.archiveCategoryAria", { name })} disabled={archiveCategory.isPending} onClick={() => archiveCategoryItem(category.id, name)}><Trash2 /></Button></div></li>;
              })}</ul>
          ) : (
            visibleAccounts.length === 0 ? <p className="empty-state">{t(accounts.length === 0 ? "capture.manage.noAccounts" : "capture.manage.noAccountMatch")}</p> :
              <ul className="divide-y divide-border border-y border-border">{visibleAccounts.map((account) => <li key={account.id} className="grid gap-2 py-3 sm:grid-cols-[1fr_auto] sm:items-center"><div className="min-w-0"><p className="truncate text-sm font-semibold">{account.name}</p><p className="text-xs text-muted-foreground">{t(`capture.manage.accountTypes.${account.type}`, { defaultValue: account.type.replace(/_/g, " ") })} · {account.currency}</p></div><div className="flex items-center justify-between gap-2"><strong className="text-sm tabular-nums">{formatMoney(account.balance)}</strong><div className="flex"><Button variant="ghost" size="icon" aria-label={t("capture.manage.editAccountAria", { name: account.name })} onClick={() => { setError(null); setEditingAccount({ id: account.id, name: account.name, type: account.type }); setAccountName(account.name); setAccountType(account.type); }}><Pencil /></Button><Button variant="ghost" size="icon" className="text-destructive" aria-label={t("capture.manage.archiveAccountAria", { name: account.name })} disabled={archiveAccount.isPending} onClick={() => archiveAccountItem(account.id, account.name)}><Trash2 /></Button></div></div></li>)}</ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={renaming != null} onOpenChange={(open) => { if (!open) { setRenaming(null); setCategoryName(""); } }}><DialogContent><DialogHeader><DialogTitle>{t("capture.manage.renameCategory")}</DialogTitle></DialogHeader><form onSubmit={renameCategorySubmit} className="space-y-4 pt-4">{error != null && <p role="alert" className="text-sm text-destructive">{error}</p>}<Label htmlFor="renameCategoryName">{t("capture.manage.categoryName")}</Label><Input id="renameCategoryName" value={categoryName} onChange={(event) => setCategoryName(event.target.value)} autoFocus required /><Button type="submit" disabled={renameCategory.isPending}>{t("capture.manage.saveRename")}</Button></form></DialogContent></Dialog>

      <Dialog open={editingAccount != null} onOpenChange={(open) => { if (!open) { setEditingAccount(null); setAccountName(""); } }}><DialogContent><DialogHeader><DialogTitle>{t("capture.manage.editAccount")}</DialogTitle></DialogHeader><form onSubmit={updateAccountSubmit} className="space-y-4 pt-4">{error != null && <p role="alert" className="text-sm text-destructive">{error}</p>}<div className="space-y-2"><Label htmlFor="editAccountName">{t("capture.manage.accountName")}</Label><Input id="editAccountName" value={accountName} onChange={(event) => setAccountName(event.target.value)} autoFocus required /></div><div className="space-y-2"><Label htmlFor="editAccountType">{t("capture.manage.accountType")}</Label><Select value={accountType} onValueChange={setAccountType}><SelectTrigger id="editAccountType"><SelectValue /></SelectTrigger><SelectContent>{ACCOUNT_TYPES.map((type) => <SelectItem key={type} value={type}>{t(`capture.manage.accountTypes.${type}`)}</SelectItem>)}</SelectContent></Select></div><Button type="submit" disabled={updateAccount.isPending}>{t("capture.manage.saveAccount")}</Button></form></DialogContent></Dialog>
    </>
  );
}
