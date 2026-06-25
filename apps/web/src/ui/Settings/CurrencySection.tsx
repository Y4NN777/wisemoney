import { useMemo, useState, useEffect } from "react";
import { useMasterKey } from "../../lib/masterKeyContext.ts";
import type { MasterKey } from "../../crypto/envelope.ts";
import { seal, open } from "../../crypto/envelope.ts";
import { db } from "../../db/schema.ts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Input } from "../../components/ui/input.tsx";
import { Label } from "../../components/ui/label.tsx";
import { toast } from "sonner";
import { DollarSign, Plus, Trash2, RefreshCw, Check, ChevronsUpDown, Search } from "lucide-react";

type CurrencyOption = {
  code: string;
  name: string;
  region: "Africa" | "Global" | "Precious metals";
  countries: string;
};

const STATIC_CURRENCY_DETAILS: CurrencyOption[] = [
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
  { code: "STN", name: "Sao Tome and Principe Dobra", region: "Africa", countries: "Sao Tome Principe São Tomé Príncipe" },
  { code: "SCR", name: "Seychellois Rupee", region: "Africa", countries: "Seychelles" },
  { code: "SLE", name: "Sierra Leonean Leone", region: "Africa", countries: "Sierra Leone" },
  { code: "SOS", name: "Somali Shilling", region: "Africa", countries: "Somalia" },
  { code: "ZAR", name: "South African Rand", region: "Africa", countries: "South Africa Lesotho Namibia Eswatini" },
  { code: "SSP", name: "South Sudanese Pound", region: "Africa", countries: "South Sudan" },
  { code: "SDG", name: "Sudanese Pound", region: "Africa", countries: "Sudan" },
  { code: "SZL", name: "Swazi Lilangeni", region: "Africa", countries: "Eswatini Swaziland" },
  { code: "TZS", name: "Tanzanian Shilling", region: "Africa", countries: "Tanzania" },
  { code: "TND", name: "Tunisian Dinar", region: "Africa", countries: "Tunisia" },
  { code: "UGX", name: "Ugandan Shilling", region: "Africa", countries: "Uganda" },
  { code: "XAF", name: "Central African CFA Franc", region: "Africa", countries: "Cameroon Central African Republic Chad Republic of Congo Equatorial Guinea Gabon CEMAC" },
  { code: "XOF", name: "West African CFA Franc", region: "Africa", countries: "Benin Burkina Faso Guinea-Bissau Ivory Coast Cote d'Ivoire Mali Niger Senegal Togo WAEMU UEMOA" },
  { code: "ZMW", name: "Zambian Kwacha", region: "Africa", countries: "Zambia" },
  { code: "ZWL", name: "Zimbabwean Dollar", region: "Africa", countries: "Zimbabwe" },
  { code: "USD", name: "US Dollar", region: "Global", countries: "United States Ecuador El Salvador Panama Timor-Leste Zimbabwe" },
  { code: "EUR", name: "Euro", region: "Global", countries: "Eurozone European Union France Germany Italy Spain Netherlands Belgium Portugal Ireland Austria Finland Greece" },
  { code: "GBP", name: "Pound Sterling", region: "Global", countries: "United Kingdom England Scotland Wales Northern Ireland" },
  { code: "JPY", name: "Japanese Yen", region: "Global", countries: "Japan" },
  { code: "CHF", name: "Swiss Franc", region: "Global", countries: "Switzerland Liechtenstein" },
  { code: "CAD", name: "Canadian Dollar", region: "Global", countries: "Canada" },
  { code: "AUD", name: "Australian Dollar", region: "Global", countries: "Australia Kiribati Nauru Tuvalu" },
  { code: "NZD", name: "New Zealand Dollar", region: "Global", countries: "New Zealand Cook Islands Niue Tokelau Pitcairn" },
  { code: "AED", name: "UAE Dirham", region: "Global", countries: "United Arab Emirates UAE" },
  { code: "AFN", name: "Afghan Afghani", region: "Global", countries: "Afghanistan" },
  { code: "ALL", name: "Albanian Lek", region: "Global", countries: "Albania" },
  { code: "AMD", name: "Armenian Dram", region: "Global", countries: "Armenia" },
  { code: "ANG", name: "Netherlands Antillean Guilder", region: "Global", countries: "Curacao Sint Maarten" },
  { code: "ARS", name: "Argentine Peso", region: "Global", countries: "Argentina" },
  { code: "AWG", name: "Aruban Florin", region: "Global", countries: "Aruba" },
  { code: "AZN", name: "Azerbaijani Manat", region: "Global", countries: "Azerbaijan" },
  { code: "BAM", name: "Bosnia and Herzegovina Convertible Mark", region: "Global", countries: "Bosnia Herzegovina" },
  { code: "BBD", name: "Barbadian Dollar", region: "Global", countries: "Barbados" },
  { code: "BDT", name: "Bangladeshi Taka", region: "Global", countries: "Bangladesh" },
  { code: "BGN", name: "Bulgarian Lev", region: "Global", countries: "Bulgaria" },
  { code: "BHD", name: "Bahraini Dinar", region: "Global", countries: "Bahrain" },
  { code: "BMD", name: "Bermudian Dollar", region: "Global", countries: "Bermuda" },
  { code: "BND", name: "Brunei Dollar", region: "Global", countries: "Brunei Singapore" },
  { code: "BOB", name: "Bolivian Boliviano", region: "Global", countries: "Bolivia" },
  { code: "BRL", name: "Brazilian Real", region: "Global", countries: "Brazil" },
  { code: "BSD", name: "Bahamian Dollar", region: "Global", countries: "Bahamas" },
  { code: "BTN", name: "Bhutanese Ngultrum", region: "Global", countries: "Bhutan" },
  { code: "BYN", name: "Belarusian Ruble", region: "Global", countries: "Belarus" },
  { code: "BZD", name: "Belize Dollar", region: "Global", countries: "Belize" },
  { code: "CLP", name: "Chilean Peso", region: "Global", countries: "Chile" },
  { code: "CNY", name: "Chinese Yuan", region: "Global", countries: "China" },
  { code: "COP", name: "Colombian Peso", region: "Global", countries: "Colombia" },
  { code: "CRC", name: "Costa Rican Colon", region: "Global", countries: "Costa Rica" },
  { code: "CUP", name: "Cuban Peso", region: "Global", countries: "Cuba" },
  { code: "CZK", name: "Czech Koruna", region: "Global", countries: "Czechia Czech Republic" },
  { code: "DKK", name: "Danish Krone", region: "Global", countries: "Denmark Faroe Islands Greenland" },
  { code: "DOP", name: "Dominican Peso", region: "Global", countries: "Dominican Republic" },
  { code: "FJD", name: "Fijian Dollar", region: "Global", countries: "Fiji" },
  { code: "GEL", name: "Georgian Lari", region: "Global", countries: "Georgia" },
  { code: "GTQ", name: "Guatemalan Quetzal", region: "Global", countries: "Guatemala" },
  { code: "GYD", name: "Guyanese Dollar", region: "Global", countries: "Guyana" },
  { code: "HKD", name: "Hong Kong Dollar", region: "Global", countries: "Hong Kong" },
  { code: "HNL", name: "Honduran Lempira", region: "Global", countries: "Honduras" },
  { code: "HRK", name: "Croatian Kuna", region: "Global", countries: "Croatia historic" },
  { code: "HTG", name: "Haitian Gourde", region: "Global", countries: "Haiti" },
  { code: "HUF", name: "Hungarian Forint", region: "Global", countries: "Hungary" },
  { code: "IDR", name: "Indonesian Rupiah", region: "Global", countries: "Indonesia" },
  { code: "ILS", name: "Israeli New Shekel", region: "Global", countries: "Israel Palestinian territories" },
  { code: "INR", name: "Indian Rupee", region: "Global", countries: "India Bhutan Nepal" },
  { code: "IQD", name: "Iraqi Dinar", region: "Global", countries: "Iraq" },
  { code: "IRR", name: "Iranian Rial", region: "Global", countries: "Iran" },
  { code: "ISK", name: "Icelandic Krona", region: "Global", countries: "Iceland" },
  { code: "JMD", name: "Jamaican Dollar", region: "Global", countries: "Jamaica" },
  { code: "JOD", name: "Jordanian Dinar", region: "Global", countries: "Jordan Palestinian territories" },
  { code: "KGS", name: "Kyrgyzstani Som", region: "Global", countries: "Kyrgyzstan" },
  { code: "KHR", name: "Cambodian Riel", region: "Global", countries: "Cambodia" },
  { code: "KPW", name: "North Korean Won", region: "Global", countries: "North Korea" },
  { code: "KRW", name: "South Korean Won", region: "Global", countries: "South Korea" },
  { code: "KWD", name: "Kuwaiti Dinar", region: "Global", countries: "Kuwait" },
  { code: "KYD", name: "Cayman Islands Dollar", region: "Global", countries: "Cayman Islands" },
  { code: "KZT", name: "Kazakhstani Tenge", region: "Global", countries: "Kazakhstan" },
  { code: "LAK", name: "Lao Kip", region: "Global", countries: "Laos" },
  { code: "LBP", name: "Lebanese Pound", region: "Global", countries: "Lebanon" },
  { code: "LKR", name: "Sri Lankan Rupee", region: "Global", countries: "Sri Lanka" },
  { code: "MDL", name: "Moldovan Leu", region: "Global", countries: "Moldova" },
  { code: "MKD", name: "Macedonian Denar", region: "Global", countries: "North Macedonia" },
  { code: "MMK", name: "Myanmar Kyat", region: "Global", countries: "Myanmar Burma" },
  { code: "MNT", name: "Mongolian Togrog", region: "Global", countries: "Mongolia" },
  { code: "MOP", name: "Macanese Pataca", region: "Global", countries: "Macau Macao" },
  { code: "MVR", name: "Maldivian Rufiyaa", region: "Global", countries: "Maldives" },
  { code: "MXN", name: "Mexican Peso", region: "Global", countries: "Mexico" },
  { code: "MYR", name: "Malaysian Ringgit", region: "Global", countries: "Malaysia" },
  { code: "NIO", name: "Nicaraguan Cordoba", region: "Global", countries: "Nicaragua" },
  { code: "NOK", name: "Norwegian Krone", region: "Global", countries: "Norway Svalbard" },
  { code: "NPR", name: "Nepalese Rupee", region: "Global", countries: "Nepal" },
  { code: "OMR", name: "Omani Rial", region: "Global", countries: "Oman" },
  { code: "PAB", name: "Panamanian Balboa", region: "Global", countries: "Panama" },
  { code: "PEN", name: "Peruvian Sol", region: "Global", countries: "Peru" },
  { code: "PGK", name: "Papua New Guinean Kina", region: "Global", countries: "Papua New Guinea" },
  { code: "PHP", name: "Philippine Peso", region: "Global", countries: "Philippines" },
  { code: "PKR", name: "Pakistani Rupee", region: "Global", countries: "Pakistan" },
  { code: "PLN", name: "Polish Zloty", region: "Global", countries: "Poland" },
  { code: "PYG", name: "Paraguayan Guarani", region: "Global", countries: "Paraguay" },
  { code: "QAR", name: "Qatari Riyal", region: "Global", countries: "Qatar" },
  { code: "RON", name: "Romanian Leu", region: "Global", countries: "Romania" },
  { code: "RSD", name: "Serbian Dinar", region: "Global", countries: "Serbia" },
  { code: "RUB", name: "Russian Ruble", region: "Global", countries: "Russia" },
  { code: "SAR", name: "Saudi Riyal", region: "Global", countries: "Saudi Arabia" },
  { code: "SEK", name: "Swedish Krona", region: "Global", countries: "Sweden" },
  { code: "SGD", name: "Singapore Dollar", region: "Global", countries: "Singapore Brunei" },
  { code: "SYP", name: "Syrian Pound", region: "Global", countries: "Syria" },
  { code: "THB", name: "Thai Baht", region: "Global", countries: "Thailand" },
  { code: "TJS", name: "Tajikistani Somoni", region: "Global", countries: "Tajikistan" },
  { code: "TMT", name: "Turkmenistani Manat", region: "Global", countries: "Turkmenistan" },
  { code: "TOP", name: "Tongan Pa'anga", region: "Global", countries: "Tonga" },
  { code: "TRY", name: "Turkish Lira", region: "Global", countries: "Turkey Turkiye Northern Cyprus" },
  { code: "TTD", name: "Trinidad and Tobago Dollar", region: "Global", countries: "Trinidad Tobago" },
  { code: "TWD", name: "New Taiwan Dollar", region: "Global", countries: "Taiwan" },
  { code: "UAH", name: "Ukrainian Hryvnia", region: "Global", countries: "Ukraine" },
  { code: "UYU", name: "Uruguayan Peso", region: "Global", countries: "Uruguay" },
  { code: "UZS", name: "Uzbekistani Som", region: "Global", countries: "Uzbekistan" },
  { code: "VES", name: "Venezuelan Bolivar", region: "Global", countries: "Venezuela" },
  { code: "VND", name: "Vietnamese Dong", region: "Global", countries: "Vietnam" },
  { code: "WST", name: "Samoan Tala", region: "Global", countries: "Samoa" },
  { code: "XCD", name: "East Caribbean Dollar", region: "Global", countries: "Anguilla Antigua Barbuda Dominica Grenada Montserrat Saint Kitts Nevis Saint Lucia Saint Vincent Grenadines" },
  { code: "YER", name: "Yemeni Rial", region: "Global", countries: "Yemen" },
  { code: "XAU", name: "Gold", region: "Precious metals", countries: "Gold troy ounce" },
  { code: "XAG", name: "Silver", region: "Precious metals", countries: "Silver troy ounce" },
] as const;

