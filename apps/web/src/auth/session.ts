/**
 * session.ts — client auth-session module (INV-AUTH-06/07, ADR-0012).
 *
 * INVARIANTS ENFORCED HERE
 * ────────────────────────
 * INV-AUTH-06 (access token in-memory only):
 *   The access JWT is held exclusively in module-scope zustand state. It is
 *   NEVER written to localStorage, sessionStorage, or any IndexedDB store.
 *   The authSession record in IndexedDB contains ONLY the AES-GCM sealed
 *   refresh token — never the access token, never a plaintext refresh token.
 *
 * INV-AUTH-07 (unlock coupling / no background refresh):
 *   Every operation that touches a token requires the caller to pass the
 *   masterKey obtained from the unlock flow. This module holds NO reference
 *   to the masterKey between calls — it is not stored in the zustand state or
 *   any module-scope variable. There is NO background timer or setInterval
 *   that would trigger a refresh while the vault is locked. Refresh happens
 *   only on demand: when getAccessToken() detects near-expiry, or when
 *   restoreSession() is called explicitly after unlock.
 *
 * SCOPE BOUNDARY
 * ──────────────
 * This module is the session/token layer only. It does NOT:
 *   - build login UI (separate concern)
 *   - wire the AI-call managed path (separate follow-up, per T-S0-07 carry-forward)
 *   - manage passphrase / WebAuthn unlock (keyManagement.ts)
 */

import { create } from "zustand";
import { seal, open } from "../crypto/envelope.ts";
import type { MasterKey } from "../crypto/envelope.ts";
import { loginUser, registerUser, refreshSession, EdgeAuthError } from "../api/edgeClient.ts";
import { db } from "../db/schema.ts";

// ---------------------------------------------------------------------------
// Session state (zustand)
// ---------------------------------------------------------------------------

/**
 * SessionStatus discriminates the three observable states:
 *   "unauthenticated" — no session; user must log in.
 *   "authenticated"   — valid access token in memory; normal operation.
 *   "locked"          — authSession record exists but the in-memory token
 *                       was lost (page reload while vault was open); call
 *                       restoreSession(masterKey) after unlock to recover.
 */
export type SessionStatus = "unauthenticated" | "authenticated" | "locked";

type SessionState = {
  status: SessionStatus;
  /** Access JWT — in-memory only. Never persisted. (INV-AUTH-06) */
  accessToken: string | null;
  /**
   * Expiry of the access token as epoch-ms. Used by getAccessToken() to
   * decide whether a proactive refresh is needed (~30s before actual expiry).
   */
  accessTokenExpiresAt: number | null;
};

type SessionActions = {
  _setAuthenticated: (accessToken: string, expiresAt: number) => void;
  _clearInMemory: () => void;
};

/** Internal zustand store — module-private; use the public session API or test helpers below. */
const _sessionStore = create<SessionState & SessionActions>()((set) => ({
  status: "unauthenticated",
  accessToken: null,
  accessTokenExpiresAt: null,

  _setAuthenticated: (accessToken, expiresAt) =>
    set({ status: "authenticated", accessToken, accessTokenExpiresAt: expiresAt }),

  _clearInMemory: () =>
    set({ status: "unauthenticated", accessToken: null, accessTokenExpiresAt: null }),
}));

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const AUTH_SESSION_ID = "primary";
/** Refresh proactively when the token expires within this many ms. */
const REFRESH_THRESHOLD_MS = 30_000;

/** Encode a refresh-token string as bytes for sealing. */
function encodeRefreshToken(token: string): Uint8Array {
  return new TextEncoder().encode(token);
}

