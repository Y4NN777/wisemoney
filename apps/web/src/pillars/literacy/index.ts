import type { FinancialStateSnapshot } from "@/domain/financialState.ts";
import type { MasterKey } from "@/crypto/envelope.ts";
import { buildContext } from "@/ai/contextBuilder.ts";
import { shapeEgress } from "@/consent/redaction.ts";
import { getAICapability } from "@/lib/capabilities.ts";
import { submit, type AIResult } from "@/ai/orchestration.ts";

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

export { TutorUnavailableError, askTutor, type TutorAnswer } from "./tutor.ts";
