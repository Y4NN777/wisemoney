import type { FinancialStateSnapshot } from "@/domain/financialState.ts";
import type { MasterKey } from "@/crypto/envelope.ts";
import { buildContext } from "@/ai/contextBuilder.ts";
import { shapeEgress } from "@/consent/redaction.ts";
import { getAICapability } from "@/lib/capabilities.ts";
import { submit, type AIResult } from "@/ai/orchestration.ts";

type ConceptEntry = {
  conceptId: string;
  title: string;
  body: string;
};

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
  const rawContext = await buildContext(snapshot, masterKey);

  const egressContext = shapeEgress(featureId, rawContext);

  const capability = await getAICapability();
  if (capability.mode == null) {
    return {
      unavailable: true,
      taskType: "teaching",
      message: capability.message,
    };
  }

  return submit(egressContext, "teaching", capability.mode, featureId, masterKey, message);
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
