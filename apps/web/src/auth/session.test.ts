/**
 * session.ts unit tests.
 *
 * Mocks:
 *   - ../db/schema.ts  — in-memory fake for the authSession Dexie table.
 *   - ../api/edgeClient.ts — vi.fn() stubs; no real HTTP.
 *
 * The real crypto/envelope.ts seal/open is used with a test MasterKey derived
 * via crypto.subtle.generateKey — this exercises the actual crypto path without
 * needing Argon2id (which is slow and requires hash-wasm WASM).
 *
 * INVARIANT ASSERTIONS
 * ─────────────────────
 * INV-AUTH-06: The authSession record contains ONLY { id, refreshCiphertext,
 *   refreshIv }. Tests assert that no access_token field appears in the stored
 *   record, and that a plaintext refresh token does not appear in the record.
 *
 * INV-AUTH-07: Every session operation receives masterKey as a parameter. No
 *   test uses a module-scope masterKey reference shared across calls (each test
 *   passes it explicitly), confirming the API contract enforces unlock-coupling.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AuthSessionRecord } from "../db/schema.ts";
import type { AuthTokenResponse } from "../api/edgeClient.ts";

// ---------------------------------------------------------------------------
// In-memory fake for authSession Dexie table
// ---------------------------------------------------------------------------

const { fakeAuthSession } = vi.hoisted(() => {
  type AnyRecord = { id: string };

  class FakeTable<T extends AnyRecord> {
    private store = new Map<string, T>();

    get(id: string): Promise<T | undefined> {
      return Promise.resolve(this.store.get(id));
    }

    put(record: T): Promise<string> {
      this.store.set(record.id, record);
      return Promise.resolve(record.id);
    }

    delete(id: string): Promise<void> {
      this.store.delete(id);
      return Promise.resolve();
    }

    clear(): void {
      this.store.clear();
    }

    /** Test helper: read a record without going through the session API. */
    peek(id: string): T | undefined {
      return this.store.get(id);
    }
  }

  return { fakeAuthSession: new FakeTable<AuthSessionRecord>() };
});

vi.mock("../db/schema.ts", () => ({
  db: {
    authSession: fakeAuthSession,
  },
}));

// ---------------------------------------------------------------------------
// Mock edge client — hoisted so vi.mock factory can reference these vars
// ---------------------------------------------------------------------------

const { mockLoginUser, mockRegisterUser, mockRefreshSession, MockedEdgeAuthError } =
  vi.hoisted(() => {
    class MockedEdgeAuthError extends Error {
      readonly status: number;
      constructor(status: number, message: string) {
        super(message);
        this.name = "EdgeAuthError";
        this.status = status;
      }
    }

    return {
      mockLoginUser: vi.fn<(email: string, password: string) => Promise<AuthTokenResponse>>(),
      mockRegisterUser: vi.fn<(email: string, password: string) => Promise<void>>(),
      mockRefreshSession: vi.fn<(token: string) => Promise<AuthTokenResponse>>(),
      MockedEdgeAuthError,
    };
  });

vi.mock("../api/edgeClient.ts", () => ({
  loginUser: mockLoginUser,
  registerUser: mockRegisterUser,
  refreshSession: mockRefreshSession,
  // Re-export EdgeAuthError so session.ts instanceof checks work.
  EdgeAuthError: MockedEdgeAuthError,
}));

// ---------------------------------------------------------------------------
// Import session API after mocks are in place
// ---------------------------------------------------------------------------

import {
  login,
  register,
  refresh,
  getAccessToken,
  restoreSession,
  logout,
  getSessionStatus,
  __resetSessionForTest,
  __getSessionStateForTest,
} from "./session.ts";

// ---------------------------------------------------------------------------
// Test MasterKey — generated via Web Crypto (no Argon2id / hash-wasm needed)
// ---------------------------------------------------------------------------

async function makeTestMasterKey() {
  const raw = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
  // Cast through unknown to satisfy the opaque MasterKey brand.
  return { _brand: "MasterKey" as const, key: raw };
}

// ---------------------------------------------------------------------------
// Token response fixtures
// ---------------------------------------------------------------------------

function makeTokenResponse(
  accessToken = "access.jwt",
  refreshToken = "refresh.jwt",
  expiresIn = 900
): AuthTokenResponse {
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: "Bearer",
    expires_in: expiresIn,
  };
}

// ---------------------------------------------------------------------------
// Reset state between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  fakeAuthSession.clear();
  __resetSessionForTest();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// register()
// ---------------------------------------------------------------------------

describe("register", () => {
  it("delegates to registerUser and resolves", async () => {
    mockRegisterUser.mockResolvedValueOnce(undefined);
    await expect(register("a@b.com", "pass")).resolves.toBeUndefined();
    expect(mockRegisterUser).toHaveBeenCalledWith("a@b.com", "pass");
  });

  it("propagates EdgeAuthError from registerUser", async () => {
    mockRegisterUser.mockRejectedValueOnce(new MockedEdgeAuthError(409, "conflict"));
    await expect(register("a@b.com", "pass")).rejects.toBeInstanceOf(MockedEdgeAuthError);
  });
});

