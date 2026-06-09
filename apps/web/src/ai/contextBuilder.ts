/**
 * AI Context Builder — transforms financial state + event slice into an egress
 * context suitable for AI submission.
 *
 * FR-DE-06/07; ARCHITECTURE §2.1 "AI Context Builder".
 *
 * CRITICAL (NFR-MOD-03): this module MUST pass ALL output through
 * shapeEgress() in consent/redaction.ts before any transport call.
 * It has NO path to a transport that bypasses the consent subsystem.
 *
 * This module does NOT import or call AIOrchestrClient. It produces a shaped
 * EgressContext; the caller (Intelligence/Literacy pillar) passes that to
 * AIOrchestrClient.
 */

import type { FinancialStateSnapshot } from "@/domain/financialState.ts";
import type { FinancialEventRecord } from "@/db/schema.ts";
import type { EgressContext } from "@/consent/redaction.ts";
import type { ConsentState } from "@/consent/consentMachine.ts";
import { shapeEgress } from "@/consent/redaction.ts";

/**
 * Build a consent-gated egress context from the current snapshot + a recent
 * event slice.
 *
 * The event slice provides the recency window for behavioural context
 * (FR-DE-06). The snapshot provides the aggregated state (FR-DE-07).
 *
 * Returns an EgressContext that has already been shaped by shapeEgress() —
 * callers receive a context they can pass directly to AIOrchestrClient.
 *
 * TODO (FR-DE-06/07):
 * - Build a "raw" context from the snapshot + eventSlice.
 * - Call shapeEgress(featureId, rawContext, consentState) to apply redaction.
 * - Return the shaped context.
 * - The raw context type must be defined here and kept in sync with the
 *   Go edge StructuralPayloadCap JSON schema (AQ-01 / THREAT_MODEL §3).
 *
 * @param featureId    - identifies the AI feature requesting context (consent gate)
 * @param snapshot     - current FinancialStateSnapshot from the State engine
 * @param eventSlice   - encrypted recent events (decryption happens here — TODO)
 * @param consentState - current per-feature consent state
 * @param masterKey    - session master key (for decrypting eventSlice — TODO)
 */
export function buildContext(
  featureId: string,
  _snapshot: FinancialStateSnapshot,
  _eventSlice: FinancialEventRecord[],
  consentState: ConsentState,
  _masterKey: unknown
): Promise<EgressContext> {
  // TODO: decrypt and aggregate snapshot + eventSlice into a raw context,
  // then route through shapeEgress.
  const rawContext = {}; // placeholder — will be a typed struct once FR-DE-06/07 is implemented
  return Promise.resolve(shapeEgress(featureId, rawContext, consentState));
}
