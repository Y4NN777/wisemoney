import type { MasterKey } from "../crypto/envelope.ts";
import { decryptBYOKey } from "../crypto/keyManagement.ts";
import { getSessionStatus } from "../auth/session.ts";
import type { AIMode } from "../ai/orchestration.ts";

export const AI_PROVIDER_IDS = ["gemini", "openai", "openrouter", "nvidia_nim"] as const;

export type AICapability = {
  byoConfigured: boolean;
  edgeConfigured: boolean;
  edgeAuthenticated: boolean;
  available: boolean;
  mode: AIMode | null;
  message: string;
};

export function isEdgeConfigured(): boolean {
  return (import.meta.env.VITE_EDGE_BASE_URL ?? "").trim().length > 0;
}

export async function hasConfiguredAIProvider(masterKey: MasterKey): Promise<boolean> {
  for (const providerId of AI_PROVIDER_IDS) {
    try {
      await decryptBYOKey(providerId, masterKey);
      return true;
    } catch {
      // Try the next provider. Missing keys are expected until the user configures AI.
    }
  }
  return false;
}

export async function getAICapability(masterKey: MasterKey): Promise<AICapability> {
  const byoConfigured = await hasConfiguredAIProvider(masterKey);
  const edgeConfigured = isEdgeConfigured();
  const edgeAuthenticated = getSessionStatus() === "authenticated";
  const mode: AIMode | null = byoConfigured ? "byo" : edgeConfigured && edgeAuthenticated ? "managed" : null;

  return {
    byoConfigured,
    edgeConfigured,
    edgeAuthenticated,
    available: mode !== null,
    mode,
    message: mode !== null
      ? ""
      : edgeConfigured
        ? "AI is not enabled yet. Add a personal provider key or connect cloud sync before using AI features."
        : "AI is not enabled yet. Add a personal provider key in Settings to use AI before the managed edge is deployed.",
  };
}
