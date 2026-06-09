/**
 * edgeClient.ts unit tests.
 *
 * Mocks global fetch via vitest's vi.stubGlobal / vi.fn() pattern.
 * No real network calls are made. VITE_EDGE_BASE_URL is stubbed via
 * vi.stubEnv so the module picks up the test base URL.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  registerUser,
  loginUser,
  refreshSession,
  EdgeAuthError,
} from "./edgeClient.ts";

// ---------------------------------------------------------------------------
// Fetch mock helpers
// ---------------------------------------------------------------------------

function makeFetchResponse(
  status: number,
  body: unknown,
  ok: boolean
): Response {
  return {
    ok,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Setup: stub VITE_EDGE_BASE_URL and fetch before each test
// ---------------------------------------------------------------------------

const BASE = "https://edge.test";

beforeEach(() => {
  vi.stubEnv("VITE_EDGE_BASE_URL", BASE);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// registerUser
// ---------------------------------------------------------------------------

describe("registerUser", () => {
  it("POSTs to /v1/auth/register and resolves on 201", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(makeFetchResponse(201, {}, true));

    await registerUser("a@b.com", "hunter2");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/v1/auth/register`);
    expect(init.method).toBe("POST");
    const parsedBody = JSON.parse(init.body as string) as unknown;
    expect(parsedBody).toEqual({ email: "a@b.com", password: "hunter2" });
  });

  it("throws EdgeAuthError with the response status on non-2xx", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      makeFetchResponse(409, { message: "email already exists" }, false)
    );

    await expect(registerUser("dup@b.com", "pass")).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof EdgeAuthError && err.status === 409
    );
  });
});

// ---------------------------------------------------------------------------
// loginUser
// ---------------------------------------------------------------------------

describe("loginUser", () => {
  const TOKEN_RESPONSE = {
    access_token: "access.jwt.token",
    refresh_token: "refresh.jwt.token",
    token_type: "Bearer",
    expires_in: 900,
  };

  it("POSTs to /v1/auth/login and returns the token response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      makeFetchResponse(200, TOKEN_RESPONSE, true)
    );

    const result = await loginUser("user@x.com", "correct");
    expect(result).toEqual(TOKEN_RESPONSE);
  });

  it("throws EdgeAuthError 401 on bad credentials", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      makeFetchResponse(401, { message: "invalid credentials" }, false)
    );

    await expect(loginUser("user@x.com", "wrong")).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof EdgeAuthError && err.status === 401
    );
  });

  it("throws EdgeAuthError 500 on server error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      makeFetchResponse(500, { message: "internal error" }, false)
    );

    await expect(loginUser("user@x.com", "pass")).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof EdgeAuthError && err.status === 500
    );
  });

  it("does not set an Authorization header (credentials in body)", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(makeFetchResponse(200, TOKEN_RESPONSE, true));

    await loginUser("user@x.com", "pass");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// refreshSession
// ---------------------------------------------------------------------------

describe("refreshSession", () => {
  const TOKEN_RESPONSE = {
    access_token: "new.access.token",
    refresh_token: "new.refresh.token",
    token_type: "Bearer",
    expires_in: 900,
  };

  it("POSTs to /v1/auth/refresh with the refresh token in the body", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(makeFetchResponse(200, TOKEN_RESPONSE, true));

    const result = await refreshSession("old.refresh.token");

    expect(result).toEqual(TOKEN_RESPONSE);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/v1/auth/refresh`);
    const body = JSON.parse(init.body as string) as unknown;
    expect(body).toEqual({ refresh_token: "old.refresh.token" });
  });

  it("throws EdgeAuthError 401 when the refresh token is expired/revoked", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      makeFetchResponse(401, { message: "token revoked" }, false)
    );

    await expect(refreshSession("stale.token")).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof EdgeAuthError && err.status === 401
    );
  });
});

// ---------------------------------------------------------------------------
// EdgeAuthError
// ---------------------------------------------------------------------------

describe("EdgeAuthError", () => {
  it("carries name, status, and message", () => {
    const err = new EdgeAuthError(403, "forbidden");
    expect(err.name).toBe("EdgeAuthError");
    expect(err.status).toBe(403);
    expect(err.message).toBe("forbidden");
    expect(err).toBeInstanceOf(Error);
  });
});

// ---------------------------------------------------------------------------
// baseUrl() HTTPS guard (CWE-319)
// ---------------------------------------------------------------------------

describe("baseUrl HTTPS guard", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("throws when MODE is production and base URL uses http://", async () => {
    vi.stubEnv("VITE_EDGE_BASE_URL", "http://insecure.example.com");
    vi.stubEnv("MODE", "production");

    // Stub fetch so the guard can actually throw (not fetch) — but the guard
    // fires inside baseUrl() before fetch is reached.
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      makeFetchResponse(200, {}, true)
    );

    await expect(registerUser("a@b.com", "pass")).rejects.toThrow(
      "VITE_EDGE_BASE_URL must use HTTPS outside dev/test"
    );
  });

  it("does NOT throw when MODE is test and base URL uses http://", async () => {
    vi.stubEnv("VITE_EDGE_BASE_URL", "http://localhost:8080");
    vi.stubEnv("MODE", "test");

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      makeFetchResponse(201, {}, true)
    );

    await expect(registerUser("a@b.com", "pass")).resolves.toBeUndefined();
  });

  it("does NOT throw when MODE is development and base URL uses http://", async () => {
    vi.stubEnv("VITE_EDGE_BASE_URL", "http://localhost:8080");
    vi.stubEnv("MODE", "development");

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      makeFetchResponse(201, {}, true)
    );

    await expect(registerUser("a@b.com", "pass")).resolves.toBeUndefined();
  });

  it("does NOT throw when MODE is production and base URL uses https://", async () => {
    vi.stubEnv("VITE_EDGE_BASE_URL", "https://edge.example.com");
    vi.stubEnv("MODE", "production");

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      makeFetchResponse(201, {}, true)
    );

    await expect(registerUser("a@b.com", "pass")).resolves.toBeUndefined();
  });
});
