# WiseMoney — Threat Model

| Field   | Value                                                                              |
| ------- | ---------------------------------------------------------------------------------- |
| Title   | WiseMoney — Threat Model                                                       |
| Date    | 2026-06-02                                                                         |
| Version | THREAT_MODEL v0.1                                                                  |
| Status  | Draft                                                                              |
| Owner   | Benaiah (DevSecOps / Mishmar)                                                      |
| Source  | PRD v0.1; SRS v0.1 Rev 2026-06-02; CONTRACT v0.1; ARCHITECTURE v0.1               |

> This document is the adversarial-design layer for WiseMoney. It resolves
> AQ-01 and AQ-02 from ARCHITECTURE §13, calls the INV-EGR-03 coherence question,
> and produces the full STRIDE analysis across the system's assets and trust
> boundaries. It delegates no threat to a later document. Every mitigation listed
> is durable — no workarounds, no "clean up later" patches.

---

## 1. System overview for threat purposes

WiseMoney is a **client-heavy, thin-edge** personal finance system. The threat
surface is dominated by three structural facts:

1. **The client holds the user's complete financial history** — encrypted in
   IndexedDB, decrypted in-memory during a session. The device is both data store
   and processing layer.
2. **A Go edge proxy exists only in managed mode** and holds no financial data;
   it holds provider API keys and the authentication state of managed-mode users.
3. **BYO-key mode has no server in the egress path** — the client talks directly
   to AI providers; the proxy is bypassed entirely.

These facts determine where every threat lands and which mitigations are
structurally achievable.

### 1.1 Trust boundary inventory

| Boundary ID | From           | To                    | Protocol   | Auth                  | Encryption       |
| ----------- | -------------- | --------------------- | ---------- | --------------------- | ---------------- |
| TB-01       | User / browser | PWA client            | Browser    | WebAuthn / passphrase | TLS (HTTPS)      |
| TB-02       | PWA client     | Go edge (managed only)| HTTPS      | JWT (server-signed)   | TLS              |
| TB-03       | Go edge        | AI provider           | HTTPS      | Provider API key      | TLS              |
| TB-04       | PWA client     | AI provider (BYO)     | HTTPS      | User's own API key    | TLS              |
| TB-05       | Go edge        | Postgres              | TCP/socket | DB credentials        | TLS or Unix sock |
| TB-06       | User           | Export file on disk   | Filesystem | None (OS-level)       | None at rest     |
| TB-07       | User           | Import file           | Filesystem | None                  | None at rest     |

### 1.2 Two operating modes — different trust boundaries

The two AI-key modes are architecturally distinct and have different threat
profiles. This is not cosmetic.

**Managed mode:**
- User authenticates to the Go edge with email + password → JWT.
- Edge holds provider keys; client never sees them (INV-KEY-01).
- Every AI request crosses TB-02 and TB-03. The edge is a real enforcement
  boundary (relevant to AQ-01 / INV-EGR-03).
- Postgres holds password hashes (Argon2id) and rate-limit metadata.
- Multi-tenant: cross-tenant isolation is a hard requirement (INV-AUTH-04).

**BYO-key mode:**
- No authentication, no server contact, no cloud dependency (INV-AUTH-05).
- User's own provider keys are encrypted in IndexedDB, decrypted in-memory per
  call, sent directly to the provider over TB-04.
- The consent & redaction subsystem is the only thing between the user's data
  and the provider. The edge is not in the path. This is an architectural limit,
  not a gap.

### 1.3 Assets ranked by sensitivity

| Asset                              | Sensitivity | Location          | Mode     |
| ---------------------------------- | ----------- | ----------------- | -------- |
| Full financial event log (raw txns)| Critical    | IndexedDB (enc.)  | Both     |
| BYO provider API keys              | Critical    | IndexedDB (enc.)  | BYO only |
| Passphrase / master key (in-memory)| Critical    | Memory only       | Both     |
| Managed provider API keys          | Critical    | Go edge env/vault | Managed  |
| JWT signing key                    | Critical    | Go edge env/vault | Managed  |
| Argon2id password hashes           | High        | Postgres          | Managed  |
| JWT access tokens (client-held)    | High        | Browser memory    | Managed  |
| Refresh tokens                     | High        | Browser storage   | Managed  |
| Consent state                      | Medium      | localStorage      | Both     |
| Export files (JSON/CSV/XLSX)       | Critical    | Filesystem/cloud  | Both     |
| Rate-limit metadata                | Low         | Postgres          | Managed  |

---

## 2. STRIDE analysis

### 2.1 HEADLINE — Financial PII egress to third-party AI providers

**Asset:** Raw transaction detail (amounts, dates, merchants, notes, categories,
account names). **Flows:** TB-02+TB-03 (managed full-egress), TB-04 (BYO
full-egress). **Consent gate:** per-feature explicit opt-in.

#### S — Spoofing (not the primary threat here; see §2.4 for auth spoofing)

The egress threat is not identity spoofing; it is data exposure to a third party
whose data-handling practices are outside the user's control once egress occurs.

#### T — Tampering: consent-flag manipulation to escalate to full-egress

