/**
 * orchestration.ts unit tests — managed path.
 *
 * Mocks:
 *   - @/api/edgeClient       — postAiProxy, EdgeAuthError (vi.hoisted)
 *   - @/auth/session         — getAccessToken, refresh (vi.hoisted)
 *
 * No real network calls, no real crypto, no real localStorage.
 *
 * Coverage (managed path):
 *   M-01/M-02 managed requests use the fixed redacted proxy contract
 *   M-03  full-shaped context → stripped to managed redacted aggregates
 *   M-06  401 retry success — first call 401, refresh, second call 200 → NormalizedAIResponse
 *   M-07  401 twice         — both attempts 401 → EdgeAuthError(401) surfaces, no loop
 *   M-08  503               — returns ProviderUnavailableSignal (INV-PROXY-04)
 *   M-09  200               — returns NormalizedAIResponse with correct shape
 *   M-10  BYO mode          — rejects with "not yet implemented"
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RedactedEgressContext, FullEgressContext } from "@/consent/redaction.ts";
import { submit } from "./orchestration.ts";
import type { NormalizedAIResponse, ProviderUnavailableSignal } from "./orchestration.ts";
import type { MasterKey } from "@/crypto/envelope.ts";

// ---------------------------------------------------------------------------
// Hoisted mock factories — run before module imports
// ---------------------------------------------------------------------------

const {
  mockPostAiProxy,
  MockEdgeAuthError,
  mockGetAccessToken,
  mockRefresh,
  mockDecryptBYOKey,
} = vi.hoisted(() => {
  // Minimal EdgeAuthError replica that satisfies instanceof checks inside the
  // module under test. We need the real class shape without importing the real
  // module (which would create a circular mock dependency).
  class MockEdgeAuthError extends Error {
    readonly status: number;
    constructor(status: number, message: string) {
      super(message);
      this.name = "EdgeAuthError";
      this.status = status;
    }
  }

  return {
    mockPostAiProxy: vi.fn(),
    MockEdgeAuthError,
    mockGetAccessToken: vi.fn<() => Promise<string>>(),
    mockRefresh: vi.fn<() => Promise<void>>(),
    mockDecryptBYOKey: vi.fn(),
  };
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@/api/edgeClient.ts", () => ({
  postAiProxy: mockPostAiProxy,
  EdgeAuthError: MockEdgeAuthError,
}));

vi.mock("@/auth/session.ts", () => ({
  getAccessToken: mockGetAccessToken,
  refresh: mockRefresh,
}));

vi.mock("@/crypto/keyManagement.ts", () => ({
  decryptBYOKey: mockDecryptBYOKey,
}));


// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

/** A fake MasterKey — orchestration passes it through; the mock ignores it. */
const FAKE_MASTER_KEY = {} as MasterKey;

const REDACTED_CTX: RedactedEgressContext = {
  periodTotalsPerCategory: {},
  totalIncome: { minorUnits: 0, currency: "EUR" },
  totalExpenses: { minorUnits: 0, currency: "EUR" },
  netCashFlow: { minorUnits: 0, currency: "EUR" },
  budgetStatusPercent: {},
  goalProgressPercent: {},
  trendDirection: {},
};

const FULL_CTX: FullEgressContext = {
  ...REDACTED_CTX,
  transactions: [
    {
      id: "tx-1",
      timestamp: 1_700_000_000_000,
      amount: { minorUnits: 1000, currency: "EUR" },
      categoryId: "food",
      note: "lunch",
    },
  ],
};

const PROXY_OK = { content: "Here is your advice.", provider: "openai/gpt-4o" };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * The args type for postAiProxy calls recorded by the mock.
 * We spell it out explicitly because vi.fn() mock.calls is typed as
 * unknown[][] when hoisted without explicit generics.
 */
type ProxyArgs = {
  accessToken: string;
  feature: string;
  taskType: string;
  payload: unknown;
  prompt?: string;
};

/** Capture the args object from the last postAiProxy call. */
function capturedArgs(): ProxyArgs {
  const calls = mockPostAiProxy.mock.calls;
  if (calls.length === 0) throw new Error("postAiProxy was not called");
  return calls[calls.length - 1]![0] as ProxyArgs;
}

