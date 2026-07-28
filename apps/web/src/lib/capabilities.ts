import { getSessionStatus } from "../auth/session.ts";
import type { AIMode } from "../ai/orchestration.ts";
import { db } from "../db/schema.ts";

export const AI_PROVIDER_IDS = ["gemini", "openai", "openrouter", "deepseek"] as const;

export type AICapability = {
  byoConfigured: boolean;
  edgeConfigured: boolean;
  edgeAuthenticated: boolean;
  available: boolean;
  mode: AIMode | null;
  reason: "byo-required" | "edge-auth-required" | null;
  message: string;
};

export function isEdgeConfigured(): boolean {
  return (import.meta.env.VITE_EDGE_BASE_URL ?? "").trim().length > 0;
}

export async function hasConfiguredAIProvider(): Promise<boolean> {
  const records = await db.byoProviderKeys.bulkGet([...AI_PROVIDER_IDS]);
  return records.some((record) => record != null);
}

export async function getAICapability(): Promise<AICapability> {
  const byoConfigured = await hasConfiguredAIProvider();
  const edgeConfigured = isEdgeConfigured();
  const edgeAuthenticated = getSessionStatus() === "authenticated";
  const mode: AIMode | null = byoConfigured ? "byo" : edgeConfigured && edgeAuthenticated ? "managed" : null;

  return {
    byoConfigured,
    edgeConfigured,
    edgeAuthenticated,
    available: mode !== null,
    mode,
    reason: mode !== null ? null : edgeConfigured ? "edge-auth-required" : "byo-required",
    message: mode !== null
      ? ""
      : edgeConfigured
        ? "AI is not enabled yet. Add a personal provider key or connect cloud sync before using AI features."
        : "AI is not enabled yet. Add a personal provider key in Settings to use AI before the managed edge is deployed.",
  };
}