- **Threat T-EGR-01.** The client reads consent state from localStorage before
  building an egress context. A user — or malicious script on the same origin —
  can write `{ feature_X: "full" }` to localStorage, causing the consent
  subsystem to shape a full-egress context even if the user never explicitly
  consented through the UI.
- **Threat T-EGR-02.** Clearing localStorage (browser dev tools, OS-level clear,
  or a script) removes consent state. Depending on implementation, this could
  default to full-egress (if "no state = granted") or to a re-prompt. Either
  edge case is a correctness risk.
- **Root cause 1 (applicative):** the consent subsystem reads an unprotected,
  user-writable store as the decision signal.
- **Root cause 2 (infrastructural):** INV-EGR-03 requires enforcement NOT to
  rely solely on the client flag, but the architecture document acknowledged the
  enforcement mechanism was undecided (AQ-01). Without a secondary enforcement
  point in managed mode, T-EGR-01 bypasses the consent model entirely.

#### I — Information disclosure: provider-side retention

- **Threat I-EGR-01 (RESIDUAL — irreducible).** When the user grants full-egress
  consent and raw financial data crosses TB-02/TB-03 or TB-04, the AI provider
  receives complete transaction detail. Provider-side logging, retention, and
  model-training policies are **outside the user's and operator's control** once
  egress occurs. Even with contractual protections, the operator cannot technically
  enforce provider-side data deletion, prevent inference retention, or audit
  what the provider stored.
  - This is the standing tension (intent §"Standing tension"): the product
    deliberately allows full egress with consent. The risk is real and accepted
    by design. It must be named plainly and disclosed to the user — it cannot be
    engineered away.
  - **Must verify:** each provider's (Gemini, NVIDIA NIM, OpenAI) current data
    retention and model-training opt-out terms must be checked before MVP launch.
    Do not assert specifics here; provider terms change. Flag in onboarding and
    in the consent prompt exactly which provider the feature routes to.

#### D — Denial of service: not applicable to egress as a standalone vector.

#### E — Elevation of privilege: not the primary concern for this flow.

**Mitigations for the egress cluster:**

| Mitigation                                                | Component              | MVP/Post |
| --------------------------------------------------------- | ---------------------- | -------- |
| Redacted egress is the default; full egress is opt-in (Gate-1 decision 6) | Consent subsystem | MVP |
| Per-feature consent (not blanket), displayed in plain language naming the specific provider and what is sent | Consent subsystem / UI | MVP |
| Edge structural payload cap in managed mode (see AQ-01 resolution §4) | Go edge | MVP |
| Consent clear → treat as not-granted, never as granted; re-prompt required | Consent subsystem | MVP |
| Provider data-handling terms verified and linked from the consent prompt | Ops / legal review | MVP |
| Egress transparency screen (FR-CONSENT-09) shows live consent state per feature | UI | MVP |
| Warn user that provider-side retention is outside operator control | Consent UX | MVP |

---

### 2.2 Self-managed authentication (managed mode only)

**Assets:** password hashes in Postgres, JWT access tokens, refresh tokens, the
JWT signing key. **Boundary:** TB-01 (login), TB-02 (every proxied request).

#### S — Spoofing: credential theft and token forgery

- **Threat S-AUTH-01: Credential stuffing / brute-force on the login endpoint.**
  The login endpoint accepts email + password. With no rate limiting or lockout on
  the login path specifically, an attacker with a credential list can automate
  attempts. At tens–hundreds of users the blast radius per account is limited but
  the risk to individual accounts is real.
- **Threat S-AUTH-02: JWT forgery if the signing key is leaked.** The signing key
  never leaves the server (INV-AUTH-03). If it is stored in a plaintext env var
  in a Docker Compose file committed to version control, or in a container
  environment that leaks via a debug endpoint, any bearer can forge tokens for any
  user ID.
- **Threat S-AUTH-03: Account enumeration on registration and password-reset
  endpoints.** Timing or messaging differences between "email not found" and
  "wrong password" allow an attacker to enumerate valid accounts. Password reset
  flows that confirm email existence (e.g. "we sent an email to you@example.com"
  vs. "email not found") are classic enumeration vectors.
- **Threat S-AUTH-04: Password-reset token brute-force or predictability.** If
  password-reset tokens are short, URL-guessable, or long-lived without binding to
  a specific user session, an attacker can reset any account.

#### T — Tampering: JWT replay after expiry or revocation

- **Threat T-AUTH-01.** JWTs are stateless; the edge validates signature and
  expiry (INV-AUTH-03) but has no revocation list. If a token is stolen (e.g. via
  XSS from the browser session), it remains valid until expiry. With a long-lived
  access token, this window is unacceptably wide.
- **Root cause 1 (applicative):** no token revocation mechanism (stateless by
  design; revocation requires state or very short lifetimes).
- **Root cause 2 (infrastructural):** JWT lifetime not yet specified in any
  document; a naive default (e.g. 24h) combined with no refresh rotation creates
  a long exfiltration window.

#### I — Information disclosure: Postgres breach

- **Threat I-AUTH-01.** If Postgres is breached, the attacker obtains Argon2id
  password hashes, email addresses, and rate-limit metadata. Argon2id is the right
  choice (INV-AUTH-02) and significantly raises the cost of offline cracking. The
  residual risk is users who chose weak passphrases. Impact is limited: Postgres
  holds no financial data (Gate-4 decision 20). The email address itself is PII.

