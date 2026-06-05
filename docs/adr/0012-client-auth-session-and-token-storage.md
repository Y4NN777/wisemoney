# ADR-0012: Client auth session and token storage

| Field    | Value                                                                                    |
| -------- | ---------------------------------------------------------------------------------------- |
| Status   | Accepted                                                                                 |
| Date     | 2026-06-05                                                                               |
| Diátaxis | Explanation                                                                              |
| Source   | SRS OQ-06; CONTRACT INV-AUTH-06/07 (added in parallel by Zadok); THREAT_MODEL §2.4 (T-CONSENT-02), §6 (M-EGR-04, M-AUTH-05); ADR-0002, ADR-0008 |
| Binds    | `apps/web` auth store; `services/edge` refresh-rotation handler; CSP/SRI build config (M-EGR-04); edge rate-limit and auth middleware |

## Context

SRS OQ-06 left the client-side token presentation and storage mechanism
undecided. The server half is already settled: the Go edge issues a 15-minute
Bearer JWT (access token) and a long-lived rotating refresh token, delivered in
JSON response bodies, consumed via the `Authorization: Bearer` header
(ADR-0004, ADR-0005, ARCHITECTURE §2.1).

What remained open was: where does the client store these two tokens, and under
what conditions does it retain and refresh them?

This is a security-material decision, not an implementation detail. Token storage
determines XSS blast radius, offline-attack surface, and the coupling between
the session lifecycle and the store-unlock lifecycle that is already established
for financial data (ADR-0006, ADR-0002).

The relevant threat context is:

- **XSS is the primary client-side threat** (THREAT_MODEL §2.4, T-CONSENT-02).
  An XSS script executing on the PWA origin during an active session can read
  any JavaScript-accessible storage, call the Web Crypto API to decrypt data
  under the active master key, and egress raw financial data to a provider or
  attacker endpoint, without the user's awareness. The access token and the
  master key are the two highest-value in-session assets.
- **localStorage is already a Mishmar-flagged concern** (ADR-0008 open flag).
  Consent state living in localStorage (unencrypted, script-readable) is a known
  residual. Placing auth tokens there would compound that residual with a direct
  authentication-theft surface.
- **The app already has an AES-GCM-encrypted IndexedDB store** gated by a
  WebAuthn/passphrase master key (ADR-0002, ADR-0006, ARCHITECTURE §7). This
  is the same threat-modelled credential class as BYO provider API keys. The
  refresh token is a high-value long-lived secret that belongs in that class.
- **The 15-minute access token TTL** is specifically chosen (THREAT_MODEL §2.2,
  M-AUTH-05) to bound the blast radius of access-token theft. Keeping it
  exclusively in-memory respects this bound: an XSS that cannot persist its own
  code across navigation cannot exfiltrate a token that lives in a JS module
  scope.

## Decision Drivers

- **XSS token-theft surface must be minimised.** Access token in any persistent
  storage (localStorage, sessionStorage, cookie without HttpOnly) is readable by
  in-session XSS. In-memory is the strongest available client-side isolation.
- **The 15-min access TTL makes in-memory viable.** A 15-min window without
  persistence is not materially worse than sessionStorage for normal browser
  use, and it means a page reload re-acquires a fresh token rather than
  restoring a stale one.
- **The refresh token is a high-value long-lived secret.** It must be stored with
  the same protection class as BYO API keys. The encrypted IndexedDB store is
  already the designated home for that class of secret.
- **Reuse of the existing crypto layer.** The AES-GCM IndexedDB store + WebAuthn
  unlock already protects financial data and BYO keys. Adding the refresh token
  to that store costs nothing new architecturally and gains all existing
  threat-model coverage.
- **No edge contract change desired.** The JSON-body token delivery +
  `Authorization: Bearer` header pattern is already implemented in the scaffold.
  A cookie-based approach would require new edge response headers and CSRF
  handling.
- **CSP/SRI as a load-bearing MVP control.** Token storage decisions shift the
  weight carried by CSP. This decision makes CSP an MVP gate rather than a
  layered defence (see Consequences below).

## Considered Options

### Option A — localStorage for both tokens

Store access token and refresh token in `localStorage`.

**Rejected.** `localStorage` is synchronously readable by any JavaScript
executing on the same origin, including XSS payloads. Both tokens would be
immediately exfiltrable without any additional cryptographic step. This would
place auth credentials in the most XSS-exposed storage location available.
It is the approach most widely deprecated by current guidance (OWASP ASVS 3.2).

### Option B — In-memory access token + encrypted IndexedDB refresh token (chosen)

Store the access token exclusively in a JavaScript module-scoped variable (no
`window` reference, no Web Storage, no cookie). Store the refresh token in the
existing AES-GCM-encrypted IndexedDB store, under the same master-key/WebAuthn
gate as BYO keys and financial data.

Session lifecycle is coupled to store-unlock state: the edge is not contacted
for background token refresh while the store is locked. On unlock, re-acquire a
fresh access token using the decrypted refresh token.

**Chosen.** See Decision and Rationale.

### Option C — HttpOnly + Secure cookie for the refresh token

Place the refresh token in an `HttpOnly; Secure; SameSite=Strict` cookie set by
the Go edge on login. The edge would manage the cookie on subsequent requests.

**Rejected for MVP** (remains a future option). This approach would require:

1. The Go edge to emit `Set-Cookie` response headers on login and token refresh
   — a change to the current JSON-body token contract.
2. CSRF protection on all state-mutating edge endpoints (the cookie would be
   automatically attached by the browser).
