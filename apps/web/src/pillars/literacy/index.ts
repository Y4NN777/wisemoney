/**
 * Financial Literacy pillar — conversational learning, contextual learning
 * injection, concept library.
 *
 * NFR-MOD-01: failure of this pillar must not affect the Financial State pillar.
 * Dependency direction: Literacy → State (reads snapshot); never State → Literacy.
 * UI surfaces invoke this pillar; they do NOT call AIOrchestrClient directly
 * (NFR-MOD-02).
 */

import type { FinancialStateSnapshot } from "@/pillars/state/index.ts";

/** Concept library entry returned by loadConceptEntry. */
export type ConceptEntry = {
  conceptId: string;
  title: string;
  /** TODO (FR-LIT-01): body content, contextual examples tied to snapshot. */
};

/**
 * Send a conversational message to the Literacy AI feature.
 *
 * TODO (FR-LIT-02):
 * - Build context via AIContextBuilder (MUST pass through ConsentRedactionSubsystem).
 * - Route to AIOrchestrClient with task type "teaching".
 * - On provider failure, fail closed with a user-facing message (INV-PROXY-04).
 */
export function sendConversationMessage(
  _featureId: string,
  _message: string,
  _snapshot: FinancialStateSnapshot
): Promise<void> {
  // TODO: implement — route through ConsentRedactionSubsystem then AIOrchestrClient
  return Promise.reject(new Error("sendConversationMessage: not yet implemented"));
}

/**
 * Load a concept library entry by id.
 *
 * TODO (FR-LIT-01): implement concept library lookup (static content +
 * optional contextual enrichment from the snapshot).
 */
export function loadConceptEntry(
  _conceptId: string
): Promise<ConceptEntry> {
  // TODO: implement
  return Promise.reject(new Error("loadConceptEntry: not yet implemented"));
}