#### D — Denial of service: rate-limit exhaustion

- **Threat D-AUTH-01.** The in-memory token bucket (ARCHITECTURE §2.2) is
  per-user by design but it resets on process restart. A targeted DoS against a
  specific user's rate budget (e.g. sending many requests to exhaust their AI
  allocation) degrades service for that user at no cost to the attacker beyond a
  valid JWT. At the current scale (tens–hundreds) the shared provider budget is
  the more sensitive resource than individual user rate budgets.

#### E — Elevation: cross-tenant access

- **Threat E-AUTH-01 (Critical).** The Go edge routes requests using the user ID
  extracted from the JWT. If any code path uses an attacker-controlled field in
  the request body — rather than the server-validated JWT subject — to select the
  Postgres row or provider budget, a user can access another user's rate budget or
  (if financial data were ever stored on the edge) their data. With no financial
  data on the edge, the immediate impact is rate budget theft; INV-AUTH-04 is the
  invariant to enforce.
- **Root cause:** trust of a client-supplied user ID instead of the JWT `sub`
  claim for any privileged lookup.

**Mitigations for the auth cluster:**

| Mitigation                                                        | Component         | MVP/Post |
| ----------------------------------------------------------------- | ----------------- | -------- |
| Argon2id (tuned: memory ≥ 64 MiB, 3+ iterations, parallelism 1+) for all passwords | Go edge / Postgres | MVP |
| Short-lived access JWTs (recommend: 15 min) + rotating refresh tokens | Go edge | MVP |
| Refresh token rotation on every use; old token invalidated         | Go edge           | MVP |
| Per-IP and per-account rate limiting on /login and /register (not just per-user AI budget) | Go edge | MVP |
| Constant-time password comparison; identical error message for "no account" and "wrong password" | Go edge | MVP |
| Password-reset token: cryptographically random (≥ 128-bit), single-use, expires ≤ 15 min, bound to user session | Go edge | MVP |
| JWT signing key sourced from secrets manager / env-injected secret, never in a committed file | Ops / Docker Compose | MVP |
| All routing decisions keyed on JWT `sub` claim only; no client-supplied user ID trusted | Go edge | MVP |
| Account lockout or exponential back-off after N failed login attempts | Go edge | MVP |
| SECURITY.md documents all of the above for operators | Repo root | MVP |

---

### 2.3 Multi-tenant isolation on the Go edge

**Asset:** per-user rate budget, provider routing isolation, absence of
cross-tenant financial-context leakage. **Invariant:** INV-AUTH-04.

- **Threat E-TENANT-01 (Critical): context bleed in AI request routing.** If the
  Go edge ever buffers or logs a request payload (which it must not, INV-PROXY-01,
  INV-PROXY-02), or if a shared data structure (e.g. a cache keyed incorrectly)
  causes one user's AI context to be visible to another's response, the isolation
  breaks. At current scale the per-user rate bucket is in-memory; if it is stored
  in a shared map accessed by user ID without proper locking, a race condition can
  debit the wrong bucket.
- **Threat E-TENANT-02: Rate-budget theft via JWT sharing.** A valid JWT can be
  shared by a user with a colluding party. The edge cannot distinguish this from
  normal use. This is a residual and accepted risk at this scale; the mitigation is
  short JWT lifetimes (see §2.2).
- **Mitigation:** all per-user state (rate bucket, routing context) is accessed
  exclusively via the JWT `sub` claim. No shared mutable data structures across
  users. Concurrent map access protected by appropriate locking (Go `sync.Map` or
  mutex-guarded map). No request-payload buffering at any middleware layer.

---

### 2.4 Consent integrity

**Asset:** the per-feature consent decision stored in localStorage. **Invariant:**
INV-EGR-03. **Boundary:** TB-01 (user-to-client) and implicitly TB-02/TB-04.

- **Threat T-CONSENT-01:** localStorage tampered to escalate to full-egress (see
  T-EGR-01 above; the same threat). Covered in §2.1.
- **Threat T-CONSENT-02:** XSS on the PWA origin can read and write localStorage,
  including consent state and any unencrypted data there. Since financial data is
  in IndexedDB (encrypted) and consent state is in localStorage (unencrypted),
  an XSS can modify consent decisions without stealing financial data directly.
  An XSS that sets all features to full-egress and triggers an AI call would
  cause raw financial data to egress to the provider without user awareness.
- **Root cause 1 (applicative):** consent state is unencrypted and mutable from
  JavaScript running on the same origin.
- **Root cause 2 (infrastructural):** the PWA assembles AI contexts client-side
  from IndexedDB data; a script that can both flip consent and trigger an AI
  call has a full exfiltration path.
- **Mitigation — primary:** strict Content Security Policy (CSP) to prevent XSS.
  No inline scripts. All third-party dependencies pinned and integrity-checked
  (SRI hashes). These are the controls that make XSS hard, which removes the
  precondition.
- **Mitigation — secondary:** the Go edge structural payload cap (AQ-01
  resolution, §4) closes the managed-mode exfiltration path even if XSS succeeds.
  BYO-key mode cannot have this secondary; therefore CSP is especially important
  for BYO-key users.

