/**
 * Financial Intelligence pillar — insight, recommendation, prediction,
 * behavioural pattern detection.
 *
 * NFR-MOD-01: failure of this pillar must not affect the Financial State pillar.
 * INV-PROXY-04: if all AI providers are unavailable, this pillar fails closed
 * with a clear user-facing message — it never fabricates a response.
 *
 * Dependency direction: Intelligence → State (reads snapshot); never State → Intelligence.
 * UI surfaces invoke this pillar through the module interface; they do NOT call
 * AIOrchestrClient directly (NFR-MOD-02).
 */

import type { FinancialStateSnapshot } from "@/pillars/state/index.ts";

/** AI feature identifiers for consent scoping (INV-EGR-02: per-feature consent). */
export type IntelligenceFeatureId =
  | "insight"
  | "recommendation"
  | "prediction"
  | "pattern_detection";

/**
 * Request an AI-driven insight for the current financial state.
 *
 * TODO (FR-AI-01, INV-PROXY-04):
 * - Build context via AIContextBuilder (MUST pass through ConsentRedactionSubsystem).
 * - Route to AIOrchestrClient with task type "reasoning" or "summarization".
 * - On provider failure, return a ProviderUnavailableSignal — never fabricate.
 * - On consent not granted, operate with the redacted context ceiling (INV-EGR-01).
 */
export async function requestInsight(
  _featureId: IntelligenceFeatureId,
  _snapshot: FinancialStateSnapshot
): Promise<void> {
  // TODO: implement — route through ConsentRedactionSubsystem then AIOrchestrClient
  throw new Error("requestInsight: not yet implemented");
}

/**
 * Request a spending recommendation.
 *
 * TODO (FR-AI-02): same routing contract as requestInsight. Task type: "reasoning".
 */
export async function requestRecommendation(
  _featureId: IntelligenceFeatureId,
  _snapshot: FinancialStateSnapshot
): Promise<void> {
  // TODO: implement
  throw new Error("requestRecommendation: not yet implemented");
}
