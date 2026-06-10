/**
 * Redaction module — shapes outbound AI contexts per consent level.
 *
 * INV-EGR-01: no raw transaction data (amount, date, merchant, note) may appear
 * in a redacted-egress context. Redacted ceiling: period totals per category,
 * income/expense totals, net cash flow, budget status %, goal progress %, trend
 * direction (FR-CONSENT-07).
 *
 * INV-EGR-02: full-egress is permitted only for the specific feature for which
 * the user has granted explicit individual consent.
 *
 * INV-EGR-03:
 *   (a) Managed mode: the Go edge enforces egress shape structurally (StructuralPayloadCap).
 *       This client-side shaping is defence-in-depth; the edge is the enforcement point.
 *   (b) BYO-key mode: this module is the maximum achievable enforcement (user as principal).
 *
 * NFR-MOD-03: this module and consentStore.ts are the ONLY components that shape
 * egress payloads. AIContextBuilder MUST pass every output through shapeEgress()
 * before any transport call.
 */

import { getConsentLevel } from "./consentStore.ts";
import { isAssertionExpired } from "./consentMachine.ts";
import type { ConsentState } from "./consentMachine.ts";

/**
 * Aggregated-only context — the redacted egress ceiling (INV-EGR-01).
 * Contains NO individual transaction detail.
 */
export type RedactedEgressContext = {
  periodTotalsPerCategory: Record<string, { minorUnits: number; currency: string }>;
  totalIncome: { minorUnits: number; currency: string };
  totalExpenses: { minorUnits: number; currency: string };
  netCashFlow: { minorUnits: number; currency: string };
  /** Budget status as a percentage per budget id. */
  budgetStatusPercent: Record<string, number>;
  /** Goal progress as a percentage per goal id. */
  goalProgressPercent: Record<string, number>;
  /** Trend direction per category: "up" | "down" | "stable". */
  trendDirection: Record<string, "up" | "down" | "stable">;
};

/**
 * Full-egress context — includes raw transaction detail.
 * Only emitted when consent is FullGranted AND the assertion is not expired.
 */
export type FullEgressContext = RedactedEgressContext & {
  transactions: Array<{
    id: string;
    timestamp: number;
    amount: { minorUnits: number; currency: string };
    categoryId: string;
    note: string;
  }>;
};

export type EgressContext = RedactedEgressContext | FullEgressContext;

/**
 * Downgrade a FullEgressContext to a RedactedEgressContext by stripping all
 * full-only fields.
 *
 * FullEgressContext extends RedactedEgressContext by adding `transactions`.
 * This function returns a new object that contains only the RedactedEgressContext
 * keys, guaranteeing no full-only data crosses the egress boundary when the
 * assertion re-acquisition fails and the path falls back to redacted.
 *
 * Pure function — does not mutate the input. No `any`.
 *
 * INV-EGR-01 defence-in-depth: even if the caller already shaped a Full context,
 * a failed assertion re-acquire must not send that data under X-Egress-Level: redacted.
 */
export function toRedacted(ctx: EgressContext): RedactedEgressContext {
  // Destructure to an explicit set of RedactedEgressContext keys.
  // TypeScript narrows: if ctx is FullEgressContext the `transactions` key is
  // present but is not in the destructured set — it is excluded by the spread.
  const {
    periodTotalsPerCategory,
    totalIncome,
    totalExpenses,
    netCashFlow,
    budgetStatusPercent,
    goalProgressPercent,
    trendDirection,
  } = ctx;

  return {
    periodTotalsPerCategory,
    totalIncome,
    totalExpenses,
    netCashFlow,
    budgetStatusPercent,
    goalProgressPercent,
    trendDirection,
  };
}

/**
 * Shape a raw context into the permitted egress form for the given feature.
 *
 * This is the single gate all outbound AI contexts MUST pass through.
 * The AIContextBuilder calls this before any transport dispatch.
 *
 * - If consent is Redacted or NotPrompted → return redacted context (ceiling: INV-EGR-01).
 * - If consent is FullGranted but assertion has expired → return redacted context.
 * - If consent is FullGranted and assertion is valid → return full context.
 *
 * TODO (INV-EGR-01/02): implement redaction logic. The "raw" context type is
 * defined by AIContextBuilder (FR-DE-06/07) — implement once that module is
 * fleshed out in a follow-up task.
 *
 * @param featureId    - the feature requesting egress (per-feature consent gate)
 * @param _rawContext  - full context from AIContextBuilder (not typed yet — TODO)
 * @param consentState - current consent state from consentMachine
 */
export function shapeEgress(
  featureId: string,
  _rawContext: unknown,
  consentState: ConsentState
): EgressContext {
  const level = getConsentLevel(featureId);

  const isFullGranted =
    level === "FullGranted" &&
    consentState.status === "FullGranted" &&
    !isAssertionExpired(consentState);

  if (!isFullGranted) {
    // TODO: extract and return real aggregated data from _rawContext
    // For now, return a typed empty redacted context as a stub.
    return buildRedactedStub();
  }

  // TODO: return full context with raw transaction detail (INV-EGR-02)
  throw new Error("shapeEgress (full): not yet implemented");
}

/** Stub — returns an empty redacted context. Replace with real extraction. */
function buildRedactedStub(): RedactedEgressContext {
  return {
    periodTotalsPerCategory: {},
    totalIncome: { minorUnits: 0, currency: "EUR" },
    totalExpenses: { minorUnits: 0, currency: "EUR" },
    netCashFlow: { minorUnits: 0, currency: "EUR" },
    budgetStatusPercent: {},
    goalProgressPercent: {},
    trendDirection: {},
  };
}