---

### 2.5 Encryption at rest and key management

**Assets:** master key (in-memory), passphrase (never stored), WebAuthn-wrapped
key, IndexedDB encrypted store. **Architecture:** ARCHITECTURE §7. **Invariants:**
INV-PERS-02, INV-KEY-03.

#### S — Spoofing: WebAuthn bypass or platform impersonation

- **Threat S-KEY-01.** WebAuthn is the day-to-day unlock convenience layer (not
  the root of trust). If the authenticator is cloned (platform authenticator
  backup, iCloud Keychain sync) or the device OS is compromised, an attacker can
  unlock the session. WebAuthn was chosen as a convenience layer; the passphrase
  remains the cryptographic root. This threat is mitigated by the design: losing
  the device does not lose the data to the attacker unless they also have the
  passphrase (because the WebAuthn-wrapped key is stored on the same device; an
  attacker with physical device access and OS compromise can reach the wrapped
  key, but they still need the WebAuthn authenticator gesture or to bypass the OS
  biometric).
  - **Residual risk (accepted):** platform authenticator sync (e.g. iCloud
    Keychain) could carry the wrapped key to other devices. Users should be told
    the passphrase is the only root of trust and the WebAuthn wrap is a
    convenience, not a second factor in the cryptographic sense.

#### T — Tampering: weak passphrase attack

- **Threat T-KEY-01.** Argon2id is the KDF (ARCHITECTURE §7). If a user chooses a
  weak passphrase (e.g. "password123"), Argon2id's memory cost makes offline
  cracking expensive but not impossible — a targeted attack against a high-value
  user with a known-weak passphrase is plausible. The JSON export file, once on
  disk or cloud storage unencrypted, can be attacked offline at leisure with no
  rate limiting.
- **Mitigation:** enforce a minimum passphrase quality bar in the UI (length +
  basic entropy check). Communicate to the user that the passphrase is the sole
  recovery mechanism and that losing it means losing data. Argon2id parameters
  must be tuned to current hardware: suggest memory ≥ 64 MiB, time ≥ 3, as a
  starting floor; tune upward on target hardware.

#### I — Information disclosure: key material in logs or error messages

- **Threat I-KEY-01.** The master key exists unencrypted in JavaScript memory
  during a session. Browser crash reports, developer-tools snapshots, or any
  logging framework that serialises the global object could capture it. This is an
  unavoidable property of any in-memory key. Mitigations are: never log or emit
  objects that could contain key material; clear memory explicitly on session end
  (to the extent the JS runtime permits); scope the in-memory key lifetime to the
  minimum needed.
- **Threat I-KEY-02.** The Go edge must never log BYO keys (INV-PROXY-02,
  INV-KEY-02). BYO keys are not transmitted to the edge by design (INV-KEY-02),
  so the risk is narrower than it reads — but if a future code path forwards
  request headers or bodies to logs for debugging, a developer could unknowingly
  break INV-PROXY-02. The mitigation is a structural log sanitizer in the Go
  middleware that strips the Authorization header and any `api_key` body field
  before any log write.

#### D — Data loss: lost passphrase

- **Threat D-KEY-01 (accepted, by design).** Losing the passphrase makes the
  encrypted IndexedDB store permanently unrecoverable. This is an explicit design
  decision (ARCHITECTURE §7: "Lose passphrase = lose data (JSON export is the
  recovery path)"). The mitigation is the lossless JSON export (INV-PERS-03) as
  the recovery path.
  - **Implementation requirement:** the app must actively prompt the user to
    export regularly, and the export prompt must make the irreversibility of
    passphrase loss unambiguous. This is not a post-MVP concern; it belongs in
    the initial onboarding and in-app nudges.

---

### 2.6 BYO provider key security

**Asset:** user-supplied AI provider API keys. **Invariant:** INV-KEY-02.
**Boundary:** TB-04 (client → provider).

- **Threat I-KEY-03: BYO key exfiltration via log or error path.** The key is
  decrypted in-memory per call. If the provider returns an error that includes the
  key material in a reflected field, or if the client logs the request object
  (which includes the Authorization header), the key is exposed. The AI
  orchestration client must never log request objects that include API key headers.
- **Threat I-KEY-04: BYO key sent to wrong endpoint.** If the provider-adapter
  configuration is misconfigured (wrong base URL), the BYO key could be sent to an
  attacker-controlled endpoint. This is a SSRF-adjacent threat. Mitigation: the
  allowed provider endpoints are a hardcoded allow-list in the client build, not
  operator-editable at runtime. A future provider is added by adding to the
  allow-list in code — not by user configuration.
- **Threat I-KEY-05: XSS steals the IndexedDB master key and derives the BYO
  key.** If XSS runs on the PWA origin, it can call the Web Crypto decrypt API
  in the context of the authenticated session, decrypting the BYO key store.
  Primary mitigation: strict CSP. Secondary: BYO keys are only in-memory at the
  moment of use; they are not in a global accessible object.

---

### 2.7 Export files (JSON / CSV / XLSX)

**Asset:** the export file contains the user's complete financial event log —
every transaction, amount, date, merchant, note, category, balance, goal, and
budget. It is the most complete snapshot of the user's financial life in a single
file, and it sits on the filesystem or cloud storage **in plaintext**. The export
is also the sole recovery path (INV-PERS-03).