const FALLBACK_CURRENCY_CODES = [
  "AED", "AFN", "ALL", "AMD", "ANG", "AOA", "ARS", "AUD", "AWG", "AZN",
  "BAM", "BBD", "BDT", "BGN", "BHD", "BIF", "BMD", "BND", "BOB", "BRL",
  "BSD", "BTN", "BWP", "BYN", "BZD", "CAD", "CDF", "CHF", "CLP", "CNY",
  "COP", "CRC", "CUP", "CVE", "CZK", "DJF", "DKK", "DOP", "DZD", "EGP",
  "ERN", "ETB", "EUR", "FJD", "GBP", "GEL", "GHS", "GMD", "GNF", "GTQ",
  "GYD", "HKD", "HNL", "HTG", "HUF", "IDR", "ILS", "INR", "IQD", "IRR",
  "ISK", "JMD", "JOD", "JPY", "KES", "KGS", "KHR", "KMF", "KPW", "KRW",
  "KWD", "KYD", "KZT", "LAK", "LBP", "LKR", "LRD", "LSL", "LYD", "MAD",
  "MDL", "MGA", "MKD", "MMK", "MNT", "MOP", "MRU", "MUR", "MVR", "MWK",
  "MXN", "MYR", "MZN", "NAD", "NGN", "NIO", "NOK", "NPR", "NZD", "OMR",
  "PAB", "PEN", "PGK", "PHP", "PKR", "PLN", "PYG", "QAR", "RON", "RSD",
  "RUB", "RWF", "SAR", "SCR", "SDG", "SEK", "SGD", "SLE", "SOS", "SSP",
  "STN", "SYP", "SZL", "THB", "TJS", "TMT", "TND", "TOP", "TRY", "TTD",
  "TWD", "TZS", "UAH", "UGX", "USD", "UYU", "UZS", "VES", "VND", "WST",
  "XAF", "XAG", "XAU", "XCD", "XOF", "YER", "ZAR", "ZMW", "ZWL",
] as const;

