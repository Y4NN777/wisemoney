/**
 * edgeClient.ts — typed HTTP client for the WiseMoney edge auth API.
 *
 * ARCHITECTURE §3 (managed mode); INV-AUTH-01/02/03; FR-AUTH-01/02/03.
 *
 * This module is the SOLE place in the client that issues raw fetch() calls to
 * the edge. Components use the session store (src/auth/session.ts) which calls
 * these functions. This satisfies Panim's "no raw fetch in components" rule by
 * centralising all HTTP side-effects here.
 *
 * Base URL is read from import.meta.env.VITE_EDGE_BASE_URL at call time so that
 * tests can stub it without module-level side-effects.
 *
 * All non-2xx responses are mapped to EdgeAuthError with the HTTP status code.
 * No response body is logged — access tokens and refresh tokens must not appear
 * in any logging surface (INV-AUTH-06).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape returned by /v1/auth/login and /v1/auth/refresh. */
export type AuthTokenResponse = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number; // seconds until access token expiry
};

/** Request body for /v1/auth/register and /v1/auth/login. */
type CredentialsRequest = {
  email: string;
  password: string;
};

/** Request body for /v1/auth/refresh. */
type RefreshRequest = {
  refresh_token: string;
};

/**
 * Typed error thrown when the edge returns a non-2xx status.
 *
 * Callers may inspect `.status` to distinguish 401 Unauthorized (expired /
 * revoked token → re-login required) from 4xx/5xx operational errors.
 */
export class EdgeAuthError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "EdgeAuthError";
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Resolve the edge base URL from the Vite env variable. */
function baseUrl(): string {
  // import.meta.env.VITE_EDGE_BASE_URL is injected by Vite at build time.
  // In test environments it is set by the vi.stubEnv() / process.env bridge.
  // Trim trailing slash so callers can concatenate paths with a leading slash.
  const raw: string = import.meta.env.VITE_EDGE_BASE_URL ?? "";
  const url = raw.replace(/\/$/, "");

  // CWE-319: self-contained HTTPS guard so the guarantee travels with this
  // module regardless of entry point. Bypass only in dev/test where TLS is
  // not available (explicit allow-list; defaults to enforcing).
  const mode: string = import.meta.env.MODE ?? "";
  if (mode !== "test" && mode !== "development") {
    if (!url.startsWith("https://")) {
      throw new Error("VITE_EDGE_BASE_URL must use HTTPS outside dev/test");
    }
  }

  return url;
}

/**
 * Issue a POST request to the edge and return the parsed JSON response.
 *
 * Throws EdgeAuthError on any non-2xx status. The body is parsed as JSON;
 * if parsing fails the raw status text is used as the error message.
 *
 * `authorization` is optional — omit for unauthenticated endpoints (register,
 * login, refresh all use the token in the body, not a Bearer header).
 */