- **Threat I-EXPORT-01 (High).** An unencrypted JSON export on a cloud storage
  service (iCloud Drive, Google Drive, Dropbox) is accessible to the cloud
  provider, to any application with storage permissions, and to anyone who gains
  access to the user's cloud account. The financial detail in the export is
  equivalent to granting read access to the encrypted IndexedDB store but without
  the passphrase protection.
- **Threat I-EXPORT-02.** CSV and XLSX exports are human-readable and more likely
  to be opened, emailed, or shared inadvertently. They do not support full restore
  (INV-PERS-04) but still contain sensitive financial data.
- **Root cause 1 (applicative):** no encryption applied to export files; they are
  plaintext by current design.
- **Root cause 2 (user-behaviour):** users are likely to store exports in cloud
  backup locations; the security property of the local-encrypted store is lost at
  export time.

**Mitigations:**

| Mitigation                                                             | MVP/Post |
| ---------------------------------------------------------------------- | -------- |
| **MVP minimum:** warn the user explicitly at export time that the exported file contains their complete financial history in plaintext and is not protected by the app's encryption | MVP |
| **MVP minimum:** document in the export UI that the JSON file is the restore format and must be stored securely; it should be treated as a credential | MVP |
| **Recommended, not MVP-blocking:** offer an optional encrypted export (passphrase-protected ZIP or a separately-encrypted JSON blob) so the user can store the export in cloud without exposing it. The key for the encrypted export should be the same passphrase or a user-chosen export-specific passphrase | Post-MVP |

The plaintext export is an accepted residual risk for MVP with explicit user
disclosure. Encrypted export is the durable long-term solution and should be
prioritised as the first post-MVP security item.

---

### 2.8 Go edge — proxy threats

**Assets:** managed provider API keys (server-side), the JWT signing key, Postgres
auth data. **Boundaries:** TB-02, TB-03, TB-05.

#### S — SSRF via provider routing

- **Threat S-PROXY-01.** The request router selects a provider endpoint from the
  routing config. If an operator-controlled config field (or a future
  user-controlled field) can set an arbitrary URL for a provider endpoint, an
  attacker with config write access can redirect AI requests to internal network
  endpoints (SSRF). Mitigation: provider endpoint URLs are hardcoded in the build
  (no runtime user-configurable URL fields); the routing config sets which
  provider/model to use by name, not by URL.

#### T — Tampering: dependency / supply-chain

- **Threat T-PROXY-01.** The Go edge uses go modules (golang-jwt, x/crypto,
  chi, pgx). A compromised upstream module could inject malicious code into the
  build. At the scale of this product, a targeted supply-chain attack is unlikely
  but the blast radius — the edge holds provider keys and signs JWTs — makes it
  worth treating.
  - **Mitigation:** pin all go.mod dependencies to specific versions (already
    expected for Go modules); verify module checksums (go.sum is mandatory, must
    be committed); enable `GONOSUMCHECK` only where explicitly required and
    documented; prefer well-known, widely-audited packages (golang-jwt,
    x/crypto/argon2, chi, pgx are all mainstream); run `govulncheck` in CI on
    every dependency change.
  - **Mitigation:** the Docker image is distroless (ARCHITECTURE §11); the attack
    surface of the container is minimal. Pinned image versions (harness
    primitive — no `:latest`).

#### I — Payload logging

- **Threat I-PROXY-01.** A developer adds structured request logging to the Go
  edge for debugging. The log serializes the full request body, which contains
  the AI context (in full-egress mode: raw financial data). This is a direct
  violation of INV-PROXY-01 / INV-PROXY-02 and results in financial data at rest
  in a log store.
  - **Mitigation (structural):** the Go edge middleware must sanitize log output
    before writing. A log middleware layer intercepts and strips: Authorization
    headers, any `api_key` fields in request/response bodies, and the AI context
    payload body. Only metadata (method, path, status, latency, user ID) is
    logged. No request-body content is logged. This must be the only logging path.

#### D — Rate-limit bypass / provider budget exhaustion

- **Threat D-PROXY-01.** The in-memory token bucket resets on process restart. A
  user can exhaust their budget, wait for a restart (or cause one via OOM / crash),
  and reset the counter. At the current scale the provider budget impact is bounded
  but real.
  - **Mitigation:** at current scale (tens–hundreds), this is an accepted
    operational risk. The documented Redis scale-out path resolves it
    structurally. Monitor provider spend; set provider-side budget caps where
    the provider supports it.
- **Threat D-PROXY-02.** An attacker with a valid JWT can send AI requests at the
  maximum rate continuously, exhausting provider quota and degrading service for
  other users. The per-user token bucket mitigates this; the provider-side budget
  cap is the backstop.

---

### 2.9 Postgres — scope and hardening

**Assets:** email addresses, Argon2id password hashes, rate-limit metadata.
**No financial data** (Gate-4 decision 20, INV-PROXY-01). **Boundary:** TB-05.

- **Threat I-PG-01.** A Postgres breach exposes email addresses and Argon2id
  hashes. Argon2id is correctly chosen (INV-AUTH-02); the marginal risk is weak
  passphrases. The financial data is not in Postgres — this is the most important
  architectural isolation for breach impact.
