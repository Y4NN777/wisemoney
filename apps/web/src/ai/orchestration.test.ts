/**
 * orchestration.ts unit tests — managed path.
 *
 * Mocks:
 *   - @/api/edgeClient       — postAiProxy, postConsentAssert, EdgeAuthError (vi.hoisted)
 *   - @/auth/session         — getAccessToken, refresh (vi.hoisted)
 *   - @/consent/consentStore — getConsentLevel, getConsentAssertion,
 *                              storeConsentAssertion (vi.hoisted)
 *
 * No real network calls, no real crypto, no real localStorage.
 *
 * Coverage (managed path):
 *   M-01  redacted request  — consent NotPrompted → no X-Consent-Assertion
 *   M-02  redacted request  — consent Redacted → no X-Consent-Assertion
 *   M-03  full request      — consent FullGranted + assertion present + Full ctx
 *           → egressLevel="full", X-Consent-Assertion attached
 *   M-04  full + assertion cached — FullGranted + stored assertion + Full ctx
 *           → no postConsentAssert call, sends full with cached assertion
 *   M-05  full downgraded   — FullGranted + assertion + Redacted ctx variant
 *           → egressLevel="redacted", no X-Consent-Assertion sent
 *   M-06  401 retry success — first call 401, refresh, second call 200 → NormalizedAIResponse
 *   M-07  401 twice         — both attempts 401 → EdgeAuthError(401) surfaces, no loop
 *   M-08  503               — returns ProviderUnavailableSignal (INV-PROXY-04)
 *   M-09  200               — returns NormalizedAIResponse with correct shape
 *   M-10  BYO mode          — rejects with "not yet implemented"
 *   M-11  re-acquire        — FullGranted + no stored assertion → postConsentAssert
 *           called, storeConsentAssertion called, full sent with acquired assertion
 *   M-12  re-acquire 401→refresh→success — postConsentAssert 401, refresh, retry
 *           succeeds → full sent
 *   M-13  re-acquire fails (non-401) → graceful downgrade: redacted payload,
 *           X-Egress-Level=redacted, no X-Consent-Assertion, no `transactions` in body
 *   M-14  re-acquire fails (401→refresh→still fails) → graceful downgrade to redacted
 *   M-15  downgrade payload has no full-only fields — assert `transactions` absent
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { EgressContext, RedactedEgressContext, FullEgressContext } from "@/consent/redaction.ts";
import type { ConsentLevel } from "@/consent/consentStore.ts";
import { submit } from "./orchestration.ts";
import type { NormalizedAIResponse, ProviderUnavailableSignal } from "./orchestration.ts";
import type { MasterKey } from "@/crypto/envelope.ts";

// ---------------------------------------------------------------------------
// Hoisted mock factories — run before module imports
// ---------------------------------------------------------------------------

const {
  mockPostAiProxy,
  mockPostConsentAssert,
  MockEdgeAuthError,
  mockGetAccessToken,
  mockRefresh,
  mockGetConsentLevel,
  mockGetConsentAssertion,
  mockStoreConsentAssertion,
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
    mockPostConsentAssert: vi.fn<() => Promise<string>>(),
    MockEdgeAuthError,
    mockGetAccessToken: vi.fn<() => Promise<string>>(),
    mockRefresh: vi.fn<() => Promise<void>>(),
    mockGetConsentLevel: vi.fn<() => ConsentLevel>(),
    mockGetConsentAssertion: vi.fn<() => string | null>(),
    mockStoreConsentAssertion: vi.fn<() => void>(),
  };
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@/api/edgeClient.ts", () => ({
  postAiProxy: mockPostAiProxy,
  postConsentAssert: mockPostConsentAssert,
  EdgeAuthError: MockEdgeAuthError,
}));

vi.mock("@/auth/session.ts", () => ({
  getAccessToken: mockGetAccessToken,
  refresh: mockRefresh,
}));

vi.mock("@/consent/consentStore.ts", () => ({
  getConsentLevel: mockGetConsentLevel,
  getConsentAssertion: mockGetConsentAssertion,
  storeConsentAssertion: mockStoreConsentAssertion,
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
  egressLevel: "redacted" | "full";
  feature: string;
  consentAssertion?: string;
  taskType: string;
  payload: unknown;
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
});

// ---------------------------------------------------------------------------
// M-01 / M-02: redacted requests — no assertion header
// ---------------------------------------------------------------------------

describe("managed mode — redacted egress", () => {
  it("M-01: NotPrompted consent → egressLevel=redacted, no consentAssertion", async () => {
    mockGetConsentLevel.mockReturnValue("NotPrompted");
    mockGetConsentAssertion.mockReturnValue(null);
    mockPostAiProxy.mockResolvedValue(PROXY_OK);

    const result = await submit(REDACTED_CTX, "reasoning", "managed", "feature-a", FAKE_MASTER_KEY);

    const args = capturedArgs();
    expect(args.egressLevel).toBe("redacted");
    expect(args.consentAssertion).toBeUndefined();
    expect(args.feature).toBe("feature-a");
    expect(args.taskType).toBe("reasoning");

    const ok = result as NormalizedAIResponse;
    expect(ok.text).toBe("Here is your advice.");
    expect(ok.featureId).toBe("feature-a");
    expect(ok.taskType).toBe("reasoning");
    expect(ok.provider).toBe("openai/gpt-4o");
  });

  it("M-02: Redacted consent → egressLevel=redacted, no consentAssertion", async () => {
    mockGetConsentLevel.mockReturnValue("Redacted");
    mockGetConsentAssertion.mockReturnValue(null);
    mockPostAiProxy.mockResolvedValue(PROXY_OK);

    await submit(REDACTED_CTX, "classification", "managed", "feature-b", FAKE_MASTER_KEY);

    const args = capturedArgs();
    expect(args.egressLevel).toBe("redacted");
    expect(args.consentAssertion).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// M-03: full egress — FullGranted + assertion + Full ctx
// ---------------------------------------------------------------------------

describe("managed mode — full egress", () => {
  it("M-03: FullGranted + assertion present + Full ctx → egressLevel=full, assertion attached", async () => {
    mockGetConsentLevel.mockReturnValue("FullGranted");
    mockGetConsentAssertion.mockReturnValue("opaque.assertion.blob");
    mockPostAiProxy.mockResolvedValue(PROXY_OK);

    await submit(FULL_CTX, "reasoning", "managed", "feature-c", FAKE_MASTER_KEY);

    const args = capturedArgs();
    expect(args.egressLevel).toBe("full");
    expect(args.consentAssertion).toBe("opaque.assertion.blob");
    expect(args.feature).toBe("feature-c");
  });

  // M-04: FullGranted + assertion already cached → no postConsentAssert, sends full
  it("M-04: FullGranted + stored assertion + Full ctx → cached fast-path, no re-acquire", async () => {
    mockGetConsentLevel.mockReturnValue("FullGranted");
    mockGetConsentAssertion.mockReturnValue("cached.assertion.blob");
    mockPostAiProxy.mockResolvedValue(PROXY_OK);

    await submit(FULL_CTX, "summarization", "managed", "feature-d", FAKE_MASTER_KEY);

    // postConsentAssert must NOT be called — the cached assertion is used directly.
    expect(mockPostConsentAssert).not.toHaveBeenCalled();

    const args = capturedArgs();
    expect(args.egressLevel).toBe("full");
    expect(args.consentAssertion).toBe("cached.assertion.blob");
  });

  // M-05: FullGranted + assertion present, but egress context is Redacted variant
  it("M-05: FullGranted + assertion present but Redacted ctx → downgraded to redacted", async () => {
    mockGetConsentLevel.mockReturnValue("FullGranted");
    mockGetConsentAssertion.mockReturnValue("opaque.assertion.blob");
    mockPostAiProxy.mockResolvedValue(PROXY_OK);

    // Pass the redacted context (no `transactions` field) — should not trigger full.
    const ctx: EgressContext = REDACTED_CTX;
    await submit(ctx, "teaching", "managed", "feature-e", FAKE_MASTER_KEY);

    const args = capturedArgs();
    expect(args.egressLevel).toBe("redacted");
    expect(args.consentAssertion).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// M-11 – M-15: assertion re-acquisition and graceful downgrade
// ---------------------------------------------------------------------------

describe("managed mode — assertion re-acquisition", () => {
  it("M-11: FullGranted + no stored assertion → postConsentAssert called, storeConsentAssertion called, full sent", async () => {
    mockGetConsentLevel.mockReturnValue("FullGranted");
    mockGetConsentAssertion.mockReturnValue(null);
    mockPostConsentAssert.mockResolvedValue("freshly.acquired.assertion");
    mockPostAiProxy.mockResolvedValue(PROXY_OK);

    const result = await submit(FULL_CTX, "reasoning", "managed", "feature-j", FAKE_MASTER_KEY);

    expect(mockPostConsentAssert).toHaveBeenCalledOnce();
    expect(mockPostConsentAssert).toHaveBeenCalledWith({
      accessToken: "access.jwt",
      feature: "feature-j",
    });
    expect(mockStoreConsentAssertion).toHaveBeenCalledWith(
      "feature-j",
      "freshly.acquired.assertion"
    );

    const args = capturedArgs();
    expect(args.egressLevel).toBe("full");
    expect(args.consentAssertion).toBe("freshly.acquired.assertion");
    expect((args.payload as FullEgressContext).transactions).toBeDefined();

    const ok = result as NormalizedAIResponse;
    expect(ok.text).toBe("Here is your advice.");
  });

  it("M-12: re-acquire 401 → refresh + retry postConsentAssert succeeds → full sent", async () => {
    mockGetConsentLevel.mockReturnValue("FullGranted");
    mockGetConsentAssertion.mockReturnValue(null);

    // First postConsentAssert call: 401. Second (after refresh): success.
    mockPostConsentAssert
      .mockRejectedValueOnce(new MockEdgeAuthError(401, "token expired"))
      .mockResolvedValueOnce("assertion.after.refresh");

    mockGetAccessToken
      .mockResolvedValueOnce("access.jwt.original")
      .mockResolvedValueOnce("access.jwt.refreshed");

    mockPostAiProxy.mockResolvedValue(PROXY_OK);

    await submit(FULL_CTX, "reasoning", "managed", "feature-k", FAKE_MASTER_KEY);

    expect(mockRefresh).toHaveBeenCalledOnce();
    expect(mockPostConsentAssert).toHaveBeenCalledTimes(2);
    expect(mockStoreConsentAssertion).toHaveBeenCalledWith(
      "feature-k",
      "assertion.after.refresh"
    );

    const args = capturedArgs();
    expect(args.egressLevel).toBe("full");
    expect(args.consentAssertion).toBe("assertion.after.refresh");
  });

  it("M-13: re-acquire fails (non-401 error) → graceful downgrade: redacted payload, no assertion, no transactions", async () => {
    mockGetConsentLevel.mockReturnValue("FullGranted");
    mockGetConsentAssertion.mockReturnValue(null);
    mockPostConsentAssert.mockRejectedValue(
      new MockEdgeAuthError(500, "server error")
    );
    mockPostAiProxy.mockResolvedValue(PROXY_OK);

    await submit(FULL_CTX, "reasoning", "managed", "feature-l", FAKE_MASTER_KEY);

    // Must NOT store a null/undefined assertion.
    expect(mockStoreConsentAssertion).not.toHaveBeenCalled();

    const args = capturedArgs();
    expect(args.egressLevel).toBe("redacted");
    expect(args.consentAssertion).toBeUndefined();

    // The payload sent must NOT contain `transactions` (INV-EGR-01).
    const payload = args.payload as Record<string, unknown>;
    expect("transactions" in payload).toBe(false);
  });

  it("M-14: re-acquire fails (401 → refresh → still fails) → graceful downgrade to redacted", async () => {
    mockGetConsentLevel.mockReturnValue("FullGranted");
    mockGetConsentAssertion.mockReturnValue(null);

    // Both postConsentAssert calls fail (first 401, second also fails).
    mockPostConsentAssert
      .mockRejectedValueOnce(new MockEdgeAuthError(401, "expired"))
      .mockRejectedValueOnce(new MockEdgeAuthError(403, "forbidden"));

    mockGetAccessToken
      .mockResolvedValueOnce("access.jwt.original")
      .mockResolvedValueOnce("access.jwt.refreshed");

    mockPostAiProxy.mockResolvedValue(PROXY_OK);

    await submit(FULL_CTX, "reasoning", "managed", "feature-m", FAKE_MASTER_KEY);

    expect(mockRefresh).toHaveBeenCalledOnce();
    expect(mockStoreConsentAssertion).not.toHaveBeenCalled();

    const args = capturedArgs();
    expect(args.egressLevel).toBe("redacted");
    expect(args.consentAssertion).toBeUndefined();
    const payload = args.payload as Record<string, unknown>;
    expect("transactions" in payload).toBe(false);
  });

  it("M-15: downgrade payload contains exactly the RedactedEgressContext fields, no full-only fields", async () => {
    mockGetConsentLevel.mockReturnValue("FullGranted");
    mockGetConsentAssertion.mockReturnValue(null);
    mockPostConsentAssert.mockRejectedValue(new Error("network failure"));
    mockPostAiProxy.mockResolvedValue(PROXY_OK);

    await submit(FULL_CTX, "classification", "managed", "feature-n", FAKE_MASTER_KEY);

    const args = capturedArgs();
    expect(args.egressLevel).toBe("redacted");

    // Enumerate the exact keys that must be present (RedactedEgressContext).
    const payload = args.payload as Record<string, unknown>;
    expect(payload).toHaveProperty("periodTotalsPerCategory");
    expect(payload).toHaveProperty("totalIncome");
    expect(payload).toHaveProperty("totalExpenses");
    expect(payload).toHaveProperty("netCashFlow");
    expect(payload).toHaveProperty("budgetStatusPercent");
    expect(payload).toHaveProperty("goalProgressPercent");
    expect(payload).toHaveProperty("trendDirection");

    // `transactions` is the only full-only field — it must be absent.
    expect("transactions" in payload).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// M-06 / M-07: 401 retry logic
// ---------------------------------------------------------------------------

describe("managed mode — 401 retry", () => {
  it("M-06: 401 on first call → refresh + retry once → returns NormalizedAIResponse", async () => {
    mockGetConsentLevel.mockReturnValue("Redacted");
    mockGetConsentAssertion.mockReturnValue(null);

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
    mockGetConsentLevel.mockReturnValue("Redacted");
    mockGetConsentAssertion.mockReturnValue(null);

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
    mockGetConsentLevel.mockReturnValue("Redacted");
    mockGetConsentAssertion.mockReturnValue(null);
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
    mockGetConsentLevel.mockReturnValue("Redacted");
    mockGetConsentAssertion.mockReturnValue(null);
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
});

// ---------------------------------------------------------------------------
// M-10: BYO mode → not yet implemented
// ---------------------------------------------------------------------------

describe("BYO mode stub", () => {
  it("M-10: mode=byo → rejects with 'not yet implemented'", async () => {
    await expect(
      submit(REDACTED_CTX, "reasoning", "byo", "feature-i", FAKE_MASTER_KEY)
    ).rejects.toThrow("BYO-key mode not yet implemented");
  });
});