const AFRICAN_CURRENCY_CODES = new Set(STATIC_CURRENCY_DETAILS.filter((currency) => currency.region === "Africa").map((currency) => currency.code));
const METAL_CURRENCY_CODES = new Set(STATIC_CURRENCY_DETAILS.filter((currency) => currency.region === "Precious metals").map((currency) => currency.code));

const CURRENCY_OPTIONS = buildCurrencyOptions();

function getCurrencyName(code: string): string {
  return CURRENCY_OPTIONS.find((currency) => currency.code === code)?.name ?? code;
}

function buildCurrencyOptions(): CurrencyOption[] {
  const detailsByCode = new Map(STATIC_CURRENCY_DETAILS.map((currency) => [currency.code, currency]));
  const displayNames = typeof Intl.DisplayNames === "function"
    ? new Intl.DisplayNames([navigator.language || "en"], { type: "currency" })
    : null;
  const intlCodes = typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("currency")
    : [];
  const codes = Array.from(new Set([...intlCodes, ...FALLBACK_CURRENCY_CODES])).sort();

  return codes
    .map((code) => {
      const details = detailsByCode.get(code);
      const region: CurrencyOption["region"] = details?.region ?? (AFRICAN_CURRENCY_CODES.has(code) ? "Africa" : METAL_CURRENCY_CODES.has(code) ? "Precious metals" : "Global");
      return {
        code,
        name: details?.name ?? displayNames?.of(code) ?? code,
        region,
        countries: details?.countries ?? "",
      };
    })
    .sort((a, b) => {
      const regionRank = (currency: CurrencyOption) => currency.region === "Africa" ? 0 : currency.region === "Global" ? 1 : 2;
      const rankDiff = regionRank(a) - regionRank(b);
      return rankDiff !== 0 ? rankDiff : a.name.localeCompare(b.name);
    });
}