/** Decode sealed refresh-token bytes back to a string. */
function decodeRefreshToken(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/**
 * Seal the refresh token and write (or overwrite) the authSession record.
 * Called on login and on every rotation.
 */
async function sealAndStoreRefreshToken(
  refreshToken: string,
  masterKey: MasterKey
): Promise<void> {
  const plaintext = encodeRefreshToken(refreshToken);
  const envelope = await seal(plaintext, masterKey);
  await db.authSession.put({
    id: AUTH_SESSION_ID,
    refreshCiphertext: envelope.ciphertext,
    refreshIv: envelope.iv,
  });
}

/**
 * Read and unseal the stored refresh token.
 * Returns null if no authSession record exists (unauthenticated).
 */
async function readAndUnsealRefreshToken(
  masterKey: MasterKey
): Promise<string | null> {
  const record = await db.authSession.get(AUTH_SESSION_ID);
  if (record === undefined) {
    return null;
  }
  const plaintext = await open(
    { ciphertext: record.refreshCiphertext, iv: record.refreshIv },
    masterKey
  );
  return decodeRefreshToken(plaintext);
}

/**
 * Store the new access token in zustand memory with its expiry.
 *
 * @param accessToken  - raw JWT string
 * @param expiresIn    - seconds until expiry (from the edge response)
 */
function setInMemoryToken(accessToken: string, expiresIn: number): void {
  const expiresAt = Date.now() + expiresIn * 1_000;
  _sessionStore.getState()._setAuthenticated(accessToken, expiresAt);
}

// ---------------------------------------------------------------------------
// Public session API
// ---------------------------------------------------------------------------

/**
 * Register a new account on the edge. No token handling — the caller must
 * follow up with login() to obtain a session.
 *
 * Throws EdgeAuthError on edge failure (e.g. 409 email already in use).
 */
export async function register(email: string, password: string): Promise<void> {
  await registerUser(email, password);
}

/**
 * Log in with credentials.
 *
 * 1. Calls the edge login endpoint.
 * 2. Stores the access token in zustand memory (INV-AUTH-06: never persisted).
 * 3. Seals the refresh token under masterKey and writes it to authSession.
 * 4. Sets status → "authenticated".
 *
 * INV-AUTH-07: masterKey is required; the caller holds it only for the
 * duration of this call — this module does not retain it.
 */
export async function login(
  email: string,
  password: string,
  masterKey: MasterKey
): Promise<void> {
  const tokens = await loginUser(email, password);
  setInMemoryToken(tokens.access_token, tokens.expires_in);
  await sealAndStoreRefreshToken(tokens.refresh_token, masterKey);
}

/**
 * Rotate the refresh token.
 *
 * 1. Reads and unseals the stored refresh token.
 * 2. Calls /v1/auth/refresh with the plaintext token.
 * 3. Stores the new access token in zustand memory.
 * 4. Reseals the NEW refresh token to authSession (rotation — old is gone).
 *
 * On EdgeAuthError with status 401: clears in-memory state and deletes the
 * authSession record — the session is irrecoverably invalid; require re-login.
 *
 * Throws if no authSession record exists (caller must check status first).
 *
 * INV-AUTH-07: masterKey required.
 */
export async function refresh(masterKey: MasterKey): Promise<void> {
  const storedRefreshToken = await readAndUnsealRefreshToken(masterKey);
  if (storedRefreshToken === null) {
    _sessionStore.getState()._clearInMemory();
    throw new Error("no authSession record — re-login required");
  }

  let tokens;
  try {
    tokens = await refreshSession(storedRefreshToken);
  } catch (err) {
    if (err instanceof EdgeAuthError && err.status === 401) {
      // Token revoked or expired — clear session entirely.
      _sessionStore.getState()._clearInMemory();
      await db.authSession.delete(AUTH_SESSION_ID);
    }
    throw err;
  }

  setInMemoryToken(tokens.access_token, tokens.expires_in);
  await sealAndStoreRefreshToken(tokens.refresh_token, masterKey);
}

/**
 * Return the current access token, refreshing first if it is within
 * REFRESH_THRESHOLD_MS of expiry.
 *
 * This is the primary entry point for callers that need a Bearer token before
 * issuing an authenticated request. No explicit status check is required —
 * if the token is absent or expired this will attempt refresh; if that fails,
 * the error propagates to the caller.
 *
 * INV-AUTH-07: masterKey required.
 */
export async function getAccessToken(masterKey: MasterKey): Promise<string> {
  const { accessToken, accessTokenExpiresAt } = _sessionStore.getState();

  const nearExpiry =
    accessTokenExpiresAt !== null &&
    accessTokenExpiresAt - Date.now() < REFRESH_THRESHOLD_MS;

  if (accessToken === null || nearExpiry) {
    await refresh(masterKey);
  }

  const fresh = _sessionStore.getState().accessToken;
  if (fresh === null) {
    throw new Error("access token unavailable after refresh attempt");
  }
  return fresh;
}

/**
 * Attempt to restore an authenticated session after a page reload (or unlock).
 *
 * If an authSession record exists in IndexedDB, calls refresh() to obtain a
 * fresh access token (the in-memory one was lost on reload). Sets status →
 * "authenticated" on success. Sets status → "unauthenticated" when no record
 * exists.
 *
 * INV-AUTH-07: masterKey required (the vault must be unlocked before this is
 * called). Called by the unlock flow, not by a background timer.
 *
 * Does NOT throw on "no record" — returns quietly with status "unauthenticated"
 * so the caller can direct the user to login.
 *
 * Does throw on crypto failure (wrong masterKey, tampered record) or edge
 * 5xx — caller handles those.
 */
export async function restoreSession(masterKey: MasterKey): Promise<void> {
  const record = await db.authSession.get(AUTH_SESSION_ID);
  if (record === undefined) {
    _sessionStore.getState()._clearInMemory();
    return;
  }

  // Record exists — attempt refresh to populate the in-memory token.
  await refresh(masterKey);
}

/**
 * Log out: clear the in-memory access token and delete the authSession record.
 *
 * After this call, status is "unauthenticated". No edge call is made — the
 * edge refresh token is simply abandoned (short-lived; will expire naturally).
 * A future enhancement may add a /v1/auth/logout endpoint call here.
 *
 * INV-AUTH-06: both in-memory token and IndexedDB record are cleared.
 */
export async function logout(): Promise<void> {
  _sessionStore.getState()._clearInMemory();
  await db.authSession.delete(AUTH_SESSION_ID);
}

/**
 * Read-only accessor for the current session status.
 * Useful for reactive UI — subscribe to _sessionStore for updates.
 */
export function getSessionStatus(): SessionStatus {
  return _sessionStore.getState().status;
}

// ---------------------------------------------------------------------------
// Test-only helpers — NOT part of the public session API.
// Prefixed with __ to signal test-infrastructure; production code must not
// call these. They exist so session.test.ts can reset and inspect internal
// state without the _sessionStore being a public export (CWE-668).
// ---------------------------------------------------------------------------

/**
 * Reset the session store to its initial (unauthenticated) state.
 * Call this in beforeEach to guarantee test isolation.
 *
 * @testonly
 */
export function __resetSessionForTest(
  overrides: Partial<SessionState> = {}
): void {
  _sessionStore.setState({
    status: "unauthenticated",
    accessToken: null,
    accessTokenExpiresAt: null,
    ...overrides,
  });
}

/**
 * Read a snapshot of the current session store state.
 * Lets tests assert on in-memory token values without direct store access.
 *
 * @testonly
 */
export function __getSessionStateForTest(): SessionState {
  const { status, accessToken, accessTokenExpiresAt } =
    _sessionStore.getState();
  return { status, accessToken, accessTokenExpiresAt };
}
