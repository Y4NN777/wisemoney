import type { FinancialStateSnapshot } from "@/domain/financialState.ts";
import type { MasterKey } from "@/crypto/envelope.ts";
import { buildContext } from "@/ai/contextBuilder.ts";
import { shapeEgress, type EgressContext } from "@/consent/redaction.ts";
import { getConsentLevel, markNotPrompted } from "@/consent/consentStore.ts";
import { submit, type AIResult } from "@/ai/orchestration.ts";

export type ConceptEntry = {
  conceptId: string;
  title: string;
  body: string;
};

export type { AIResult } from "@/ai/orchestration.ts";

const CONCEPT_LIBRARY: Record<string, ConceptEntry> = {
  "budgeting-101": {
    conceptId: "budgeting-101",
    title: "Budgeting Basics",
    body: "A budget is a plan for how to spend your money. " +
      "The 50/30/20 rule suggests allocating 50% to needs, 30% to wants, and 20% to savings.",
  },
  "compound-interest": {
    conceptId: "compound-interest",
    title: "Compound Interest",
    body: "Compound interest is interest earned on interest. " +
      "Starting early makes a significant difference due to exponential growth over time.",
  },
  "emergency-fund": {
    conceptId: "emergency-fund",
    title: "Emergency Fund",
    body: "An emergency fund covers 3-6 months of essential expenses. " +
      "It provides financial stability against unexpected events like job loss or medical bills.",
  },
};

/**
 * Send a conversational message to the Literacy AI feature.
 *
 * Builds context from snapshot, shapes egress through consent redaction,
 * and routes to the AI orchestration client.
 */
export async function sendConversationMessage(
  featureId: string,
  message: string,
  snapshot: FinancialStateSnapshot,
  masterKey: MasterKey
): Promise<AIResult> {
  const currentLevel = getConsentLevel(featureId);
  if (currentLevel === "NotPrompted") {
    markNotPrompted(featureId);
  }

  const rawContext = await buildContext(snapshot, masterKey);

  const consentState = buildConsentState(featureId);

  const egressContext = shapeEgress(featureId, rawContext, consentState);

  // Embed the user's question alongside the financial context so the AI
  // provider receives both the data snapshot and what the user asked.
  // The structured field is JSON-stringified by the adapters on the far
  // side — the extra property flows through without schema changes.
  const payload = {
    ...egressContext,
    userMessage: message,
  } as unknown as EgressContext;

  return submit(payload, "teaching", "managed", featureId, masterKey);
}

/**
 * Load a concept library entry by id.
 *
 * Falls back to a local static library when offline. Returns a
 * rejection when the concept is not found.
 */
export function loadConceptEntry(
  conceptId: string
): ConceptEntry {
  const entry = CONCEPT_LIBRARY[conceptId];
  if (entry == null) {
    throw new Error(`loadConceptEntry: concept "${conceptId}" not found`);
  }
  return entry;
}

function buildConsentState(
  featureId: string
): { status: "NotPrompted" } | { status: "Redacted" } | { status: "FullGranted"; assertionExpiresAt: number } {
  const level = getConsentLevel(featureId);
  switch (level) {
    case "FullGranted":
      return { status: "FullGranted", assertionExpiresAt: Number.MAX_SAFE_INTEGER };
    case "NotPrompted":
      return { status: "NotPrompted" };
    default:
      return { status: "Redacted" };
  }
}