- **Threat I-PG-02.** Database credentials stored in a committed Docker Compose
  file or environment file give an attacker with repo read access the ability to
  connect to Postgres directly. Mitigation: secrets via SOPS/age (harness
  primitive); never plaintext in version control.
- **Mitigation cluster:** Postgres must be accessible only from the Go edge
  container on the Docker network (no public port binding); database credentials
  injected at runtime via environment (SOPS/age encrypted); least-privilege DB
  user (SELECT/INSERT/UPDATE on the auth tables only, no superuser); TLS or
  Unix-socket connection between the Go edge and Postgres.

---

## 3. AQ-01 resolution — managed-mode egress enforcement mechanism

**Question (from ARCHITECTURE §13):** How does the Go edge enforce
redacted-vs-full-egress shape without trusting the client's localStorage flag
(INV-EGR-03)?

### Options evaluated

**Option A: Edge re-derives the egress shape from a server-side consent record.**
The edge maintains a consent record per user in Postgres (or in-memory). On each
AI request, it checks the server-side record, re-derives the permitted egress
level, and either passes the request or strips disallowed fields from the payload.

- Upside: strong enforcement; consent state is authoritative on the server.
- Downside: (1) the CONTRACT says the Go edge holds no financial business logic
  and no context about the user's data (INV-PROXY-01); evaluating what "raw
  transaction data" means requires understanding the payload schema, which is
  domain logic. (2) Storing a consent record per user in Postgres adds state the
  edge currently does not have and creates a sync problem (user consents in the
  client; when does the server learn?).

**Option B: Signed consent assertion.**
The consent subsystem in the client produces a short-lived, server-signed
assertion (e.g. a signed JSON blob containing `{ user_id, feature, level,
expires_at }`) that the client presents with each AI request. The server issues
this assertion at consent-grant time (requiring a round-trip to the server when
consent changes). The edge validates the signature and the expiry before accepting
a full-egress request.

- Upside: the edge does not need to store or understand consent; it validates a
  cryptographic assertion. No domain logic on the edge.
- Downside: (1) requires a consent-grant API endpoint on the edge, which adds
  complexity; (2) the client still assembles the payload, so the edge is trusting
  the assertion without inspecting the payload content. A misbehaving client can
  claim full-egress consent and send a full payload; the assertion proves consent
  was granted, not that the payload is correctly shaped.

**Option C: Structural payload caps at the edge.**
The edge imposes a hard structural limit on what it will forward: when a request
arrives claiming redacted-egress mode, the edge accepts only requests whose
payload matches a schema that cannot contain raw transaction detail (e.g.
aggregate fields only). When a request claims full-egress, the edge validates
the signed consent assertion (Option B) before forwarding. No payload inspection
for field-level financial semantics is required — the distinction is structural
(aggregate schema vs. any schema).

- Upside: enforcement is at the boundary, not in the client. The edge does not
  interpret financial meaning; it enforces schema shape. Combines well with
  Option B for full-egress gating.
- Downside: requires a defined schema contract between client and edge for
  redacted-egress payloads. Adds a versioning surface.

### Recommendation: Option C + Option B for full-egress

**The edge MUST implement structural payload caps (Option C) for managed mode.**
Specifically:

1. Every AI request to the edge carries a mode header (`X-Egress-Level: redacted`
   or `full`).
2. For `redacted` requests: the edge validates that the request body conforms to
   a defined aggregate-only schema (the FR-CONSENT-07 / INV-EGR-01 ceiling in
   JSON schema form). Any request body containing fields that can only appear in
   full-egress contexts (individual transaction amounts, dates, merchant names,
   notes) is **rejected at the edge** with a 400. The client's claimed egress
   level is not trusted; the payload is inspected structurally.
3. For `full` requests: the edge requires a valid, server-signed, short-lived
   consent assertion (Option B) for the specific feature. Without it, the request
   is treated as `redacted` (fail-safe default). With it, the payload is
   forwarded without field-level inspection (the client assembled it; the consent
   was proved).
4. The schema definitions for redacted-egress payloads must be versioned and
   maintained alongside the client's context-builder. Additions to the
   aggregate-only schema require an edge deployment.

This resolves AQ-01 durably: egress enforcement is at the boundary (INV-EGR-03),
does not require domain logic on the edge, and fails to redacted by default when
consent assertion is absent. It is durable — no workaround and no client-trust
gap.

---

## 4. AQ-02 resolution — BYO-key residual client-trust

**Question (from ARCHITECTURE §13):** Is the residual client-side trust in BYO-key
mode acceptable?

### Analysis

In BYO-key mode the client:
- Holds and decrypts the user's own API key.
- Assembles the AI egress payload using the consent subsystem.
- Sends the request directly to the provider (TB-04).
- Receives and renders the response.

The edge is not in the path. There is no server boundary. Egress shaping is
entirely client-side.

**The trust model:** the user in BYO-key mode is simultaneously the data subject,
the key-holder, the consent decision-maker, and the system operator for their
own data. They chose to use BYO-key mode knowing it implies full local control
and full local responsibility. A user who bypasses client-side consent enforcement
in BYO-key mode is bypassing enforcement of a decision they themselves made,
with their own key, for their own data, sent to a provider they chose.