/** Capture the args object from a specific postAiProxy call (0-indexed). */
function capturedArgsAt(index: number): ProxyArgs {
  const call = mockPostAiProxy.mock.calls[index];
  if (call === undefined) throw new Error(`postAiProxy call[${index}] not found`);
  return call[0] as ProxyArgs;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // Default happy-path session stub — override per test as needed.
  mockGetAccessToken.mockResolvedValue("access.jwt");
  mockRefresh.mockResolvedValue(undefined);
  mockDecryptBYOKey.mockRejectedValue(new Error("key not configured"));
});

// ---------------------------------------------------------------------------
// M-01 / M-02: managed requests use the redacted proxy contract
// ---------------------------------------------------------------------------

describe("managed mode — redacted egress", () => {
  it("M-01: forwards feature and task attribution", async () => {
    mockPostAiProxy.mockResolvedValue(PROXY_OK);

    const result = await submit(REDACTED_CTX, "reasoning", "managed", "feature-a", FAKE_MASTER_KEY);

    const args = capturedArgs();
    expect(args.feature).toBe("feature-a");
    expect(args.taskType).toBe("reasoning");

    const ok = result as NormalizedAIResponse;
    expect(ok.text).toBe("Here is your advice.");
    expect(ok.featureId).toBe("feature-a");
    expect(ok.taskType).toBe("reasoning");
    expect(ok.provider).toBe("openai/gpt-4o");
  });

  it("M-02: forwards classification requests", async () => {
    mockPostAiProxy.mockResolvedValue(PROXY_OK);

    await submit(REDACTED_CTX, "classification", "managed", "feature-b", FAKE_MASTER_KEY);

    const args = capturedArgs();
    expect(args.feature).toBe("feature-b");
    expect(args.taskType).toBe("classification");
  });
});

// ---------------------------------------------------------------------------
// M-03: managed mode always strips full-only fields
// ---------------------------------------------------------------------------

