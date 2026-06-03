/**
 * AI Orchestration client — manages transport selection and hides provider / mode
 * detail from all callers.
 *
 * NFR-MOD-02: this is the ONLY module that knows about provider SDKs or adapters.
 * UI surfaces NEVER import this module directly; they go through the Intelligence
 * or Literacy pillars.
 *
 * Two paths (ARCHITECTURE §3 flows c and d):
 *   - Managed mode: client → Go edge (JWT + consent assertion) → provider
 *   - BYO-key mode: client → provider directly (INV-AUTH-05)
 *
 * INV-PROXY-04: if all providers fail, return a ProviderUnavailableSignal — never
 * fabricate a response.
 *
 * INV-KEY-02 (BYO-key): decryptBYOKey is called in-memory; the key is passed to
 * the provider and then ZEROED from memory. Never sent to the edge. Never logged.
 */

import type { EgressContext } from "@/consent/redaction.ts";

/** AI task types — determine provider/model routing (ARCHITECTURE §9). */
export type TaskType = "reasoning" | "classification" | "teaching" | "summarization";

/** Operating mode. */
export type AIMode = "managed" | "byo";

/** Normalized AI response returned to all callers (INV-PROXY-03). */
export type NormalizedAIResponse = {
  text: string;
  featureId: string;
  taskType: TaskType;
  provider: string;
};

/** Emitted when all providers for a task type are unavailable (INV-PROXY-04). */
export type ProviderUnavailableSignal = {
  unavailable: true;
  taskType: TaskType;
  /** User-facing message — clear, not fabricated. */
  message: string;
};

export type AIResult = NormalizedAIResponse | ProviderUnavailableSignal;

/**
 * Submit a shaped egress context to the appropriate AI transport.
 *
 * TODO (FR-AIORCH-01/03/05):
 *
 * Managed mode path:
 * - Attach JWT (from auth session) + consent assertion (from consentStore).
 * - POST to VITE_EDGE_BASE_URL — the Go edge handles routing, rate-limiting,
 *   cross-provider fallback, and normalization.
 * - Return the normalized response.
 *
 * BYO-key mode path:
 * - Determine primary provider + fallback chain via clientSideRoute.
 * - Call decryptBYOKey(providerId, masterKey) to get the raw key in memory.
 * - Call the provider's adapter directly with the key.
 * - ZERO the key from memory after the call (INV-KEY-02).
 * - Normalize the response to NormalizedAIResponse before returning.
 * - On failure, try the next provider in the fallback chain (FR-AIORCH-05).
 * - If all fail, return ProviderUnavailableSignal (INV-PROXY-04).
 *
 * @param egressContext - already consent-shaped context from AIContextBuilder
 * @param taskType      - determines routing config
 * @param mode          - managed or byo
 * @param featureId     - for normalised response attribution
 */
export async function submit(
  _egressContext: EgressContext,
  _taskType: TaskType,
  _mode: AIMode,
  _featureId: string
): Promise<AIResult> {
  // TODO: implement managed + BYO paths
  throw new Error("submit: not yet implemented");
}

/**
 * Resolve the primary provider config for a task type in BYO-key mode.
 *
 * TODO (FR-AIORCH-03): read from the operator-configurable routing config.
 * Routing config maps task type → { primaryProvider, fallbackChain }.
 * Config is loaded at app start; no code change required to re-route.
 */
export function clientSideRoute(
  _taskType: TaskType
): { provider: string; model: string } {
  // TODO: implement routing config lookup
  throw new Error("clientSideRoute: not yet implemented");
}

/**
 * Resolve the next fallback provider for a task type in BYO-key mode.
 *
 * TODO (FR-AIORCH-05): cross-provider fallback; the fallback provider must be
 * on a DIFFERENT provider than the one that failed.
 */
export function clientSideFallback(
  _taskType: TaskType,
  _failedProvider: string
): { provider: string; model: string } | null {
  // TODO: implement ordered cross-provider fallback chain
  throw new Error("clientSideFallback: not yet implemented");
}