async function post<TBody, TResponse>(
  path: string,
  body: TBody,
  authorization?: string
): Promise<TResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (authorization !== undefined) {
    headers["Authorization"] = `Bearer ${authorization}`;
  }

  const response = await fetch(`${baseUrl()}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    // Attempt to extract a message from the body; fall back to statusText.
    let message = response.statusText;
    try {
      const errBody = (await response.json()) as { message?: string };
      if (typeof errBody.message === "string") {
        message = errBody.message;
      }
    } catch {
      // JSON parse failed — use statusText as message (already set above).
    }
    throw new EdgeAuthError(response.status, message);
  }

  return (await response.json()) as TResponse;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Register a new account on the edge.
 *
 * POST /v1/auth/register {email, password} → 201 (no token in response body).
 * The edge returns 201 with an empty or minimal body on success.
 * Throws EdgeAuthError on failure (e.g. 409 email already exists).
 */
export async function registerUser(
  email: string,
  password: string
): Promise<void> {
  const body: CredentialsRequest = { email, password };
  await post<CredentialsRequest, unknown>("/v1/auth/register", body);
}

/**
 * Log in with credentials and obtain an access + refresh token pair.
 *
 * POST /v1/auth/login {email, password} → 200 {access_token, refresh_token, …}
 * Throws EdgeAuthError on failure (e.g. 401 bad credentials).
 */
export async function loginUser(
  email: string,
  password: string
): Promise<AuthTokenResponse> {
  const body: CredentialsRequest = { email, password };
  return post<CredentialsRequest, AuthTokenResponse>("/v1/auth/login", body);
}

/**
 * Exchange a refresh token for a fresh access + refresh token pair.
 *
 * POST /v1/auth/refresh {refresh_token} → 200 {access_token, refresh_token, …}
 * The edge invalidates the submitted refresh token on success (rotation).
 * Throws EdgeAuthError on failure — 401 means the token is expired or revoked;
 * the session module must clear the local session on this status.
 */
export async function refreshSession(
  refreshToken: string
): Promise<AuthTokenResponse> {
  const body: RefreshRequest = { refresh_token: refreshToken };
  return post<RefreshRequest, AuthTokenResponse>("/v1/auth/refresh", body);
}

// ---------------------------------------------------------------------------
// Consent assertion
// ---------------------------------------------------------------------------

/** Request body for POST /v1/consent/assert. */
type ConsentAssertRequest = {
  feature: string;
};

/**
 * Request a signed consent assertion from the edge for a given feature.
 *
 * POST /v1/consent/assert {feature} + Authorization: Bearer <accessToken>
 * Response: the ConsentAssertion object signed by the edge (ARCHITECTURE §10a).
 *
 * The client treats the response as an OPAQUE string — it cannot verify the
 * HMAC-SHA256 signature (CONSENT_SIGNING_KEY lives only on the edge). The
 * returned string is stored verbatim via consentStore.storeConsentAssertion()
 * and later forwarded as the X-Consent-Assertion header on full-egress requests.
 *
 * If the response body is an object it is JSON.stringify-ed so it round-trips
 * cleanly as the X-Consent-Assertion header value (the edge parses it back on
 * every proxied request).
 *
 * Throws EdgeAuthError with the HTTP status on any non-2xx response.
 * Callers MUST branch on status 401 to trigger a token refresh before retrying.
 */
export async function postConsentAssert(args: {
  accessToken: string;
  feature: string;
}): Promise<string> {
  const { accessToken, feature } = args;
  const body: ConsentAssertRequest = { feature };
  const raw = await post<ConsentAssertRequest, unknown>(
    "/v1/consent/assert",
    body,
    accessToken
  );
  // The edge returns the ConsentAssertion object; stringify it so the value is
  // always a plain string that X-Consent-Assertion can carry verbatim.
  if (typeof raw === "string") {
    return raw;
  }
  return JSON.stringify(raw);
}

// ---------------------------------------------------------------------------
// AI proxy
// ---------------------------------------------------------------------------

/** Response shape from POST /v1/ai/proxy (ARCHITECTURE §10a). */
export type AiProxyResponse = {
  content: string;
  provider: string;
};

/**
 * POST /v1/ai/proxy — forward a shaped egress context to the AI proxy.
 *
 * Headers per ARCHITECTURE §10a / T-S0-05:
 *   Authorization: Bearer <accessToken>
 *   X-Egress-Level: redacted | full
 *   X-Feature: <featureId>
 *   X-Consent-Assertion: <opaque> — ONLY when egressLevel === "full" AND an
 *     assertion is present (if absent the request is downgraded to redacted).
 *
 * Responses:
 *   200 → { content, provider }
 *   401 → EdgeAuthError(401) — token invalid/expired; caller should refresh once
 *   503 → EdgeAuthError(503) — all providers unavailable (INV-PROXY-04)
 *   400 → EdgeAuthError(400) — egress violation (structural payload cap)
 *
 * Throws EdgeAuthError for all non-2xx responses.
 */
export async function postAiProxy(args: {
  accessToken: string;
  egressLevel: "redacted" | "full";
  feature: string;
  consentAssertion?: string;
  taskType: string;
  payload: unknown;
}): Promise<AiProxyResponse> {
  const { accessToken, egressLevel, feature, consentAssertion, taskType, payload } = args;

  const extraHeaders: Record<string, string> = {
    "X-Egress-Level": egressLevel,
    "X-Feature": feature,
  };

  // X-Consent-Assertion is sent ONLY on full-egress requests AND only when an
  // assertion is present. Omitting it on redacted requests prevents assertion
  // tokens from travelling with requests that don't require them.
  if (egressLevel === "full" && consentAssertion !== undefined) {
    extraHeaders["X-Consent-Assertion"] = consentAssertion;
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${accessToken}`,
    ...extraHeaders,
  };

  const response = await fetch(`${baseUrl()}/v1/ai/proxy`, {
    method: "POST",
    headers,
    body: JSON.stringify({ task_type: taskType, payload }),
  });

  if (!response.ok) {
    let message = response.statusText;
    try {
      const errBody = (await response.json()) as { message?: string };
      if (typeof errBody.message === "string") {
        message = errBody.message;
      }
    } catch {
      // JSON parse failed — use statusText as message (already set above).
    }
    throw new EdgeAuthError(response.status, message);
  }

  return (await response.json()) as AiProxyResponse;
}
