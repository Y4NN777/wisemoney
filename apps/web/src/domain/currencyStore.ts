import type { MasterKey } from "@/crypto/envelope.ts";
import { open, seal } from "@/crypto/envelope.ts";
import { db } from "@/db/schema.ts";
import type { Money } from "@/types/money.ts";
import { convertMoney } from "@/types/money.ts";

const DEFAULT_CURRENCY_STORAGE_KEY = "wisemoney_default_currency";
const BASE_CURRENCY_SETTING_ID = "baseCurrency";

type FxRate = {
  id: string;
  baseCurrency: string;
  quoteCurrency: string;
  rate: string;
  lastUpdated: number;
};

export type CurrencyContext = {
  baseCurrency: string;
  rates: ReadonlyMap<string, FxRate>;
  fingerprint: string;
};

function getLegacyBaseCurrency(): string | null {
  if (typeof localStorage === "undefined") return null;
  const value = localStorage.getItem(DEFAULT_CURRENCY_STORAGE_KEY);
  return value != null && /^[A-Z]{3}$/.test(value) ? value : null;
}

export async function setStoredBaseCurrency(currency: string, masterKey: MasterKey): Promise<void> {
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Invalid base currency");
  const plaintext = new TextEncoder().encode(currency);
  let envelope;
  try {
    envelope = await seal(plaintext, masterKey);
  } finally {
    plaintext.fill(0);
  }
  await db.appSettings.put({
    id: BASE_CURRENCY_SETTING_ID,
    ciphertext: envelope.ciphertext,
    iv: envelope.iv,
  });
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(DEFAULT_CURRENCY_STORAGE_KEY);
  }
}

async function loadBaseCurrency(masterKey: MasterKey, fallbackCurrency: string): Promise<string> {
  const record = await db.appSettings.get(BASE_CURRENCY_SETTING_ID);
  if (record != null) {
    const plaintext = await open({ ciphertext: record.ciphertext, iv: record.iv }, masterKey);
    try {
      const value = new TextDecoder().decode(plaintext);
      if (!/^[A-Z]{3}$/.test(value)) throw new Error("Invalid stored base currency");
      return value;
    } finally {
      plaintext.fill(0);
    }
  }

  const legacyCurrency = getLegacyBaseCurrency();
  if (legacyCurrency != null) {
    await setStoredBaseCurrency(legacyCurrency, masterKey);
    return legacyCurrency;
  }
  return fallbackCurrency;
}

export async function loadCurrencyContext(
  masterKey: MasterKey,
  fallbackCurrency = "XOF"
): Promise<CurrencyContext> {
  const records = await db.fxRates.toArray();
  const rates = new Map<string, FxRate>();
  for (const record of records) {
    const plaintext = await open(
      { ciphertext: record.ciphertext, iv: record.iv },
      masterKey
    );
    let rate: string;
    try {
      rate = new TextDecoder().decode(plaintext);
    } finally {
      plaintext.fill(0);
    }
    // Validation and exact decimal parsing happen in convertMoney.
    convertMoney({ minorUnits: 1, currency: record.baseCurrency }, record.quoteCurrency, rate);
    rates.set(record.id, {
      id: record.id,
      baseCurrency: record.baseCurrency,
      quoteCurrency: record.quoteCurrency,
      rate,
      lastUpdated: record.lastUpdated,
    });
  }

  const baseCurrency = await loadBaseCurrency(masterKey, fallbackCurrency);
  const fingerprint = [
    baseCurrency,
    ...[...rates.values()]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((rate) => `${rate.id}:${rate.lastUpdated}:${rate.rate}`),
  ].join("|");
  return { baseCurrency, rates, fingerprint };
}

export function convertUsingContext(
  amount: Money,
  targetCurrency: string,
  context: Pick<CurrencyContext, "rates">
): Money | null {
  if (amount.currency === targetCurrency) return { ...amount };
  const direct = context.rates.get(`${amount.currency}/${targetCurrency}`);
  if (direct != null) return convertMoney(amount, targetCurrency, direct.rate);
  const inverse = context.rates.get(`${targetCurrency}/${amount.currency}`);
  if (inverse != null) return convertMoney(amount, targetCurrency, inverse.rate, true);
  return null;
}

export async function saveFxRate(
  baseCurrency: string,
  quoteCurrency: string,
  rate: string,
  masterKey: MasterKey
): Promise<void> {
  if (baseCurrency === quoteCurrency) throw new Error("Currencies must differ");
  convertMoney({ minorUnits: 1, currency: baseCurrency }, quoteCurrency, rate);
  const plaintext = new TextEncoder().encode(rate.trim());
  let envelope;
  try {
    envelope = await seal(plaintext, masterKey);
  } finally {
    plaintext.fill(0);
  }
  await db.fxRates.put({
    id: `${baseCurrency}/${quoteCurrency}`,
    baseCurrency,
    quoteCurrency,
    lastUpdated: Date.now(),
    ciphertext: envelope.ciphertext,
    iv: envelope.iv,
  });
}

export async function deleteFxRate(id: string): Promise<void> {
  await db.fxRates.delete(id);
}
