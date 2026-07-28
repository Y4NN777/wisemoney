import type { FinancialStateSnapshot } from "@/domain/financialState.ts";
import type { MasterKey } from "@/crypto/envelope.ts";
import { buildContext } from "@/ai/contextBuilder.ts";
import { shapeEgress } from "@/consent/redaction.ts";
import { getAICapability } from "@/lib/capabilities.ts";
import { submit, type AIResult, type TaskType } from "@/ai/orchestration.ts";

export type IntelligenceFeatureId =
  | "insight"
  | "recommendation"
  | "prediction"
  | "pattern_detection";

export type { AIResult } from "@/ai/orchestration.ts";

/**
 * Request an AI-driven insight for the current financial state.
 */
export async function requestInsight(
  featureId: IntelligenceFeatureId,
  snapshot: FinancialStateSnapshot,
  masterKey: MasterKey
): Promise<AIResult> {
  return requestAI(featureId, "reasoning", snapshot, masterKey);
}

/**
 * Request a spending recommendation.
 */
export async function requestRecommendation(
  featureId: IntelligenceFeatureId,
  snapshot: FinancialStateSnapshot,
  masterKey: MasterKey
): Promise<AIResult> {
  return requestAI(featureId, "reasoning", snapshot, masterKey);
}

/**
 * Request a financial prediction (e.g. next-month cash flow).
 */
export async function requestPrediction(
  featureId: IntelligenceFeatureId,
  snapshot: FinancialStateSnapshot,
  masterKey: MasterKey
): Promise<AIResult> {
  return requestAI(featureId, "classification", snapshot, masterKey);
}

/**
 * Detect behavioural patterns in financial data.
 */
export async function detectPatterns(
  featureId: IntelligenceFeatureId,
  snapshot: FinancialStateSnapshot,
  masterKey: MasterKey
): Promise<AIResult> {
  return requestAI(featureId, "summarization", snapshot, masterKey);
}

async function requestAI(
  featureId: string,
  taskType: TaskType,
  snapshot: FinancialStateSnapshot,
  masterKey: MasterKey
): Promise<AIResult> {
  const rawContext = await buildContext(snapshot, masterKey);

  const egressContext = shapeEgress(featureId, rawContext);

  const capability = await getAICapability();
  if (capability.mode == null) {
    return {
      unavailable: true,
      taskType,
      message: capability.message,
    };
  }

  return submit(egressContext, taskType, capability.mode, featureId, masterKey);
}
