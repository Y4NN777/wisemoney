import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MasterKey } from "@/crypto/envelope.ts";
import type { FinancialStateSnapshot } from "@/domain/financialState.ts";
import type { RedactedEgressContext } from "@/consent/redaction.ts";

const { mockBuildContext, mockShapeEgress, mockGetAICapability, mockSubmit } = vi.hoisted(() => ({
  mockBuildContext: vi.fn(),
  mockShapeEgress: vi.fn(),
  mockGetAICapability: vi.fn(),
  mockSubmit: vi.fn(),
}));

vi.mock("@/ai/contextBuilder.ts", () => ({ buildContext: mockBuildContext }));
vi.mock("@/consent/redaction.ts", () => ({ shapeEgress: mockShapeEgress }));
vi.mock("@/lib/capabilities.ts", () => ({ getAICapability: mockGetAICapability }));
vi.mock("@/ai/orchestration.ts", () => ({ submit: mockSubmit }));

import {
  detectPatterns,
  requestInsight,
  requestPrediction,
  requestRecommendation,
} from "./intelligence/index.ts";
import { loadConceptEntry, sendConversationMessage } from "./literacy/index.ts";

const masterKey = {} as MasterKey;
const snapshot = {} as FinancialStateSnapshot;
const rawContext = { raw: true };
const redactedContext: RedactedEgressContext = {
  periodTotalsPerCategory: {},
  totalIncome: { minorUnits: 0, currency: "XOF" },
  totalExpenses: { minorUnits: 0, currency: "XOF" },
  netCashFlow: { minorUnits: 0, currency: "XOF" },
  budgetStatusPercent: {},
  goalProgressPercent: {},
  trendDirection: {},
};

beforeEach(() => {
  vi.clearAllMocks();
  mockBuildContext.mockResolvedValue(rawContext);
  mockShapeEgress.mockReturnValue(redactedContext);
  mockGetAICapability.mockResolvedValue({ mode: "managed" });
  mockSubmit.mockResolvedValue({ text: "answer", provider: "deepseek" });
});

describe("AI pillars", () => {
  it.each([
    [requestInsight, "insight", "reasoning"],
    [requestRecommendation, "recommendation", "reasoning"],
    [requestPrediction, "prediction", "classification"],
    [detectPatterns, "pattern_detection", "summarization"],
  ] as const)("routes %s through context shaping and the expected task", async (request, feature, task) => {
    await request(feature, snapshot, masterKey);

    expect(mockBuildContext).toHaveBeenCalledWith(snapshot, masterKey);
    expect(mockShapeEgress).toHaveBeenCalledWith(feature, rawContext);
    expect(mockSubmit).toHaveBeenCalledWith(redactedContext, task, "managed", feature, masterKey);
  });

  it("keeps the literacy prompt separate through the full pillar flow", async () => {
    await sendConversationMessage("literacy", "What is compound interest?", snapshot, masterKey);

    expect(mockShapeEgress).toHaveBeenCalledWith("literacy", rawContext);
    expect(mockSubmit).toHaveBeenCalledWith(
      redactedContext,
      "teaching",
      "managed",
      "literacy",
      masterKey,
      "What is compound interest?",
    );
  });

  it("returns a provider-unavailable signal before dispatch when AI is not configured", async () => {
    mockGetAICapability.mockResolvedValue({ mode: null, message: "Configure a provider" });

    await expect(requestInsight("insight", snapshot, masterKey)).resolves.toEqual({
      unavailable: true,
      taskType: "reasoning",
      message: "Configure a provider",
    });
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it("loads known concepts and rejects unknown ids", () => {
    expect(loadConceptEntry("compound-interest").title).toBe("Compound Interest");
    expect(() => loadConceptEntry("unknown")).toThrow(/not found/);
  });
});
