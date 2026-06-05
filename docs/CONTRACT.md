# WiseMoney — System Contract

| Field    | Value                                      |
| -------- | ------------------------------------------ |
| Title    | WiseMoney — System Contract            |
| Date     | 2026-06-02; amended 2026-06-03 (§8 provider list + MVP scoping note); amended 2026-06-03 (§5 INV-AUTH-06/07 + reuse-detection obligation — OQ-06 resolved) |
| Version  | CONTRACT v0.1 rev 2026-06-03b              |
| Status   | Draft                                      |
| Owner    | Zadok (design-system / contract master)    |
| Source   | PRD v0.1; SRS v0.1 Rev 2026-06-02         |

Rev 2026-06-02 — Gate-5: INV-EGR-03 amended to mode-split (managed = server-enforced; BYO-key = client-side, user-as-principal) per THREAT_MODEL §5.
Rev 2026-06-03 — §8 provider list updated (NVIDIA hosted removed; OpenRouter added); MVP-scoping note added recording managed=redacted-only at MVP and deferred full-egress (ADR-0011).
Rev 2026-06-03b — §5: INV-AUTH-06 (client token storage) and INV-AUTH-07 (session/lock coupling) added; refresh-token reuse-detection obligation noted; §8 "Must not change" list updated. OQ-06 resolved. (Y4NN decision 2026-06-03; ADR-0012.)

> This document states invariants and guarantees that must hold for the lifetime
> of the system. They are small, precise, and binding. Implementation details
> (schemas, API shapes, FX-rate sources, auth flows, threat mitigations) are
> deliberately delegated to ARCHITECTURE and THREAT_MODEL — only the invariant
> that those documents must not violate is recorded here.
>
> An invariant is a property that is always true. If an implementation candidate
> would break one, it is wrong — refactor, not relax.

---

## 1. Money representation

**INV-MON-01** Every monetary amount stored or transmitted by the system is
represented as **(integer minor units, ISO-4217 currency code)**. Floating-point
types are prohibited for monetary amounts at any storage or transmission boundary.

*Why: floating-point arithmetic is non-associative and produces rounding errors
that compound across aggregations. A two-field integer+currency representation is
exact, currency-aware, and trivially comparable.*

**INV-MON-02** Each Account has exactly one currency, fixed at creation. A
Transaction is denominated in the currency of the Account it belongs to. The
currency of an Account may not change after the first event is recorded against it.

*Why: mixing currencies within an account makes aggregation ambiguous; a fixed
account currency makes every transaction amount unambiguous without a conversion
lookup.*

**INV-MON-03** Aggregated and display values that span multiple currencies are
derived by converting source amounts into a user-chosen BASE currency using
locally-cached, user-editable FX rates. This conversion MUST NOT require a live
network call; offline operation must produce the same derived totals as online
operation given the same cached rates.

*Why: the product's offline-first guarantee (INV-PERS-01) cannot be conditional on
FX-rate availability; offline capture and the dashboard must function identically
regardless of network state.*

**INV-MON-04** Conversion is a display and derivation concern only. The stored
source amounts on Transactions and Accounts are never mutated by a conversion
operation. A recalculation with updated FX rates produces new derived values; it
does not alter any stored amount.

*Why: stored amounts are part of the immutable event log (INV-EVT-01); mutating
them would corrupt the audit trail.*