function CurrencyOptionLabel({ code, compact = false }: { code: string; compact?: boolean }) {
  const name = getCurrencyName(code);
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="shrink-0 rounded-md bg-ocean-wash px-2 py-0.5 text-xs font-semibold text-ocean-dark">
        {code}
      </span>
      {!compact && <span className="truncate text-sm">{name}</span>}
    </span>
  );
}

function CurrencySelect({ id, value, onValueChange, compact = false }: { id: string; value: string; onValueChange: (value: string) => void; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = CURRENCY_OPTIONS.find((currency) => currency.code === value);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (normalized.length === 0) return CURRENCY_OPTIONS;
    return CURRENCY_OPTIONS.filter((currency) =>
      currency.code.toLowerCase().includes(normalized) ||
      currency.name.toLowerCase().includes(normalized) ||
      currency.region.toLowerCase().includes(normalized) ||
      currency.countries.toLowerCase().includes(normalized)
    );
  }, [query]);

  const grouped = useMemo(() => ({
    Africa: filtered.filter((currency) => currency.region === "Africa"),
    Global: filtered.filter((currency) => currency.region === "Global"),
    "Precious metals": filtered.filter((currency) => currency.region === "Precious metals"),
  }), [filtered]);

  const chooseCurrency = (code: string) => {
    onValueChange(code);
    setOpen(false);
    setQuery("");
  };

  return (
    <div className="relative">
      <Button
        id={id}
        type="button"
        variant="outline"
        className={`h-auto min-h-10 w-full justify-between px-3 py-2 text-left ${compact ? "min-w-28" : "min-h-12"}`}
        onClick={() => setOpen((next) => !next)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <CurrencyOptionLabel code={selected?.code ?? value} compact={compact} />
        <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
      </Button>
      {open && (
        <div className="absolute left-0 right-0 z-50 mt-2 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-lg">
          <div className="border-b border-border p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search code, currency, or country"
                className="pl-9"
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-[min(360px,55dvh)] overflow-y-auto p-1" role="listbox" aria-label="Currencies">
            {filtered.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">No matching currency.</p>
            ) : (
              (Object.entries(grouped) as Array<[CurrencyOption["region"], CurrencyOption[]]>).map(([region, currencies]) => currencies.length > 0 && (
                <div key={region}>
                  <p className="px-2 py-1.5 text-xs font-semibold uppercase text-muted-foreground">{region}</p>
                  {currencies.map((currency) => (
                    <button
                      key={currency.code}
                      type="button"
                      className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-accent focus:bg-accent focus:outline-none"
                      onClick={() => chooseCurrency(currency.code)}
                      role="option"
                      aria-selected={currency.code === value}
                    >
                      <span className="min-w-0">
                        <CurrencyOptionLabel code={currency.code} />
                        {currency.countries.length > 0 && (
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{currency.countries}</span>
                        )}
                      </span>
                      {currency.code === value && <Check className="h-4 w-4 text-ocean-primary" />}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

type FxRateEntry = {
  id: string;
  base: string;
  quote: string;
  rate: string;
  updated: number;
};

async function loadRates(masterKey: MasterKey): Promise<FxRateEntry[]> {
  const records = await db.fxRates.toArray();
  const entries: FxRateEntry[] = [];
  for (const record of records) {
    try {
      const plaintext = await open(
        { ciphertext: record.ciphertext, iv: record.iv },
        masterKey,
      );
      const text = new TextDecoder().decode(plaintext);
      entries.push({
        id: record.id,
        base: record.baseCurrency,
        quote: record.quoteCurrency,
        rate: text,
        updated: record.lastUpdated,
      });
    } catch {
      // skip corrupted records silently
    }
  }
  return entries.sort((a, b) => a.id.localeCompare(b.id));
}

async function saveRate(
  baseCurrency: string,
  quoteCurrency: string,
  rateStr: string,
  masterKey: MasterKey,
): Promise<void> {
  const id = `${baseCurrency}/${quoteCurrency}`;
  const plaintext = new TextEncoder().encode(rateStr);
  const envelope = await seal(plaintext, masterKey);
  await db.fxRates.put({
    id,
    baseCurrency,
    quoteCurrency,
    lastUpdated: Date.now(),
    ciphertext: envelope.ciphertext,
    iv: envelope.iv,
  });
}

async function deleteRate(id: string): Promise<void> {
  await db.fxRates.delete(id);
}

export default function CurrencySection() {
  const masterKey = useMasterKey();
  const [rates, setRates] = useState<FxRateEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [newBase, setNewBase] = useState("EUR");
  const [newQuote, setNewQuote] = useState("USD");
  const [newRate, setNewRate] = useState("");
  const [defaultCurrency, setDefaultCurrency] = useState(() => {
    return localStorage.getItem("wisemoney_default_currency") ?? "USD";
  });
  const [saving, setSaving] = useState(false);

  const refreshRates = async () => {
    setLoading(true);
    try {
      const loaded = await loadRates(masterKey);
      setRates(loaded);
    } catch (err) {
      toast.error("Failed to load exchange rates", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshRates();
  }, [masterKey]);

  const handleDefaultCurrencyChange = (value: string) => {
    setDefaultCurrency(value);
    localStorage.setItem("wisemoney_default_currency", value);
    toast.success(`Default currency changed to ${value}`, {
      description: "Your default currency has been updated",
    });
  };

  const handleAddRate = async () => {
    if (newBase === newQuote) {
      toast.error("Base and quote currencies must differ");
      return;
    }
    const parsed = parseFloat(newRate);
    if (!isFinite(parsed) || parsed <= 0) {
      toast.error("Invalid rate", {
        description: "Rate must be a positive number",
      });
      return;
    }
    setSaving(true);
    try {
      await saveRate(newBase, newQuote, newRate, masterKey);
      toast.success(`Rate added: ${newBase}/${newQuote} = ${newRate}`);
      setNewRate("");
      await refreshRates();
    } catch (err) {
      toast.error("Failed to save rate", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRate = async (id: string) => {
    try {
      await deleteRate(id);
      toast.success("Rate removed");
      await refreshRates();
    } catch (err) {
      toast.error("Failed to remove rate", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          Currency Settings
        </CardTitle>
        <CardDescription>
          Set your default currency and manage foreign exchange rates
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Default currency */}
        <div className="space-y-2 rounded-lg border border-border bg-accent/35 p-3">
          <Label htmlFor="default-currency">Default Currency</Label>
          <CurrencySelect id="default-currency" value={defaultCurrency} onValueChange={handleDefaultCurrencyChange} />
          <p className="text-xs text-muted-foreground">
            African currencies are listed first. All new accounts will use this currency. Existing accounts are unaffected.
          </p>
        </div>

        {/* FX Rate table */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Exchange Rates</h3>
            <Button variant="ghost" size="sm" onClick={() => void refreshRates()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>

          {rates.length === 0 && !loading && (
            <p className="empty-state py-4">
              No exchange rates configured. Add one below.
            </p>
          )}

          {rates.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-border bg-card divide-y divide-border">
              {rates.map((entry) => (
                <div key={entry.id} className="interactive-surface flex items-center justify-between px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">{entry.id}</p>
                    <p className="text-xs text-muted-foreground">
                      {getCurrencyName(entry.base)} to {getCurrencyName(entry.quote)} &middot; {new Date(entry.updated).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm tabular-nums">{entry.rate}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => { void handleDeleteRate(entry.id); }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add new rate */}
          <div className="rounded-lg border border-border bg-accent/45 p-3">
            <p className="text-xs font-medium text-muted-foreground">Add Rate</p>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_120px_auto] sm:items-end">
              <div className="space-y-1">
                <Label htmlFor="rate-base" className="text-xs">From</Label>
                <CurrencySelect id="rate-base" value={newBase} onValueChange={setNewBase} compact />
              </div>
              <div className="space-y-1">
                <Label htmlFor="rate-quote" className="text-xs">To</Label>
                <CurrencySelect id="rate-quote" value={newQuote} onValueChange={setNewQuote} compact />
              </div>
              <div className="space-y-1">
                <Label htmlFor="rate-value" className="text-xs">Rate</Label>
                <Input
                  id="rate-value"
                  type="text"
                  placeholder="0.85"
                  value={newRate}
                  onChange={(e) => setNewRate(e.target.value)}
                  className="w-full"
                />
              </div>
              <Button
                size="sm"
                onClick={() => void handleAddRate()}
                disabled={saving || newRate.length === 0}
                className="w-full sm:w-9"
              >
                {saving ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Exchange rates are stored encrypted on this device (INV-MON-03). They
          are never sent to the server. Conversions use banker&apos;s rounding
          (half-even) applied to the decimal rate string.
        </p>
      </CardContent>
    </Card>
  );
}
