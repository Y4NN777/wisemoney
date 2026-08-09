/**
 * Money value object.
 *
 * INV-MON-01: every monetary amount stored or transmitted is represented as
 * (integer minor units, ISO-4217 currency code). Floating-point types are
 * prohibited at every storage and transmission boundary.
 *
 * e.g. EUR 12.34 → { minorUnits: 1234, currency: "EUR" }
 */
export type Money = {
  /** Integer minor units (cents, pence, etc.). MUST be a safe integer — no floats. */
  readonly minorUnits: number;
  /** ISO-4217 three-letter currency code, e.g. "EUR", "USD", "GBP". */
  readonly currency: string;
};

/**
 * Runtime guard: throws if `minorUnits` is not a safe integer.
 * Call at every deserialization boundary to enforce INV-MON-01.
 */
function assertValidMoney(value: unknown): asserts value is Money {
  if (
    typeof value !== "object" ||
    value === null ||
    !("minorUnits" in value) ||
    !("currency" in value)
  ) {
    throw new TypeError("Money: expected { minorUnits, currency }");
  }
  const { minorUnits, currency } = value as Record<string, unknown>;
  if (
    typeof minorUnits !== "number" ||
    !Number.isSafeInteger(minorUnits)
  ) {
    throw new TypeError(
      `Money: minorUnits must be a safe integer, got ${String(minorUnits)}`
    );
  }
  if (typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency)) {
    throw new TypeError(
      `Money: currency must be a 3-letter ISO-4217 code, got ${String(currency)}`
    );
  }
}

/**
 * Banker's rounding (half-even) to the nearest integer.
 *
 * - 2.5 → 2 (even floor)
 * - 3.5 → 4 (even ceil)
 * - 1.5 → 2 (even ceil)
 * - 4.5 → 4 (even floor)
 * - 2.51 → 3 (standard round up)
 */
const fractionDigitsCache = new Map<string, number>();

export function currencyFractionDigits(currency: string): number {
  const cached = fractionDigitsCache.get(currency);
  if (cached != null) return cached;
  assertValidMoney({ minorUnits: 0, currency });
  let digits = 2;
  try {
    digits = new Intl.NumberFormat("en", { style: "currency", currency })
      .resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    // ISO-like private/test codes retain the conventional two-digit fallback.
  }
  fractionDigitsCache.set(currency, digits);
  return digits;
}

function pow10(exponent: number): bigint {
  return 10n ** BigInt(exponent);
}

function parsePositiveDecimal(value: string): { numerator: bigint; denominator: bigint } {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    throw new Error(`convertMoney: invalid rate string "${value}"`);
  }
  const [whole = "0", fraction = ""] = normalized.split(".");
  const numerator = BigInt(`${whole}${fraction}`);
  if (numerator <= 0n) {
    throw new Error(`convertMoney: invalid rate string "${value}"`);
  }
  return { numerator, denominator: pow10(fraction.length) };
}

function divideHalfEven(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error("divideHalfEven: denominator must be positive");
  const sign = numerator < 0n ? -1n : 1n;
  const absolute = numerator < 0n ? -numerator : numerator;
  const quotient = absolute / denominator;
  const remainder = absolute % denominator;
  const doubled = remainder * 2n;
  const rounded = doubled < denominator || (doubled === denominator && quotient % 2n === 0n)
    ? quotient
    : quotient + 1n;
  return rounded * sign;
}

/**
 * Convert a Money value into a target currency using a cached FX rate string.
 *
 * Rate is a high-precision decimal string, never a float (INV-MON-01).
 * Uses banker's rounding (half-even) to the target currency's minor unit.
 * Reads from the local fxRates cache — never a live network call (INV-MON-03).
 *
 * @param amount   - source Money value
 * @param toCode   - ISO-4217 target currency
 * @param rateStr  - high-precision decimal rate string from fxRates store
 */
export function convertMoney(
  amount: Money,
  toCode: string,
  rateStr: string,
  inverse = false
): Money {
  assertValidMoney(amount);
  assertValidMoney({ minorUnits: 0, currency: toCode });
  if (amount.currency === toCode) return { ...amount };

  const rate = parsePositiveDecimal(rateStr);
  const sourceScale = pow10(currencyFractionDigits(amount.currency));
  const targetScale = pow10(currencyFractionDigits(toCode));
  const numerator = BigInt(amount.minorUnits) * targetScale *
    (inverse ? rate.denominator : rate.numerator);
  const denominator = sourceScale *
    (inverse ? rate.numerator : rate.denominator);
  const converted = divideHalfEven(numerator, denominator);
  const result = Number(converted);
  if (!Number.isSafeInteger(result)) {
    throw new Error("convertMoney: conversion overflow");
  }
  return { minorUnits: result, currency: toCode };
}

export function formatMoney(
  amount: Money,
  locale?: string
): string {
  assertValidMoney(amount);
  const digits = currencyFractionDigits(amount.currency);
  const displayLocale = locale ?? (typeof document === "undefined" ? undefined : document.documentElement.lang || undefined);
  return new Intl.NumberFormat(displayLocale, {
    style: "currency",
    currency: amount.currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amount.minorUnits / 10 ** digits);
}

export function parseMajorUnits(input: string, currency: string): number | null {
  const digits = currencyFractionDigits(currency);
  const normalized = input.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const [whole = "0", fraction = ""] = normalized.split(".");
  if (fraction.length > digits) return null;
  const value = BigInt(whole) * pow10(digits) + BigInt(fraction.padEnd(digits, "0") || "0");
  const result = Number(value);
  return Number.isSafeInteger(result) ? result : null;
}

export function currencyInputStep(currency: string): string {
  const digits = currencyFractionDigits(currency);
  return digits === 0 ? "1" : `0.${"0".repeat(digits - 1)}1`;
}
