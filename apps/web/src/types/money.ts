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
  return { minorUnits, currency } as Money;
}

// ---------------------------------------------------------------------------
// Arithmetic stubs — implement in a follow-up task (FR-MON-*)
// ---------------------------------------------------------------------------

/**
 * Add two Money values.
 * TODO (FR-FS): implement — operands must share the same currency.
 * Throws if currencies differ; use FX conversion before adding cross-currency.
 */
export function addMoney(_a: Money, _b: Money): Money {
  // TODO: implement integer addition, enforce same currency
  throw new Error("addMoney: not yet implemented");
}

/**
 * Convert a Money value into a target currency using a cached FX rate string.
 *
 * TODO (FR-FS, INV-MON-03/04/05): implement with banker's rounding (half-even)
 * to the target currency's minor unit. Rate is a high-precision decimal string,
 * never a float (INV-MON-01). Conversion is display/derivation only — source
 * amounts must never be mutated (INV-MON-04). Must read from the local fxRates
 * cache, never a live network call (INV-MON-03).
 *
 * @param amount   - source Money value
 * @param toCode   - ISO-4217 target currency
 * @param rateStr  - high-precision decimal rate string from fxRates store
 */
export function convertMoney(
  _amount: Money,
  _toCode: string,
  _rateStr: string
): Money {
  // TODO: implement decimal arithmetic + banker's rounding
  throw new Error("convertMoney: not yet implemented");
}