3. `SameSite=Strict` to be confirmed compatible with the expected deployment
   topology (PWA origin vs. edge origin may differ, breaking cross-site cookie
   delivery).

The marginal security gain over Option B is narrow given the 15-minute access
token TTL and the encrypted-IDB refresh token. The edge contract change and CSRF
surface are real costs. This option is not excluded permanently: if the XSS
posture must harden beyond what CSP/SRI can achieve, cookie-based refresh
becomes the correct next step. ADR-0008 and this record should be reviewed at
that point.

## Decision

- **Access token (15-minute JWT):** stored exclusively in JavaScript module scope.
  Not attached to `window`, not written to any Web Storage API, not placed in any
  cookie. Lost on page unload; re-acquired on next session by presenting the
  refresh token.
- **Refresh token (long-lived, rotating):** stored in the existing AES-GCM-
  encrypted IndexedDB store, under the same master-key/WebAuthn unlock gate as
  BYO provider API keys and financial event data.
- **Session ↔ store-unlock coupling (accepted by design):** managed-mode AI
  features are unavailable while the store is locked. There is no background
  token refresh while locked. On unlock, the client decrypts the refresh token
  from IndexedDB and presents it to the edge to re-acquire a fresh access token.
- **No edge contract change:** JSON-body token delivery and `Authorization: Bearer`
  header remain as designed.
- **New CONTRACT invariants (Zadok applying in parallel):** INV-AUTH-06 (access
  token in-memory only, no persistent storage) and INV-AUTH-07 (refresh token in
  encrypted IDB, never in plaintext storage).
- **M-EGR-04 escalated to PRIMARY MVP control** (see Consequences — Risks).

## Consequences

### Positive

- **Reuses the existing threat-modelled crypto layer.** The AES-GCM store and
  WebAuthn unlock path already carry all financial data and BYO keys. The refresh
  token joins that layer with no new architectural surface.
- **In-session XSS cannot reach the access token via storage APIs.** It exists
  only in a module closure. An XSS would need to compromise the module itself,
  which CSP/SRI is designed to prevent.
- **Refresh token is protected at the same level as financial data.** An adversary
  who can reach the plaintext IndexedDB contents must first compromise the master
  key / WebAuthn gate — the same pre-condition as stealing the financial event log.
- **No edge rework.** The JSON-body / Bearer contract is preserved. Delivery and
  contract remain unchanged.
- **Access token blast radius is bounded by TTL.** An access token exfiltrated
  by an in-session XSS expires in at most 15 minutes with no refresh path
  available to the XSS.

### Negative

- **No managed AI while the store is locked.** A user who navigates directly to
  the AI Assistant without unlocking the store cannot make AI calls until they
  unlock. This is a UX coupling that must be designed explicitly: the AI surface
  must prompt for unlock, not silently fail.
- **Both tokens are reachable to in-session XSS via Web Crypto during an active
  session.** An XSS executing during an unlocked session can call
  `crypto.subtle.decrypt` with the in-memory master key, decrypting the refresh
  token from IndexedDB, and can read the access token from the module scope if it
  can import the auth module. This is the residual threat that makes CSP
  load-bearing.
- **Refresh token in IndexedDB is a high-value target if WebAuthn is bypassed.**
  If an adversary can bypass or clone the WebAuthn credential (THREAT_MODEL §2.5,
  Threat S-KEY-01) and reach the encrypted IndexedDB store, the refresh token is
  recoverable along with all financial data. This is an existing residual on the
  WebAuthn layer, not a new one introduced here.

### Risks

- **CSP/SRI (M-EGR-04) MUST be a PRIMARY MVP control, not defence-in-depth.**
  This decision makes the in-memory access token and Web Crypto-decryptable
  refresh token reachable to any JavaScript executing on the PWA origin during
  an active session. Strict CSP (`default-src 'self'`, `script-src 'self'`, no
  `unsafe-inline`, no `unsafe-eval`) and SRI on all third-party scripts are the
  primary control preventing XSS from reaching that material. Without them, the
  token storage strategy provides weaker guarantees than intended. M-EGR-04 is
  hereby an MVP gate, not an optional hardening item.
- **Edge refresh-rotation reuse detection is required.** The edge must implement
  RFC 6749-compliant refresh token reuse detection: if a rotated (invalidated)
  refresh token is presented, the entire token family for that user must be
  invalidated, forcing full re-authentication. Without this, a stolen refresh
  token can be used indefinitely by an adversary even after the legitimate user
  has refreshed — the token rotation would generate two valid lineages. This
  requirement lands under M-AUTH-05 in the THREAT_MODEL.
- **Future hardening path.** If XSS posture must harden beyond what CSP/SRI
  achieves (e.g. due to a third-party dependency breach in the PWA bundle), the
  next step is migrating the refresh token to an `HttpOnly; Secure; SameSite=Strict`
  cookie (Option C above). This ADR should be reviewed if that threshold is
  reached.

## References

- SRS OQ-06 (proxy auth mechanism — partially closed by Gate-3 decision 13;
  this ADR closes the client-side half)
- CONTRACT INV-AUTH-06, INV-AUTH-07 (added in parallel by Zadok, 2026-06-05)
- THREAT_MODEL §2.4 (T-CONSENT-02), §2.2 (T-AUTH-01, M-AUTH-05), §6 (M-EGR-04)
- ADR-0002 — dual AI key modes and AES-GCM IndexedDB crypto layer
- ADR-0004 — managed proxy email/password JWT auth and Bearer token contract
- ADR-0006 — React + TS PWA with WebAuthn/passphrase key management
- ADR-0008 — egress enforcement mode-split and consent assertion wire shape