**Is this acceptable?** Yes — with one condition.

The residual client-trust in BYO-key mode is acceptable because:
1. The user is the sole principal. There is no other party whose data is at risk.
   This is single-user, single-device, single-key-holder: the "attacker" who
   could tamper with consent enforcement in BYO-key mode is the user themselves.
2. The multi-tenant isolation concern (INV-AUTH-04) does not apply — there are
   no other tenants in BYO-key mode.
3. The architectural alternative — requiring a server boundary for all egress even
   in BYO-key mode — defeats the purpose of BYO-key mode (local-first, no cloud
   dependency, INV-AUTH-05).

**The one condition:** the product must not misrepresent BYO-key mode as having
server-side enforcement. The consent UI in BYO-key mode must clearly indicate
that egress shaping is applied by the app on the user's device, and that the
user's API key and data go directly to the chosen provider. The user must know
what they are trusting and what they are not.

**Residual risk (stated plainly):** a compromised PWA build (supply-chain attack
on the client bundle, or a malicious service worker) in BYO-key mode bypasses all
client-side consent enforcement and can exfiltrate raw financial data to an
attacker-controlled endpoint using the user's own API key (or by constructing
requests with a forged key). The mitigation is supply-chain integrity of the
client build (SRI, pinned dependencies, content security policy) and that the
PWA is served from a trustworthy origin.

---

## 5. INV-EGR-03 coherence call

**The problem:** INV-EGR-03 states "no implementation may rely solely on the
client flag to prevent prohibited egress." In managed mode this is satisfiable
(the edge is the enforcement boundary — see §3). In BYO-key mode it is
structurally unsatisfiable: there is no server boundary; the client flag is
necessarily the only egress gate.

**Call: the CONTRACT must be amended.**

INV-EGR-03 as written applies uniformly to both modes, but the architecture
resolves that BYO-key mode cannot satisfy it without destroying the mode's
defining property (local-first, no cloud dependency). The invariant is correct
for managed mode and must remain binding there. It is inapplicable as written
to BYO-key mode.

**Recommended amendment to CONTRACT INV-EGR-03 (exact text — for Zadok to apply):**

> **INV-EGR-03 (amended)**
>
> Egress enforcement is mode-dependent:
>
> *(a) Managed mode:* egress enforcement is a server/boundary guarantee. The Go
> edge is the enforcement point. Client-side consent state (localStorage) is
> advisory context for the UI; it is not the enforcement mechanism. No managed-mode
> implementation may rely solely on the client flag to prevent prohibited egress.
> The edge must enforce egress shape structurally, independent of the client's
> claimed consent level (see THREAT_MODEL §3).
>
> *(b) BYO-key mode:* the user is simultaneously the data subject, the
> key-holder, and the sole operator for their own data. No server boundary exists
> in this mode by design (INV-AUTH-05). Egress enforcement is client-side only
> and is the user's own responsibility as principal. The client consent subsystem
> must enforce redacted-vs-full shaping faithfully; the user must be informed
> clearly that no server-side enforcement exists in this mode. This client-side
> enforcement is the maximum achievable and is accepted by design.
>
> *Why this split:* requiring server-side enforcement in BYO-key mode would
> structurally eliminate the local-first, no-cloud-dependency property that defines
> BYO-key mode (INV-AUTH-05). The distinction is therefore architectural, not a
> gap. Managed mode carries the full server-enforcement burden; BYO-key mode
> carries an explicit user-as-principal acceptance of client-only enforcement.

Zadok should apply this amendment to CONTRACT §3 before implementation begins on
the egress subsystem.

---

## 6. Mitigations table

