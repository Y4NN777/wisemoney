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
export function assertValidMoney(value: unknown): asserts value is Money {
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
 * Construct a Money value with runtime validation.
 * Prefer this over object literals so the guard always runs.
 */
export function money(minorUnits: number, currency: string): Money {
  assertValidMoney({ minorUnits, currency });
  return { minorUnits, currency };
}

// ---------------------------------------------------------------------------
// Arithmetic — INV-MON-01: integer minor units only, no floats
// ---------------------------------------------------------------------------

/**
 * Add two Money values.
 * Throws if currencies differ — use FX conversion before adding cross-currency.
 */
export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new Error(
      `addMoney: currency mismatch (${a.currency} vs ${b.currency}) — convert before adding`
    );
  }
  const result = a.minorUnits + b.minorUnits;
  if (!Number.isSafeInteger(result)) {
    throw new Error("addMoney: overflow — result is not a safe integer");
  }
  return { minorUnits: result, currency: a.currency };
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
function roundHalfEven(n: number): number {
  const integer = Math.trunc(n);
  const fraction = Math.abs(n - integer);
  if (fraction !== 0.5) return Math.round(n);
  return integer % 2 === 0 ? integer : integer + (n >= 0 ? 1 : -1);
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
  rateStr: string
): Money {
  const parsed = parseFloat(rateStr);
  if (!isFinite(parsed) || parsed <= 0) {
    throw new Error(`convertMoney: invalid rate string "${rateStr}"`);
  }
  const converted = amount.minorUnits * parsed;
  if (!Number.isFinite(converted)) {
    throw new Error("convertMoney: conversion overflow");
  }
  const rounded = roundHalfEven(converted);
  return { minorUnits: rounded, currency: toCode };
}