// ---------------------------------------------------------------------------
// login()
// ---------------------------------------------------------------------------

describe("login", () => {
  it("stores access token in-memory and sets status authenticated", async () => {
    const masterKey = await makeTestMasterKey();
    mockLoginUser.mockResolvedValueOnce(makeTokenResponse("tok.access", "tok.refresh", 900));

    await login("u@x.com", "pass", masterKey);

    expect(getSessionStatus()).toBe("authenticated");
    const { accessToken } = __getSessionStateForTest();
    expect(accessToken).toBe("tok.access");
  });

  it("seals the refresh token into authSession — not the access token", async () => {
    const masterKey = await makeTestMasterKey();
    mockLoginUser.mockResolvedValueOnce(makeTokenResponse("AT", "RT", 900));

    await login("u@x.com", "pass", masterKey);

    const record = fakeAuthSession.peek("primary");
    expect(record).toBeDefined();

    if (record === undefined) throw new Error("record should exist");

    // The record must NOT contain any field named access_token or a plaintext
    // representation of the access token. Only { id, refreshCiphertext, refreshIv }.
    const recordAsMap = record as Record<string, unknown>;
    expect(recordAsMap["access_token"]).toBeUndefined();

    // The refreshCiphertext bytes must not equal the UTF-8 encoding of the refresh token.
    // (AES-GCM auth tag means plaintext != ciphertext for any non-empty input.)
    const plaintextBytes = new TextEncoder().encode("RT");
    const bytesMatch =
      record.refreshCiphertext.byteLength === plaintextBytes.byteLength &&
      record.refreshCiphertext.every((b, i) => b === plaintextBytes[i]);
    expect(bytesMatch).toBe(false);
  });

  it("access token is NEVER written to the authSession record", async () => {
    const masterKey = await makeTestMasterKey();
    mockLoginUser.mockResolvedValueOnce(makeTokenResponse("SECRET_ACCESS", "refresh.tok", 900));

    await login("u@x.com", "pass", masterKey);

    // Scan every byte in the authSession record and confirm none of them
    // form the access token string.
    const record = fakeAuthSession.peek("primary");
    if (record === undefined) throw new Error("record should exist");

    const accessTokenBytes = new TextEncoder().encode("SECRET_ACCESS");
    const ciphertextContainsAccessToken =
      record.refreshCiphertext.byteLength >= accessTokenBytes.byteLength &&
      [...Array(record.refreshCiphertext.byteLength - accessTokenBytes.byteLength + 1).keys()].some(
        (offset) => accessTokenBytes.every((b, i) => record.refreshCiphertext[offset + i] === b)
      );
    expect(ciphertextContainsAccessToken).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// refresh()
// ---------------------------------------------------------------------------

describe("refresh", () => {
  it("rotates: reseals new refresh token and updates in-memory access token", async () => {
    const masterKey = await makeTestMasterKey();

    // Login to create the initial authSession record.
    mockLoginUser.mockResolvedValueOnce(makeTokenResponse("old.access", "old.refresh", 900));
    await login("u@x.com", "pass", masterKey);

    const recordAfterLogin = fakeAuthSession.peek("primary");
    const ivAfterLogin = recordAfterLogin?.refreshIv.slice();

    // Refresh returns new tokens.
    mockRefreshSession.mockResolvedValueOnce(
      makeTokenResponse("new.access", "new.refresh", 900)
    );
    await refresh(masterKey);

    expect(__getSessionStateForTest().accessToken).toBe("new.access");

    // The authSession record must have been updated (new IV proves re-sealing).
    const recordAfterRefresh = fakeAuthSession.peek("primary");
    expect(recordAfterRefresh).toBeDefined();
    if (recordAfterRefresh === undefined || ivAfterLogin === undefined)
      throw new Error("setup failure");

    // AES-GCM uses a fresh random IV on every seal(); the new IV should differ
    // from the login IV with overwhelming probability.
    const ivUnchanged =
      recordAfterRefresh.refreshIv.byteLength === ivAfterLogin.byteLength &&
      recordAfterRefresh.refreshIv.every((b, i) => b === ivAfterLogin[i]);
    expect(ivUnchanged).toBe(false);
  });

  it("on 401 clears in-memory token and deletes authSession record", async () => {
    const masterKey = await makeTestMasterKey();

    mockLoginUser.mockResolvedValueOnce(makeTokenResponse("access", "refresh", 900));
    await login("u@x.com", "pass", masterKey);

    mockRefreshSession.mockRejectedValueOnce(new MockedEdgeAuthError(401, "token revoked"));

    await expect(refresh(masterKey)).rejects.toBeInstanceOf(MockedEdgeAuthError);

    expect(__getSessionStateForTest().accessToken).toBeNull();
    expect(__getSessionStateForTest().status).toBe("unauthenticated");
    expect(fakeAuthSession.peek("primary")).toBeUndefined();
  });

  it("throws when no authSession record exists", async () => {
    const masterKey = await makeTestMasterKey();
    // No login — no record.
    await expect(refresh(masterKey)).rejects.toThrow("no authSession record");
  });
});

// ---------------------------------------------------------------------------
// getAccessToken()
// ---------------------------------------------------------------------------

describe("getAccessToken", () => {
  it("returns the in-memory token when not near expiry", async () => {
    const masterKey = await makeTestMasterKey();
    mockLoginUser.mockResolvedValueOnce(makeTokenResponse("current.token", "rt", 900));
    await login("u@x.com", "pass", masterKey);

    const token = await getAccessToken(masterKey);
    expect(token).toBe("current.token");
    // refreshSession should NOT have been called.
    expect(mockRefreshSession).not.toHaveBeenCalled();
  });

  it("calls refresh when the token is within 30s of expiry", async () => {
    const masterKey = await makeTestMasterKey();
    mockLoginUser.mockResolvedValueOnce(makeTokenResponse("expiring", "rt", 900));
    await login("u@x.com", "pass", masterKey);

    // Manually wind the expiry to 5s from now (within the 30s threshold).
    // Read the current state set by login() and carry it forward with only
    // the expiry overridden, so the store stays consistent.
    const stateAfterLogin = __getSessionStateForTest();
    __resetSessionForTest({
      status: stateAfterLogin.status,
      accessToken: stateAfterLogin.accessToken,
      accessTokenExpiresAt: Date.now() + 5_000,
    });

    mockRefreshSession.mockResolvedValueOnce(
      makeTokenResponse("refreshed.token", "new.rt", 900)
    );

    const token = await getAccessToken(masterKey);
    expect(token).toBe("refreshed.token");
    expect(mockRefreshSession).toHaveBeenCalledOnce();
  });

  it("calls refresh when there is no in-memory token at all", async () => {
    const masterKey = await makeTestMasterKey();

    // Simulate a locked state: authSession exists but in-memory token is gone.
    // Seal a fake refresh token into the store manually.
    const { seal } = await import("../crypto/envelope.ts");
    const envelope = await seal(new TextEncoder().encode("rt.token"), masterKey);
    await fakeAuthSession.put({
      id: "primary",
      refreshCiphertext: envelope.ciphertext,
      refreshIv: envelope.iv,
    });

    mockRefreshSession.mockResolvedValueOnce(
      makeTokenResponse("restored.token", "new.rt", 900)
    );

    const token = await getAccessToken(masterKey);
    expect(token).toBe("restored.token");
  });
});

// ---------------------------------------------------------------------------
// restoreSession()
// ---------------------------------------------------------------------------

describe("restoreSession", () => {
  it("resolves with status unauthenticated when no authSession record exists", async () => {
    const masterKey = await makeTestMasterKey();
    await restoreSession(masterKey);
    expect(getSessionStatus()).toBe("unauthenticated");
  });

  it("refreshes and sets authenticated when an authSession record exists", async () => {
    const masterKey = await makeTestMasterKey();

    // Simulate a stored session (as if a previous login + page reload).
    const { seal } = await import("../crypto/envelope.ts");
    const envelope = await seal(new TextEncoder().encode("stored.rt"), masterKey);
    await fakeAuthSession.put({
      id: "primary",
      refreshCiphertext: envelope.ciphertext,
      refreshIv: envelope.iv,
    });

    mockRefreshSession.mockResolvedValueOnce(
      makeTokenResponse("restored.access", "new.rt", 900)
    );

    await restoreSession(masterKey);

    expect(getSessionStatus()).toBe("authenticated");
    expect(__getSessionStateForTest().accessToken).toBe("restored.access");
  });
});

// ---------------------------------------------------------------------------
// logout()
// ---------------------------------------------------------------------------

describe("logout", () => {
  it("clears in-memory token and deletes the authSession record", async () => {
    const masterKey = await makeTestMasterKey();
    mockLoginUser.mockResolvedValueOnce(makeTokenResponse("tok", "rt", 900));
    await login("u@x.com", "pass", masterKey);

    expect(fakeAuthSession.peek("primary")).toBeDefined();
    expect(__getSessionStateForTest().accessToken).toBe("tok");

    await logout();

    expect(__getSessionStateForTest().accessToken).toBeNull();
    expect(__getSessionStateForTest().status).toBe("unauthenticated");
    expect(fakeAuthSession.peek("primary")).toBeUndefined();
  });

  it("is idempotent: does not throw when already logged out", async () => {
    await expect(logout()).resolves.toBeUndefined();
  });
});
