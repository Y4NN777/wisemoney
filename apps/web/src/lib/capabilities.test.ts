import { beforeEach, describe, expect, it, vi } from "vitest";
const { mockBulkGet, mockGetSessionStatus } = vi.hoisted(() => ({
  mockBulkGet: vi.fn(),
  mockGetSessionStatus: vi.fn(),
}));

vi.mock("@/db/schema.ts", () => ({ db: { byoProviderKeys: { bulkGet: mockBulkGet } } }));
vi.mock("@/auth/session.ts", () => ({ getSessionStatus: mockGetSessionStatus }));

import { AI_PROVIDER_IDS, getAICapability, hasConfiguredAIProvider } from "./capabilities.ts";

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  mockBulkGet.mockResolvedValue(AI_PROVIDER_IDS.map(() => undefined));
  mockGetSessionStatus.mockReturnValue("unauthenticated");
});

describe("AI capabilities", () => {
  it("includes DeepSeek and detects its encrypted record without decrypting keys", async () => {
    mockBulkGet.mockResolvedValue([undefined, undefined, undefined, { id: "deepseek" }]);

    await expect(hasConfiguredAIProvider()).resolves.toBe(true);
    expect(AI_PROVIDER_IDS).toContain("deepseek");
    expect(mockBulkGet).toHaveBeenCalledWith([...AI_PROVIDER_IDS]);
  });

  it("prefers a configured BYO provider over an authenticated edge", async () => {
    vi.stubEnv("VITE_EDGE_BASE_URL", "https://edge.example.com");
    mockBulkGet.mockResolvedValue([{ id: "gemini" }]);
    mockGetSessionStatus.mockReturnValue("authenticated");

    await expect(getAICapability()).resolves.toMatchObject({
      available: true,
      mode: "byo",
      byoConfigured: true,
      edgeConfigured: true,
      edgeAuthenticated: true,
    });
  });

  it("enables managed mode only for an authenticated configured edge", async () => {
    vi.stubEnv("VITE_EDGE_BASE_URL", "https://edge.example.com");
    mockGetSessionStatus.mockReturnValue("authenticated");

    await expect(getAICapability()).resolves.toMatchObject({ available: true, mode: "managed" });
  });

  it("explains that BYO is required while the edge is not deployed", async () => {
    vi.stubEnv("VITE_EDGE_BASE_URL", "");

    const capability = await getAICapability();
    expect(capability.mode).toBeNull();
    expect(capability.message).toContain("before the managed edge is deployed");
  });
});