**INV-MON-05** The rounding rule for currency conversion is: round half-even
(banker's rounding) applied to the result in the TARGET currency's minor unit.
This rule is applied uniformly across all conversion sites.

*Why: a single declared rounding rule eliminates cross-site divergence in derived
totals. Half-even is statistically unbiased over large transaction sets.*

> FX-rate sourcing strategy (manual-only, periodic online refresh, or hybrid) is
> an ARCHITECTURE decision; this CONTRACT binds only the offline-first and
> non-mutation invariants above.

---

## 2. Event-log integrity

**INV-EVT-01** FinancialEvents are append-only and immutable once written. No
event record may be updated or deleted after it has been committed to the log.

*Why: the event log is the single source of truth for the user's complete
financial history. Mutability would silently corrupt derived state and make
the timeline untrustworthy.*

**INV-EVT-02** The current FinancialState snapshot is always derivable by
replaying the full event log from inception. The cached snapshot is an
optimisation; it is never a source of truth independent of the log. If the
snapshot and a fresh replay disagree, the replay result is correct.

*Why: a snapshot that can diverge from its log is a second source of truth,
which destroys the invariant that history is deterministic.*

**INV-EVT-03** A Transaction event references a valid, existing Account ID and a
valid, existing Category ID at the time the event is written. A Budget references
a valid, existing Category ID. These references are stable identifiers; they do
not change if the Account or Category is renamed.

*Why: referential integrity is required for correct replay; a dangling reference
makes aggregation undefined.*

**INV-EVT-04** A Goal's accumulated amount derives exclusively from its
contribution events. No other mechanism may modify the accumulated total directly.

*Why: if the accumulated total can be set independently of contributions, the
event log ceases to be the sole source of truth for Goal state.*

**INV-EVT-05** A RecurringItem's projected occurrences are derived data only.
No projection operation writes to the event log. An occurrence enters the event
log only at the moment the user explicitly realises it (records it as a
Transaction).

*Why: writing speculative future events to the log would corrupt replay; the log
must contain only events that have actually occurred.*

---

## 3. Egress boundary

**INV-EGR-01** No raw transaction data — defined as any combination of amount,
date, merchant, or free-text note that identifies a single transaction — may
appear in a redacted-egress context. The permitted ceiling for redacted-egress
contexts is the FR-CONSENT-07 minimum aggregated set: period totals per category,
overall income and expense totals, net cash flow, budget status as a percentage,
goal progress as a percentage, and trend direction.

*Why: redacted egress is the default and the declined-consent fallback; if raw
transaction detail can appear in it, the consent gate provides no meaningful
protection.*

**INV-EGR-02** Full-egress (raw transaction detail) is permitted ONLY for a
specific AI feature for which the user has granted explicit, individual consent.
Consent for one feature does not extend to any other feature.

*Why: per-feature consent is a locked product decision; cross-feature consent
bleed would render the consent model meaningless.*

**INV-EGR-03** Egress enforcement is mode-dependent:

*(a) Managed mode:* egress enforcement is a server/boundary guarantee. The Go
edge is the enforcement point. Client-side consent state (localStorage) is
advisory context for the UI; it is not the enforcement mechanism. No managed-mode
implementation may rely solely on the client flag to prevent prohibited egress.
The edge must enforce egress shape structurally, independent of the client's
claimed consent level (see THREAT_MODEL §3).

*(b) BYO-key mode:* the user is simultaneously the data subject, the
key-holder, and the sole operator for their own data. No server boundary exists
in this mode by design (INV-AUTH-05). Egress enforcement is client-side only
and is the user's own responsibility as principal. The client consent subsystem
must enforce redacted-vs-full shaping faithfully; the user must be informed
clearly that no server-side enforcement exists in this mode. This client-side
enforcement is the maximum achievable and is accepted by design.

*Why this split: requiring server-side enforcement in BYO-key mode would
structurally eliminate the local-first, no-cloud-dependency property that defines
BYO-key mode (INV-AUTH-05). The distinction is therefore architectural, not a
gap. Managed mode carries the full server-enforcement burden; BYO-key mode
carries an explicit user-as-principal acceptance of client-only enforcement.*

---

## 4. Key handling

**INV-KEY-01 (Managed mode)** Provider keys held by the managed proxy are
server-side only. The client application must never receive, store, cache, or
transmit managed-mode provider keys.

*Why: the entire purpose of managed mode is that the user never possesses the
provider keys; client exposure would defeat the mode.*

**INV-KEY-02 (BYO-key mode)** User-supplied provider keys are encrypted at rest
on-device. They are transmitted ONLY to the intended AI provider endpoint. They
are never transmitted to the managed proxy, never logged, and never included in
error payloads or telemetry.

*Why: BYO keys are user secrets; any transmission to a server other than the
intended provider is a breach of the BYO contract.*

**INV-KEY-03** All key material — managed and BYO — is encrypted at rest at all
times. There is no state in which key material exists unencrypted in persistent
storage.

*Why: key material at rest in plaintext is an unacceptable credential exposure,
regardless of mode.*

**INV-KEY-04** A mode switch (managed ↔ BYO-key) must not cause data loss. The
user's financial data and event log must be fully intact after a mode change.

*Why: a mode switch is an operational choice, not a data migration; losing data on
switch would make mode choice irreversible in practice.*

---

## 5. Authentication (managed proxy)

**INV-AUTH-01** The managed proxy rejects every request that does not carry a
valid, unexpired, server-signed JWT. There is no unauthenticated path to proxy
functionality.

*Why: the proxy is multi-tenant; without authentication every user's provider
budget and context isolation collapses into a shared, anonymous pool.*

**INV-AUTH-02** Passwords are stored exclusively as a salted output of a strong,
one-way, adaptive hash function (e.g. bcrypt, scrypt, or Argon2). Plaintext
passwords and reversibly-encoded passwords must never appear in the data store,
in logs, or in transit.

*Why: password storage is irreversible by design; a reversible encoding is a
credential database, not an auth store.*

**INV-AUTH-03** JWTs are signed with a key known only to the server. The signing
key is never transmitted to any client. Tokens carry an expiry and must be
validated on every proxied request.

*Why: an unsigned or client-visible signing key allows arbitrary token forgery,
defeating per-user isolation.*

**INV-AUTH-04** Per-user isolation is absolute: no user's provider keys, financial
context, or rate budget are accessible to or inferable by another user. Isolation
holds at request routing, rate-limiting, and any state the proxy maintains.

*Why: the proxy is multi-tenant; isolation failure leaks one user's secrets or
budget to another, a direct confidentiality breach.*

**INV-AUTH-05** BYO-key mode requires no authentication. A user operating in
BYO-key mode must be able to use the full application with zero contact with the
managed proxy and zero cloud dependency.

*Why: local-first operation is a user choice, not a degraded mode; requiring auth
for BYO-key would covertly eliminate the local-only path.*

**INV-AUTH-06 (client token storage — managed mode)** In managed mode, the
access token (short-lived JWT) is held exclusively in non-persistent JavaScript
module memory. The refresh token (long-lived opaque, rotating) is persisted
exclusively in the AES-GCM-encrypted IndexedDB store, under the same master key
as financial data and BYO key material, readable only after WebAuthn/passphrase
unlock. Neither token may appear in localStorage, sessionStorage, document.cookie,
or any other unencrypted or non-module-scoped persistent store, at any point in
the token lifecycle.

*Why: localStorage and sessionStorage are readable by any same-origin script,
making tokens stored there trivially extractable via XSS. Auth tokens are live
credentials with materially higher sensitivity than the consent flag already
flagged as a Mishmar concern in INV-EGR-03(a). In-memory access tokens with
encrypted-at-rest refresh tokens is the minimum acceptable posture against the
XSS surface modelled in THREAT_MODEL T-CONSENT-02 / §2.4.*

**INV-AUTH-07 (session/lock coupling — managed mode)** The client's managed-edge
session lifecycle is coupled to store unlock state. When the store is locked, no
managed-edge calls are made and no background token refresh occurs. Token
re-acquisition happens transparently on unlock. There is no provision for
background managed-edge activity while the store is locked.

*Why: decoupling session refresh from store lock state would require the refresh
token to be accessible without unlock — which requires it in an unprotected
location, collapsing the security property established by INV-AUTH-06. The
coupling is not a limitation but a necessary consequence of the encryption model;
financial context (INV-PERS-01) and managed-edge calls both require an unlocked
store, so they are naturally co-dependent by design.*

> Refresh-token reuse-detection obligation: the edge must detect presentation of a
> previously-invalidated (rotated) refresh token and respond by invalidating the
> entire refresh-token family for that user, forcing full re-authentication. This
> is RFC 6749 rotation reuse-detection. It is an edge implementation obligation
> binding on ARCHITECTURE; it carries no wire-format change (JSON body +
> Authorization: Bearer is preserved). Failure to implement reuse-detection removes
> the security property that makes rotating refresh tokens preferable to long-lived
> static tokens.

> Auth mechanism detail (credential storage schema, JWT rotation schedule, brute-
> force defenses, password-reset flow, WebAuthn integration) belongs to ARCHITECTURE
> and THREAT_MODEL. This CONTRACT binds only the invariants and obligations above.

---

## 6. Persistence

**INV-PERS-01 (Offline guarantee)** Capture (recording a Transaction or any
state-changing event) and read operations (Financial State, timeline, dashboard)
succeed with no network connection. The local store is the operative store.

*Why: the product's core promise — always knowing where your money is — fails if
capture or dashboard require network availability.*

**INV-PERS-02 (Encryption at rest)** All financial data and key material are
encrypted at rest on-device at all times. No financial data exists in plaintext
in persistent storage.

*Why: the device is the sole data store for MVP; plaintext at rest exposes the
user's complete financial history to anyone with device access.*

**INV-PERS-03 (JSON export losslessness)** A JSON export is lossless: importing
a JSON export reconstructs the exact local state, including the full event log,
all entity references, and all account/category/goal/budget records. After a
successful JSON import, the system must be in a state indistinguishable from the
state at export time.

*Why: JSON export is the sole backup and restore path for MVP; a lossy or
non-round-trippable export means backup does not actually protect against data
loss.*

**INV-PERS-04 (CSV/XLSX are not restore formats)** CSV and XLSX exports are
human-readable summaries. They may be lossy with respect to event-log structure.
They are explicitly NOT restore-capable and must not be presented to the user as
backup formats.

*Why: a user who treats a CSV as a backup and loses their device loses all their
data; the distinction must be architectural, not just cosmetic.*

**INV-PERS-05 (Local-only for MVP)** The persistence layer does not replicate
data to any cloud service. Financial data leaves the device only through the
explicit export flows (FR-PERSIST-05) or the consent-gated AI egress paths. The
persistence layer itself has no network calls.

*Why: a persistence layer with background network writes would silently violate
the local-first promise regardless of the consent model.*

---

## 7. Managed proxy behaviour

**INV-PROXY-01 (Stateless with respect to financial data)** The managed proxy
does not persist transaction payloads, financial context, AI responses, or any
user financial information between requests. After a request-response cycle,
the proxy retains only authentication and rate-limiting state for the user.

*Why: a proxy that accumulates financial data is no longer a thin router; it
becomes a second data store with its own breach surface, outside the user's
consent model.*

**INV-PROXY-02 (Key material never logged)** The proxy must not log, emit in
error responses, or include in telemetry any key material (provider keys or user
credentials). This applies to both managed-mode keys and any credential used in
authentication.

*Why: logs and telemetry are often stored and accessed by operators; key material
in logs is equivalent to plaintext key storage.*

**INV-PROXY-03 (Normalized AI response contract)** AI provider responses are
normalized to a single internal shape before they reach any application consumer.
No feature module may depend on a provider-specific response format.

*Why: provider-specific coupling makes every provider addition or removal a
cross-cutting change; normalization at the proxy boundary keeps providers
interchangeable.*

**INV-PROXY-04 (Graceful degradation)** Financial State (FR-FS) and Capture
(FR-UI-01, FR-UI-02) remain fully functional when all AI providers are
unavailable. AI-dependent features fail closed with a clear user-facing message.
No AI feature may silently fabricate a response when the provider is unreachable.

*Why: the Financial State layer is the primary product anchor; its availability
must not be coupled to the availability of external AI services.*

---

## 8. What may change vs what must not

The invariants in §1–7 are the stable core of this system. They bind every
layer: client, proxy, persistence, AI orchestration, and export. An implementation
that satisfies the requirements but violates an invariant is incorrect; fix the
implementation.

**May change freely:** UI design, component library, provider set (OpenRouter /
Gemini / OpenAI / others — NVIDIA hosted excluded; see ARCHITECTURE §9a), model
choices and routing configuration, FX-rate sourcing mechanism (manual / periodic
refresh / hybrid), per-feature redaction shapes (beyond the FR-CONSENT-07 minimum
floor), export column layout in CSV/XLSX, dashboard layout and visual design,
learning content library, AI prompt templates.

**MVP provider-strategy scoping note (2026-06-03).** At MVP, managed mode serves
redacted-egress only via free-tier models (OpenRouter free + Gemini free). Full-egress
in managed mode (which INV-EGR-03(a) governs and requires server-boundary enforcement
for) is DEFERRED — no paid no-train provider is configured. INV-EGR-03(a) is not
weakened: managed mode at MVP is structurally redacted-only (a stronger position than
the invariant requires), enforced by the absence of a full-egress provider in the
routing config and the structural payload cap (THREAT_MODEL §3). When a paid provider
is added, INV-EGR-03(a)'s full enforcement obligation activates automatically — the
consent gate (ARCHITECTURE §10a) is already the mechanism.

**Must not change without invalidating this CONTRACT:**
- The integer-minor-units monetary representation (INV-MON-01 through INV-MON-05).
- The append-only, immutable event log (INV-EVT-01, INV-EVT-02).
- The referential-integrity rules for Transactions, Budgets, and Goals
  (INV-EVT-03, INV-EVT-04, INV-EVT-05).
- The redacted-egress ceiling and per-feature full-egress gate
  (INV-EGR-01, INV-EGR-02); the mode-split enforcement principle — managed-mode
  server-enforcement and BYO-key client-side-as-accepted-maximum — (INV-EGR-03).
- Key isolation and encryption-at-rest invariants (INV-KEY-01 through INV-KEY-04).
- Auth and per-user isolation invariants for the managed proxy
  (INV-AUTH-01 through INV-AUTH-05); client token storage and session/lock
  coupling (INV-AUTH-06, INV-AUTH-07); refresh-token reuse-detection obligation.
- Offline-first capture and read guarantee (INV-PERS-01).
- JSON export losslessness (INV-PERS-03).
- Proxy statelesness with respect to financial data (INV-PROXY-01).

If a proposed change would require relaxing any of the above, it requires
explicit re-scoping at the CONTRACT level before implementation begins.

---

## 9. Open questions (contract-level)

**CQ-01 — Account currency mutability after zero events.** INV-MON-02 fixes
account currency after the first event is recorded. The behaviour when a user
wants to "correct" a currency on an account that has never had a transaction (i.e.
the account was just created) is not yet defined. This is a minor edge case but
the CONTRACT should state whether zero-event accounts are an exception or whether
currency is immutable from creation regardless. Deferred to ARCHITECTURE; default
assumption is immutable-from-creation.

---

*End of CONTRACT v0.1. Next in sequence: ARCHITECTURE (Bezalel). This document
owns invariants and guarantees only; schemas, API signatures, FX-rate sourcing,
auth flow detail, and threat mitigations begin with ARCHITECTURE and
THREAT_MODEL respectively.*
