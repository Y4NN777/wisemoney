# Security Review — WiseMoney S0 Baseline

**Date:** 2026-06-05
**Reviewer:** Mishmar (automated security gate)
**Scope:** Full codebase at commit 4b8fec7 (post dep-audit). Both surfaces reviewed:
`services/edge` (Go) and `apps/web` (React/TS PWA).
**Method:** OWASP Top 10 (2021), Go-specific patterns, React-specific patterns,
infrastructure, and supply-chain checks.

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 0     |
| High     | 3     |
| Medium   | 5     |
| Low      | 4     |
| Info     | 3     |

No remotely exploitable, pre-auth vulnerabilities found. All High findings are
implementation gaps in code that is explicitly marked stub/TODO — they are
structural risks that will become exploitable when those stubs are fleshed out.
The consent-assertion replay vector is the most time-sensitive because the
infrastructure is in place but the nonce store is not.

---

## Findings

---

### [HIGH-01] Consent assertion replay within TTL window

**Severity:** High
**Category:** OWASP A07 — Authentication Failures / Replay attack
**File:** `services/edge/internal/consent/consent.go:123`
**CWE:** CWE-294 (Authentication Bypass by Capture-replay)

**Description:**
The `Verify` method validates HMAC, expiry, user_id, and feature — but the
`// TODO(impl): check nonce has not been used within the TTL window (replay
prevention)` is unimplemented. Within the ~5-minute TTL window, an attacker who
intercepts a valid `X-Consent-Assertion` header (e.g., from a compromised network
path, a browser extension, or a logged request) can replay it to generate
full-egress AI calls sending raw financial PII to providers — bypassing the
consent intent. The nonce field is generated and signed but never checked for
reuse.

**Vulnerable code:**
```go
// consent.go:119–126
expected := s.sign(assertion)
if !hmac.Equal([]byte(expected), []byte(assertion.Signature)) {
    return fmt.Errorf("consent: invalid signature")
}

// TODO(impl): check nonce has not been used within the TTL window (replay prevention).
// Track issued nonces in an in-memory set with TTL cleanup.
```

**Recommended fix:**
Maintain an in-memory `map[string]time.Time` (nonce → issuedAt) under a mutex.
On `Verify`: check that the nonce is not in the map; if clean, insert it with
`time.Now()`; expire entries older than `consentAssertionTTL` on every insert
(lazy GC). On process restart the map is empty — acceptable at MVP scale because
all tokens also expire within 5 minutes by wall-clock time (structural bound).

**Impact:**
An attacker with one captured assertion token can replay full-egress AI calls up
to the TTL boundary, sending raw financial data to providers without re-consent.

---

### [HIGH-02] `FindByEmail` does not handle `pgx.ErrNoRows` — contract broken

**Severity:** High
**Category:** OWASP A07 — Authentication Failures / account enumeration
**File:** `services/edge/internal/store/users.go:74–90`
**CWE:** CWE-203 (Observable Discrepancy)

**Description:**
The function comment states: "Returns (nil, nil) when no user is found." The
implementation does **not** check for `pgx.ErrNoRows` and treats every scan
error identically by wrapping it and returning a non-nil error. When the login
handler (not yet implemented, but its comment describes the intent) calls
`FindByEmail` and gets a non-nil error on a missing account, it cannot
distinguish "account does not exist" from "database is down." If the handler
propagates this as a 500 rather than a uniform 401, it leaks account existence
(M-AUTH-03 violation). If it naively treats any error as "not found," it masks
infrastructure failures.

**Vulnerable code:**
```go
// users.go:84–89 — comment promises nil,nil on not-found; code returns error for ALL cases
err := r.pool.QueryRow(ctx, q, email).Scan(...)
if err != nil {
    // pgx.ErrNoRows is a valid "not found" — return nil, nil.  ← comment, not code
    return nil, fmt.Errorf("store: users.FindByEmail: %w", err)
}
```

**Recommended fix:**
```go
import "github.com/jackc/pgx/v5"

if errors.Is(err, pgx.ErrNoRows) {
    return nil, nil
}
return nil, fmt.Errorf("store: users.FindByEmail: %w", err)
```
Apply the same fix to `FindByID` and `FindByTokenHash` in `refresh_tokens.go`
(same pattern, same risk).