| ID          | Threat                                         | Mitigation                                                   | Component              | MVP/Post |
| ----------- | ---------------------------------------------- | ------------------------------------------------------------ | ---------------------- | -------- |
| M-EGR-01    | Consent flag tampered to escalate egress       | Edge structural payload cap + signed consent assertion for full-egress (§3) | Go edge | MVP |
| M-EGR-02    | localStorage cleared → defaults to full-egress | Clear = not-granted; re-prompt required; never assume granted | Consent subsystem | MVP |
| M-EGR-03    | Provider-side retention outside operator control | Disclose to user; verify provider terms; link from consent prompt | UX + ops | MVP |
| M-EGR-04    | XSS flips consent + triggers AI call          | Strict CSP, SRI on all third-party assets, no inline script  | PWA build / infra      | MVP |
| M-AUTH-01   | Credential stuffing / brute-force             | Per-IP + per-account rate limit + lockout on /login          | Go edge                | MVP |
| M-AUTH-02   | JWT forgery via leaked signing key            | Key from secrets manager (SOPS/age), never committed        | Ops / Docker Compose   | MVP |
| M-AUTH-03   | Account enumeration                           | Constant-time comparison; uniform error messages            | Go edge                | MVP |
| M-AUTH-04   | Password-reset token attack                   | 128-bit random token, single-use, 15-min TTL, user-session-bound | Go edge           | MVP |
| M-AUTH-05   | Long JWT window after token theft             | 15-min access JWT + rotating refresh token                  | Go edge                | MVP |
| M-AUTH-06   | Cross-tenant routing via client-supplied ID   | All routing keyed on JWT `sub` only; no client-supplied user ID trusted | Go edge       | MVP |
| M-KEY-01    | Weak passphrase enables offline crack         | Enforce min entropy at setup; Argon2id ≥ 64 MiB / 3 iter   | PWA client             | MVP |
| M-KEY-02    | Passphrase loss = data loss                   | Active in-app export prompts; unambiguous irreversibility warning | PWA client / UX    | MVP |
| M-KEY-03    | BYO key sent to wrong endpoint                | Provider endpoint allow-list hardcoded in client build; not user-configurable | PWA client   | MVP |
| M-KEY-04    | Key material in logs / error messages         | Go middleware log sanitizer strips Authorization + api_key fields; client never logs request objects | Go edge + client | MVP |
| M-KEY-05    | WebAuthn-wrapped key synced off-device        | Inform user passphrase is sole cryptographic root; WebAuthn is convenience only | UX / docs     | MVP |
| M-EXPORT-01 | Plaintext export stored in cloud              | Explicit export-time warning; treat export file as credential | UX | MVP |
| M-EXPORT-02 | Export file has no passphrase protection      | Offer optional encrypted export                             | PWA client             | Post-MVP |
| M-PROXY-01  | SSRF via provider endpoint config             | Provider endpoints hardcoded; routing config selects by name, not URL | Go edge       | MVP |
| M-PROXY-02  | Go module supply-chain compromise             | Pinned go.sum, govulncheck in CI, distroless image          | CI / Docker            | MVP |
| M-PROXY-03  | Request body logged (financial data)          | Structural log sanitizer middleware; only metadata logged   | Go edge                | MVP |
| M-PROXY-04  | Rate-limit state lost on restart              | Accept at current scale; Redis scale-out when warranted; provider-side budget caps | Ops | Post-MVP |
| M-PG-01     | Postgres breach exposes hashes + emails       | No financial data in Postgres; Argon2id hashes; strong passphrase requirements | Arch (existing) | MVP |
| M-PG-02     | DB credentials in committed files            | SOPS/age for all secrets; no plaintext env files committed  | Ops / Docker Compose   | MVP |
| M-PG-03     | Direct Postgres access                        | Port not exposed publicly; edge-only network access; least-privilege DB user | Docker / infra | MVP |

---

## 7. Residual risks accepted

These risks remain after all MVP mitigations and are accepted by design for this
product at this scale (personal-finance, tens–hundreds of users).

| Risk                                    | Why accepted                                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Provider-side retention/training on full-egress data | Irreducible once data egresses. Mitigated by disclosure, consent, and verified provider terms. The user consciously opted in. |
| BYO-key mode client-side-only consent enforcement | User is sole principal, key-holder, and data subject. Server enforcement would eliminate the mode's defining property. Disclosed to user. |
| Passphrase loss = unrecoverable data    | Explicit design choice. Recovery is the JSON export. Mitigated by active export prompts. |
| Plaintext export file (MVP)            | Disclosed at export time. Encrypted export is post-MVP. |
| Rate-limit state lost on edge restart  | Acceptable at current scale. Redis path documented. |
| JWT cannot be revoked (stateless)      | Mitigated by 15-min token lifetime. Full revocation requires server state (post-MVP if needed). |
| WebAuthn platform authenticator sync  | User-level awareness; passphrase remains cryptographic root. |

---

## 8. Decisions needed from Y4NN

These are genuine decisions that cannot be resolved by analysis alone:

1. **Encrypted export — MVP or post-MVP?** The threat analysis shows plaintext
   export is a meaningful disclosure risk (§2.7, Threat I-EXPORT-01). The
   recommended encrypted-export option is listed as Post-MVP; if Y4NN considers
   the disclosure risk unacceptable for MVP, encrypted export must move to MVP.
   This is a product-scope decision, not a security-analysis one.

2. **Consent assertion endpoint on the Go edge (AQ-01 implementation).** The
   recommended AQ-01 resolution (§3) requires the edge to issue short-lived
   signed consent assertions when the user grants full-egress consent. This adds
   an endpoint to the Go edge beyond the current auth + AI-proxy scope. Y4NN
   should confirm this scope addition to the edge is approved before Bezalel
   implements it.

3. **Provider data-handling terms — must verify before MVP launch.** The threat
   model flags (§2.1, I-EGR-01) that Gemini, NVIDIA NIM, and OpenAI data
   retention and model-training opt-out terms must be verified and linked from the
   consent prompt. This is an operational and legal-review item, not a code item.
   Someone must own this verification before the product ships.

4. **Minimum passphrase quality bar.** The threat model recommends a minimum
   entropy check (§2.5, M-KEY-01) but does not specify the exact policy (length,
   complexity, dictionary check). Y4NN should confirm the acceptable UX trade-off
   (stricter = more secure, more friction for the Overwhelmed Tracker persona).

---

*End of THREAT_MODEL v0.1. Authored by Benaiah (Mishmar). Resolves AQ-01 and
AQ-02 from ARCHITECTURE v0.1. Contains the recommended INV-EGR-03 amendment for
Zadok to apply to CONTRACT §3. Next in sequence: C4 diagrams (Meshullam).*