describe("managed mode — full-shaped context", () => {
  it("M-03: sends redacted aggregates without an assertion or transactions", async () => {
    mockPostAiProxy.mockResolvedValue(PROXY_OK);

    await submit(FULL_CTX, "reasoning", "managed", "feature-c", FAKE_MASTER_KEY);

    const args = capturedArgs();
    expect(args.feature).toBe("feature-c");
    const payload = args.payload as Record<string, unknown>;
    expect(payload).toHaveProperty("periodTotalsPerCategory");
    expect(payload).toHaveProperty("totalIncome");
    expect(payload).toHaveProperty("totalExpenses");
    expect(payload).toHaveProperty("netCashFlow");
    expect(payload).toHaveProperty("budgetStatusPercent");
    expect(payload).toHaveProperty("goalProgressPercent");
    expect(payload).toHaveProperty("trendDirection");

    expect("transactions" in payload).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// M-06 / M-07: 401 retry logic
// ---------------------------------------------------------------------------

describe("managed mode — 401 retry", () => {
  it("M-06: 401 on first call → refresh + retry once → returns NormalizedAIResponse", async () => {
    // First call: 401. Second call (after refresh): 200.
    mockPostAiProxy
      .mockRejectedValueOnce(new MockEdgeAuthError(401, "unauthorized"))
      .mockResolvedValueOnce(PROXY_OK);

    // After refresh, getAccessToken returns a fresh token.
    mockGetAccessToken
      .mockResolvedValueOnce("access.jwt.original")
      .mockResolvedValueOnce("access.jwt.refreshed");

    const result = await submit(REDACTED_CTX, "reasoning", "managed", "feature-f", FAKE_MASTER_KEY);

    expect(mockRefresh).toHaveBeenCalledOnce();
    expect(mockPostAiProxy).toHaveBeenCalledTimes(2);

    // First call used original token, second used refreshed token.
    expect(capturedArgsAt(0).accessToken).toBe("access.jwt.original");
    expect(capturedArgsAt(1).accessToken).toBe("access.jwt.refreshed");

    const ok = result as NormalizedAIResponse;
    expect(ok.text).toBe("Here is your advice.");
  });

  it("M-07: 401 on both attempts → EdgeAuthError(401) surfaced, no infinite retry", async () => {
    mockPostAiProxy
      .mockRejectedValueOnce(new MockEdgeAuthError(401, "unauthorized"))
      .mockRejectedValueOnce(new MockEdgeAuthError(401, "still unauthorized"));

    mockGetAccessToken
      .mockResolvedValueOnce("access.jwt.original")
      .mockResolvedValueOnce("access.jwt.refreshed");

    await expect(
      submit(REDACTED_CTX, "reasoning", "managed", "feature-g", FAKE_MASTER_KEY)
    ).rejects.toSatisfy(
      (err: unknown) => err instanceof MockEdgeAuthError && err.status === 401
    );

    // Exactly two proxy calls — no further retries.
    expect(mockPostAiProxy).toHaveBeenCalledTimes(2);
    expect(mockRefresh).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// M-08: 503 → ProviderUnavailableSignal
// ---------------------------------------------------------------------------

describe("managed mode — 503 unavailable", () => {
  it("M-08: 503 from edge → returns ProviderUnavailableSignal (INV-PROXY-04)", async () => {
    mockPostAiProxy.mockRejectedValue(new MockEdgeAuthError(503, "service unavailable"));

    const result = await submit(REDACTED_CTX, "summarization", "managed", "feature-h", FAKE_MASTER_KEY);

    const signal = result as ProviderUnavailableSignal;
    expect(signal.unavailable).toBe(true);
    expect(signal.taskType).toBe("summarization");
    expect(signal.message).toBe(
      "AI is temporarily unavailable. Your financial data is unaffected."
    );
  });
});

// ---------------------------------------------------------------------------
// M-09: 200 → NormalizedAIResponse shape
// ---------------------------------------------------------------------------

describe("managed mode — successful 200 response", () => {
  it("M-09: 200 response → NormalizedAIResponse with text, featureId, taskType, provider", async () => {
    mockPostAiProxy.mockResolvedValue({
      content: "Spend less on coffee.",
      provider: "google/gemini-pro",
    });

    const result = await submit(REDACTED_CTX, "teaching", "managed", "literacy-1", FAKE_MASTER_KEY);

    const ok = result as NormalizedAIResponse;
    expect(ok.text).toBe("Spend less on coffee.");
    expect(ok.featureId).toBe("literacy-1");
    expect(ok.taskType).toBe("teaching");
    expect(ok.provider).toBe("google/gemini-pro");
    expect("unavailable" in ok).toBe(false);
  });

  it("forwards a trimmed user prompt separately from the redacted context", async () => {
    mockPostAiProxy.mockResolvedValue(PROXY_OK);

    await submit(REDACTED_CTX, "teaching", "managed", "literacy", FAKE_MASTER_KEY, "  How can I save?  ");

    const args = capturedArgs();
    expect(args.prompt).toBe("How can I save?");
    expect(args.payload).toEqual(REDACTED_CTX);
    expect(args.payload).not.toHaveProperty("prompt");
  });
});

// ---------------------------------------------------------------------------
// M-10: BYO mode → not yet implemented
// ---------------------------------------------------------------------------

describe("BYO mode", () => {
  it("M-10: mode=byo → returns unavailable when IndexedDB unavailable", async () => {
    const result = await submit(REDACTED_CTX, "reasoning", "byo", "feature-i", FAKE_MASTER_KEY);
    expect("unavailable" in result && result.unavailable).toBe(true);
    if ("unavailable" in result) {
      expect(result.taskType).toBe("reasoning");
    }
  });

  it("falls back from an unavailable Gemini endpoint to DeepSeek and includes the prompt", async () => {
    mockDecryptBYOKey.mockImplementation((provider: string) => {
      if (provider === "gemini") return Promise.resolve("gemini-key");
      if (provider === "deepseek") return Promise.resolve("deepseek-key");
      return Promise.reject(new Error("key not configured"));
    });
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: "DeepSeek answer" } }],
      }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const result = await submit(
      REDACTED_CTX,
      "reasoning",
      "byo",
      "insight",
      FAKE_MASTER_KEY,
      "  What should I improve?  ",
    );

    expect(result).toMatchObject({ text: "DeepSeek answer", provider: "deepseek" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe("https://api.deepseek.com/v1/chat/completions");
    const request = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(request.signal).toBeInstanceOf(AbortSignal);
    const body = JSON.parse(request.body as string) as { messages: Array<{ content: string }> };
    expect(JSON.parse(body.messages[1]!.content)).toEqual({
      context: REDACTED_CTX,
      prompt: "What should I improve?",
    });
  });
});