**Impact:**
Login handler implementors will face a broken contract. If the mismatch is not
caught in implementation, it will produce either account-enumeration discrepancy
(different response for "no account" vs "wrong password") or masked DB errors.

---

### [HIGH-03] No input validation on email/password at `/v1/auth/register` and `/v1/auth/login`

**Severity:** High
**Category:** OWASP A03 — Injection / A04 — Insecure Design
**File:** `services/edge/internal/auth/service.go:51–77`
**CWE:** CWE-20 (Improper Input Validation)

**Description:**
Both `HandleRegister` and `HandleLogin` decode the JSON body but perform zero
validation on the `email` or `password` fields before use. The existing TODO
acknowledges this: `// TODO(INV-AUTH-02): validate email format; enforce minimum
passphrase entropy`. Concretely:

1. An empty string `""` for email is passed to `hashPassword` and, once the
   store is wired, to `users.Create` — allowing a zero-length email to be
   registered, violating the DB constraint only at the Postgres layer. This
   is a correctness risk that becomes a security risk if Postgres error messages
   are not handled uniformly (see HIGH-02).
2. An empty string `""` for password goes through Argon2id hashing — a valid
   PHC string is produced for the empty password, allowing a zero-entropy
   credential to be created.
3. No maximum length on either field — a request body with a 100 MB "password"
   will drive Argon2id with 64 MiB RAM × that payload size, enabling CPU/memory
   exhaustion (denial-of-service against the Argon2id path). This is a
   **separate** resource exhaustion vector from the body-size issue (see MED-01).

**Recommended fix:**
Before calling `hashPassword`, validate:
- `body.Email` matches an RFC-5322-conforming regex (or use `net/mail.ParseAddress`).
- `body.Password` has length ≥ 12 and ≤ 128 bytes.
- Both fields are non-empty.
Return a generic `400 invalid_credentials` (not field-specific) to prevent
enumeration of which field is wrong.

**Impact:**
Empty-password registrations, email-format exploits forwarded to the DB, and
CPU/memory DoS via Argon2id with oversized input.

---

### [MEDIUM-01] No request body size limit on any endpoint

**Severity:** Medium
**Category:** OWASP A04 — Insecure Design (resource exhaustion)
**File:** `services/edge/internal/httpapi/router.go`
**CWE:** CWE-400 (Uncontrolled Resource Consumption)

**Description:**
No `http.MaxBytesHandler` or `http.MaxBytesReader` is applied to any route or
at the server level. A client can POST an arbitrarily large body to
`/v1/ai/proxy`, `/v1/auth/register`, `/v1/auth/login`, or `/v1/consent/assert`.
The `/v1/ai/proxy` endpoint forwards `json.RawMessage` payload to the
provider router — a very large payload will consume memory during JSON
unmarshal and potentially during provider dispatch.

**Recommended fix:**
Apply `http.MaxBytesHandler` globally at the server or per-group in the router:
```go
// In NewRouter, wrap the entire mux:
return http.MaxBytesHandler(r, 1<<20) // 1 MiB ceiling
```
For `/v1/auth/*` use a lower ceiling (e.g., 4 KiB) since credentials are small.

**Impact:**
Memory/CPU exhaustion via large request bodies; effective DoS against a
single-instance edge.

---

### [MEDIUM-02] Missing CORS configuration — all origins currently accepted

**Severity:** Medium
**Category:** OWASP A05 — Security Misconfiguration
**File:** `services/edge/internal/httpapi/router.go`
**CWE:** CWE-942 (Permissive Cross-domain Policy with Untrusted Domains)

**Description:**
The router applies `chiMiddleware.Recoverer` and `middleware.LogSanitizer` but
no CORS middleware. With no explicit CORS policy, the browser's default same-origin
policy applies to simple requests — but the API uses custom headers
(`Authorization`, `X-Egress-Level`, `X-Feature`, `X-Consent-Assertion`) that
require a CORS preflight. Without a CORS middleware, cross-origin preflights
will fail silently, or (depending on the browser) might be served with
permissive headers from a reverse proxy. For a financial-data-adjacent edge,
explicit CORS with an origin allowlist is mandatory.

**Recommended fix:**
Add `github.com/go-chi/cors` (or chi's built-in CORS) with an explicit
allowlist. For MVP (local + one production origin):
```go
r.Use(cors.New(cors.Options{
    AllowedOrigins: []string{"https://app.wisemoney.example.com"},
    AllowedMethods: []string{"GET", "POST"},
    AllowedHeaders: []string{
        "Authorization", "Content-Type",
        "X-Egress-Level", "X-Feature", "X-Consent-Assertion",
    },
    MaxAge: 600,
}).Handler)
```

**Impact:**
In the current stub state: preflight failures block cross-origin use.
In production without explicit CORS: risk of unintended cross-origin access to
the AI proxy endpoint via credential-bearing requests from malicious sites.

---

### [MEDIUM-03] Missing security response headers on all routes

**Severity:** Medium
**Category:** OWASP A05 — Security Misconfiguration
**File:** `services/edge/internal/httpapi/router.go`; `apps/web/vite.config.ts`
**CWE:** CWE-16 (Configuration)

**Description:**
Neither the edge nor the Vite dev/preview server sets:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: no-referrer`
- `Content-Security-Policy` (at minimum on the PWA)
- `Strict-Transport-Security` (production only)

For a financial PWA with consent-gated AI egress, CSP is a meaningful
defence-in-depth control: a strict CSP prevents injected scripts from reading
IndexedDB content or exfiltrating consent assertions.

**Recommended fix:**
Edge: add a security-headers middleware in the base `r.Use(...)` chain.
PWA (Vite): add a `server.headers` block in `vite.config.ts` for dev; configure
the same headers on the production static host (Vercel `vercel.json`).

**Impact:**
Without CSP, a stored-XSS vulnerability in any UI component could exfiltrate
consent assertions from localStorage and replay them. Clickjacking (X-Frame-Options)
is a low bar but meaningful for a consent-dialog flow.

---

### [MEDIUM-04] `DATABASE_URL` in `.env.example` sets `sslmode=disable`

**Severity:** Medium
**Category:** OWASP A02 — Cryptographic Failures
**File:** `.env.example:10`
**CWE:** CWE-311 (Missing Encryption of Sensitive Data)

**Description:**
The template value is:
```
DATABASE_URL=postgres://wisemoney:change-me-in-real-env@postgres:5432/wisemoney_edge?sslmode=disable
```
`sslmode=disable` is appropriate for compose-internal networking (loopback) but
risky as a template: operators copying this value into production will have
unencrypted Postgres connections in transit. The edge stores password hashes and
refresh token hashes — both sensitive even in absence of financial data.

**Recommended fix:**
Change the template to `sslmode=require` (or `verify-full` for production).
Add a comment: `# sslmode=disable acceptable only for loopback compose networking;
use sslmode=require or verify-full in production`.

**Impact:**
If an operator deploys with the template value, password-hash and refresh-token
traffic is unencrypted in transit.

---

### [MEDIUM-05] `log.Printf` in `proxy.go` uses stdlib `log` — bypasses `LogSanitizer` contract

**Severity:** Medium
**Category:** OWASP A09 — Logging Failures
**File:** `services/edge/internal/httpapi/proxy.go:70–80`
**CWE:** CWE-532 (Insertion of Sensitive Information into Log File)

**Description:**
`LogSanitizer` documents that it is "the outermost middleware" and "the only log
middleware." Four `log.Printf` calls inside the egress-gate block write directly
to stderr (stdlib `log`'s default) outside the sanitized logging path. While the
current payloads appear safe (`userID`, `featureHeader`, `err.Error()`), the
pattern establishes a precedent: developer adds a debug `log.Printf(reason)` and
inadvertently logs a consent assertion or token value. This risk grows as the
stub bodies are implemented.

Additionally, `fmt.Printf` in `LogSanitizer` itself is tagged as a TODO for
replacement with structured logging — both call sites should be on the migration
list.

**Recommended fix:**
Replace all `log.Printf` and `fmt.Printf` in the server codebase with a single
structured `log/slog` logger instance initialised in `main.go` and passed by
value. Structured logging makes it mechanically easy to audit what fields are
logged; unstructured `Printf` does not.

**Impact:**
If future implementations add log calls following this pattern, sensitive values
(assertions, tokens, error messages from Postgres containing email addresses)
could appear in logs.

---

### [LOW-01] No per-endpoint rate limit on auth routes (`/v1/auth/login`, `/register`)

**Severity:** Low
**Category:** OWASP A04 — Insecure Design (brute force)
**File:** `services/edge/internal/auth/service.go:94`
**CWE:** CWE-307 (Improper Restriction of Excessive Authentication Attempts)

**Description:**
The auth service comments acknowledge this: `// TODO(M-AUTH-01): enforce per-IP
and per-account rate limit on this endpoint`. The existing `RateLimiter`
middleware is only applied to the authenticated `/v1/ai/proxy` and
`/v1/consent/assert` routes — auth routes are publicly accessible without
rate limiting. A brute-force attack against login is therefore unconstrained
at the application layer.

**Recommended fix:**
Apply a separate `RateLimiter` on auth routes keyed on client IP (before JWT
validation — no user ID available). A token bucket of 5 RPS with a burst of 10
per IP is a reasonable starting point. Alternatively, use chi's rate-limit
middleware with a sliding-window counter.

**Impact:**
Online brute force against the login endpoint is unconstrained until this is
implemented.

---

### [LOW-02] `hashPassword` stub returns a placeholder string — produces invalid PHC

**Severity:** Low (severity escalates to Critical at wire-up time if not caught)
**Category:** OWASP A02 — Cryptographic Failures
**File:** `services/edge/internal/auth/service.go:213`

**Description:**
```go
return "argon2id-stub-replace-with-phc-encoder", nil
```
The stub currently prevents any real password being stored, which is safe at this
phase. The risk is at wire-up: if the login handler is implemented and `Create`
is called with the stub string, users can register but never log in (PHC parse
will fail on verify). More critically, if `verifyPassword` is implemented first
with a loose check (e.g., `strings.Compare`) instead of PHC-parse + Argon2id
re-derive, it could produce an authentication bypass. The stub comment says "use
a well-tested encoder rather than hand-rolling format" — this is the right call.

**Recommended fix:**
Use `github.com/matthewhartstonge/argon2` or implement the PHC string encoder
per RFC draft before wiring up `Create`. The stub must fail loudly (panic or
startup error) in non-development builds so it cannot be deployed accidentally.

**Impact:**
If missed at wire-up: login always fails (DoS on authentication); or in worst
case, an authentication bypass if the verifier is implemented without PHC parsing.

---

### [LOW-03] WebAuthn `wrapMasterKeyWithWebAuthn` throws unconditionally — silent failure path

**Severity:** Low
**Category:** OWASP A07 — Authentication Failures
**File:** `apps/web/src/crypto/keyManagement.ts:301–304`

**Description:**
Both `wrapMasterKeyWithWebAuthn` and `unwrapMasterKeyWithWebAuthn` throw
unconditionally with a "design gap" error. If the UI calls these functions
expecting biometric unlock to work, the user silently falls back to passphrase
only — or worse, the error is caught and swallowed. The design gap (extractable
key copy needed for wrapping) is correctly documented, but the function signature
doesn't signal "not yet implemented" in a type-safe way. A developer wiring the
unlock flow could treat a thrown error as "WebAuthn unavailable" and degrade
gracefully in a way that bypasses the intended unlock prompt.

**Recommended fix:**
Add a `// @throws DesignGapError` JSDoc tag and export a typed sentinel error
(`WebAuthnDesignGapError`) so callers can distinguish "PRF not supported" from
"implementation blocked." Document the required contract revision (pass raw bytes
before zeroing) in a linked tracking task.

---

### [LOW-04] `vite.config.ts` `VITE_EDGE_BASE_URL` default allows `http://` in production

**Severity:** Low
**Category:** OWASP A02 — Cryptographic Failures
**File:** `.env.example:40`

**Description:**
```
VITE_EDGE_BASE_URL=http://localhost:8080
```
This is correct for local dev. However, the orchestration client (`ai/orchestration.ts`)
will use this URL to POST JWTs and consent assertions. If the variable is not
overridden in a production build, those requests go over plain HTTP, exposing
access tokens and consent assertions in transit. There is no runtime check that
`VITE_EDGE_BASE_URL` starts with `https://` in production builds.

**Recommended fix:**
In `vite.config.ts` (or `main.tsx`), add a startup assertion:
```ts
if (import.meta.env.PROD && !import.meta.env.VITE_EDGE_BASE_URL?.startsWith("https://")) {
  throw new Error("VITE_EDGE_BASE_URL must be https:// in production builds");
}
```

---

### [INFO-01] `chiMiddleware.Recoverer` logs panics — may expose stack traces

**Severity:** Info
**Category:** OWASP A05 — Security Misconfiguration
**File:** `services/edge/internal/httpapi/router.go:44`

Chi's `Recoverer` middleware recovers from panics and logs the stack trace to
stderr using its own logger, not through `LogSanitizer`. While stack traces do
not contain financial data (the edge holds none), they may contain internal
path names, argument values, or goroutine states that aid an attacker in
fingerprinting the service. In production, panic recovery should log to the
structured logger and return a generic 500 without exposing the stack trace
to the response.

---

### [INFO-02] `feature` field in consent assertion is unbounded — no allowlist

**Severity:** Info
**Category:** OWASP A04 — Insecure Design
**File:** `services/edge/internal/consent/consent.go:82–85`

The `POST /v1/consent/assert` handler accepts any non-empty `feature` string and
issues a signed assertion for it. There is no allowlist of valid feature IDs.
An authenticated user can obtain valid signed assertions for arbitrary feature
names (`feature: "admin_bypass"`, `feature: "../../etc"`, etc.). These assertions
are useless today because the only consumer is `Verify` in the proxy handler,
which binds the assertion to the `X-Feature` header. However, as the system
grows and assertions are used in more places, an uncontrolled feature namespace
becomes a risk.

Add a `validFeatures` set check in `HandleAssert`. The set can be loaded from
config or hardcoded for MVP.

---

### [INFO-03] Supply-chain: CI binary scan waits for compiled edge artifact

**Severity:** Info
**Category:** OWASP A06 — Vulnerable and Outdated Components
**File:** `.github/workflows/security-scan.yml:142–151`

The binary-scan step (the authoritative gate for Go stdlib CVEs, per ADR-0010)
is intentionally inert in `security-scan.yml` until a compiled edge artifact is
present at `EDGE_BINARY_PATH` (`dist/edge` by default). `verify.yml` now runs the
edge build/vet/test correctness gate, but it does not publish that binary into the
security-scan job. Before release, either build/download `dist/edge` inside
`security-scan.yml` or run the local binary scan in
`docs/runbooks/dependency-scanning.md`.

---

## Passed Checks

- No hardcoded secrets in any committed file (SOPS/age referenced correctly; `.env`
  excluded from git; `.env.example` uses placeholder values only).
- No SQL injection vectors — all DB queries are parameterised via pgx named
  parameters; no string interpolation anywhere in the store layer.
- No `eval()`, `exec()`, or `compile()` with user input in any file.
- No `dangerouslySetInnerHTML` usage in any React component.
- No raw `fetch()` in any React component — all network calls routed through
  the orchestration client (stub) or TanStack Query.
- No hardcoded provider URLs in user-configurable fields — provider base URLs are
  `const` at compile time (M-PROXY-01 SSRF prevention is structural, not advisory).
- JWT validation: algorithm is pinned to HMAC (`jwt.SigningMethodHMAC` type check);
  `jwt.WithExpirationRequired()` is set; `sub` claim is extracted from the validated
  token only — no client-supplied user ID trusted (INV-AUTH-04).
- Refresh token: only SHA-256 hash stored, never the raw token; 256-bit random
  source; single-use semantics and family-invalidation are documented and wired in
  the store layer stubs.
- Argon2id parameters: memory=65536 KiB, iterations=3 enforced at config-load with
  explicit error on underrun (THREAT_MODEL §2.2 minimums enforced structurally).
- AES-GCM envelope: 96-bit random IV per record; non-extractable CryptoKey;
  AEAD tag rejection propagated to caller; zeroing of intermediate raw buffer.
- Consent signing key is validated at startup to differ from the JWT signing key
  (independent rotation enforced structurally in `config.Load`).
- Docker: distroless runtime (`gcr.io/distroless/static-debian12:nonroot`), non-root
  UID 65532, CGO_ENABLED=0 static binary, no `:latest` tags.
- OSV-scanner gate: pinned binary with dual-source SHA256 verification; runs on
  every PR as a merge gate.
- localStorage consent is correctly documented as advisory only (not the
  enforcement mechanism in managed mode); the Go edge is the structural boundary.
- No `console.log` calls anywhere in the frontend source.
- No `localStorage` reads outside `consent/consentStore.ts` (NFR-MOD-03).

---

## Prioritisation for implementation phase

| Priority | Finding | Owner |
|----------|---------|-------|
| 1 (before merging consent wire-up) | HIGH-01 — nonce replay | Mishmar + Zerubbabel |
| 2 (before login wire-up)           | HIGH-02 — ErrNoRows contract | Zerubbabel |
| 3 (before login wire-up)           | HIGH-03 — input validation | Zerubbabel |
| 4 (before any load test)           | MED-01 — body size limit | Zerubbabel |
| 5 (before staging deploy)          | MED-02 — CORS | Platform/deployment |
| 6 (before staging deploy)          | MED-03 — security headers | Platform/frontend |
| 7 (before production)              | MED-04 — sslmode=disable template | Resolved |
| 8 (ongoing)                        | MED-05 — structured logging | Zerubbabel |
| 9 (before login wire-up)           | LOW-01 — auth rate limit | Zerubbabel |
| 10 (before login wire-up)          | LOW-02 — PHC encoder | Zerubbabel |

---

## Triage — 2026-06-05 (re-assessed at `eec2d6f`)

This review covered `4b8fec7`. Since then the consent gate, provider strategy
(ADR-0011), edge auth, and client crypto landed — several findings are resolved or
materially changed. Status below is authoritative as of `eec2d6f`.

| # | Finding | Status | Note |
|---|---------|--------|------|
| HIGH-01 | Consent replay (no nonce) | **DEFERRED** | ADR-0011 deferred managed full-egress → a replayed assertion fail-closes to redacted (no provider to route to). No MVP exploit path. **Gate: implement nonce denylist before managed full-egress launches.** |
| HIGH-02 | FindByEmail ErrNoRows | **RESOLVED** | Fixed across FindByEmail/FindByID/FindByTokenHash (`feat(auth)` eec2d6f). |
| HIGH-03 | Input validation | **RESOLVED** | Email format + min-len(12) + **max-len password≤128 / email≤254** (quick-wins 2026-06-05). |
| MED-01 | Body size limit | **RESOLVED** | `withBodyLimit` — 8 KiB auth/consent, 1 MiB proxy, 413 on exceed (quick-wins). |
| MED-02 | CORS allowlist | **OPEN** | Gate: staging deploy (needs prod origin). |
| MED-03 | Security headers / CSP | **PARTIAL** | PWA CSP escalated to primary control (ADR-0012, documented); edge headers + CSP impl OPEN — gate: staging. |
| MED-04 | `.env.example` sslmode | **RESOLVED** | Template → `sslmode=require` + comment (quick-wins). |
| MED-05 | log.Printf vs LogSanitizer | **OPEN** | `slog` migration — pre-prod. |
| LOW-01 | Auth rate limit | **OPEN** | M-AUTH-01 — pre-login-launch. |
| LOW-02 | hashPassword stub | **RESOLVED** | Real Argon2id PHC (`feat(auth)`). |
| LOW-03 | WebAuthn throws | **RESOLVED** | Implemented (Gap-2 Option A, `feat(crypto)`). |
| LOW-04 | http:// in prod | **RESOLVED** | `main.tsx` PROD https assertion (quick-wins). |
| INFO-01/02/03 | Recoverer / feature allowlist / binary artifact scan | **OPEN / TRACKED** | INFO-03 narrowed: verify.yml builds edge; security-scan still needs artifact wiring for CI binary scan. |

**Net at eec2d6f:** all 3 HIGH closed or neutralised (1 resolved, 1 resolved, 1 deferred-by-architecture); MED-01/04 resolved; LOW-02/03/04 resolved. Remaining (MED-02/03/05, LOW-01, INFO-*) are gated to staging / pre-login-launch and tracked in CLAUDE.md.
