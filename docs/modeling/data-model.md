# WiseMoney — Data Model

| Field   | Value                                                                   |
| ------- | ----------------------------------------------------------------------- |
| Title   | Data Model — IndexedDB (client) + PostgreSQL (edge)                     |
| Date    | 2026-06-02                                                              |
| Version | MODELING T-S0-01 v0.1                                                   |
| Status  | Draft                                                                   |
| Owner   | Shallum (databases)                                                     |
| Source  | CONTRACT v0.1; ARCHITECTURE v0.1; diagrams/UML/01-domain-er.md v0.1    |

> Design artifact only. No DDL is executed here. Migration execution is owned
> by Y4NN. The phrase "DESIGNED — to be applied by Y4NN" marks every runnable
> statement in this document.

---

## A. Client store — IndexedDB via Dexie

All financial data lives exclusively on-device, never on the edge (INV-PROXY-01,
INV-PERS-01, INV-PERS-05). The entire Dexie database is AES-GCM encrypted at rest
(INV-PERS-02, INV-KEY-03, ARCHITECTURE §7).

### A.1 Encryption boundary — key design decision

IndexedDB cannot index ciphertext. The scheme must balance query capability
(structural index access) against the requirement that sensitive financial detail
is never in plaintext at rest (INV-PERS-02).

**Decision: per-record AES-GCM envelope with structural plaintext index keys.**

Each stored record is divided into two parts:

```
{
  // --- PLAINTEXT (structural index keys only) ---
  id          : string          // stable UUID, never reused
  timestamp   : number          // Unix ms, UTC — for time-range queries
  type        : string          // event type or entity discriminator
  entityId    : string          // FK reference (accountId, categoryId, goalId, etc.)
  periodMonth : string | null   // "YYYY-MM" — budget period key (budget store only)
  currency    : string | null   // ISO-4217 — account-level, immutable from creation

  // --- ENCRYPTED (AES-GCM) ---
  ciphertext  : Uint8Array      // all financial payload: amounts, notes, merchant,
                                //   category names, tags, labels, balances, rates
  iv          : Uint8Array      // 96-bit nonce, unique per record
}
```

**What stays plaintext (indexable):** structural identity and relationship keys
only — `id`, `timestamp`, `type`, `entityId`, `periodMonth`, `currency`. These
carry no financial amount, no merchant, no note, no category name.

**What is encrypted (in `ciphertext`):** every field that constitutes financial
detail — all `Money` values (`minorUnits` + `currency` within a payload),
transaction `note`, merchant/label, category `name`, tag arrays, goal `name`,
budget `limit`, FX rate values, BYO key material. The Money value object is
correct: amounts live inside the encrypted payload and are therefore not indexable.
This is intentional and correct per INV-MON-01 — the constraint is on storage
type (no float), not on indexability.

**Encryption envelope:** AES-GCM, 256-bit key derived via Argon2id from the user's
passphrase (or unwrapped from the WebAuthn-held wrapped copy on daily unlock).
The `iv` is a 96-bit random nonce generated per-record at write time and stored
alongside the `ciphertext`.

**Residual metadata leakage — THREAT_MODEL flag:**
The plaintext structural keys leak non-trivial metadata even without the
ciphertext: timestamps reveal activity patterns (time-of-day, frequency, periods
of inactivity); event `type` distribution reveals behavioural patterns (how many
transactions, budget updates, goal events); `entityId` references reveal which
accounts and categories are used and how frequently; `periodMonth` reveals which
months have budget activity. An adversary with device read access to the raw
IndexedDB bytes learns: when the user was financially active, how often, across
how many accounts and categories, and the period structure of their budget
behaviour — without knowing any amounts, merchants, or notes.
**This is an accepted, documented trade-off required to support offline-first
querying.** Benaiah (THREAT_MODEL) must carry this as an open threat item.

### A.2 Object stores

#### `financialEvents` (source of truth — append-only, INV-EVT-01)

```
financialEvents {
  id          : string          // UUID PK — plaintext, indexed (auto by Dexie PK)
  timestamp   : number          // Unix ms UTC — plaintext, indexed
  type        : string          // event type enum — plaintext, indexed
  entityId    : string          // primary referenced entity id — plaintext, indexed
  ciphertext  : Uint8Array      // encrypted payload (actor, full typed payload)
  iv          : Uint8Array      // AES-GCM nonce
}

Dexie indexes: "id", "timestamp", "type", "entityId", "[type+timestamp]"

Invariants:
  - No update or delete path exists on this store (INV-EVT-01).
  - A read of the full log by timestamp ascending is the replay path (INV-EVT-02).
  - entityId is validated at append time against the projection stores (INV-EVT-03).
  - Money amounts (minorUnits, currency) live inside ciphertext — never plaintext (INV-MON-01).
```

#### `accounts` (projection — derived from event log)

```
accounts {
  id          : string          // UUID PK — plaintext, indexed
  currency    : string          // ISO-4217 — plaintext, indexed (immutable from creation,
                                //   INV-MON-02, ARCHITECTURE §6)
  isActive    : boolean         // plaintext — to support active-account filter queries
  ciphertext  : Uint8Array      // name, type, initialBalance (Money), currentBalance (Money)
  iv          : Uint8Array
}

Dexie indexes: "id", "currency", "isActive"

Note: currentBalance is derived/cached from replay; replay wins over cache (INV-EVT-02).
      isActive is stored plaintext to allow filtering without decrypting every record.
      The plaintext boolean leaks which accounts are active — accepted metadata leakage
      (same category as timestamp metadata above).
```

#### `transactions` (projection — derived from event log)

```
transactions {
  id          : string          // UUID PK — plaintext
  timestamp   : number          // Unix ms UTC — plaintext, indexed
  accountId   : string          // FK ref — plaintext, indexed (INV-EVT-03)
  categoryId  : string          // FK ref — plaintext, indexed (INV-EVT-03)
  ciphertext  : Uint8Array      // amount (Money), direction, note, tags
  iv          : Uint8Array
}

Dexie indexes: "id", "timestamp", "accountId", "categoryId", "[accountId+timestamp]",
               "[categoryId+timestamp]"
```

#### `categories` (projection — derived from event log)

```
categories {
  id          : string          // UUID PK — plaintext
  parentId    : string | null   // self-referential FK — plaintext, indexed (INV-EVT-03)
  isSystemDefault : boolean     // plaintext — drives UI distinction
  ciphertext  : Uint8Array      // name
  iv          : Uint8Array
}

Dexie indexes: "id", "parentId"
```

#### `budgets` (projection — derived from event log)

```
budgets {
  id          : string          // UUID PK — plaintext
  categoryId  : string          // FK ref — plaintext, indexed (INV-EVT-03)
  periodMonth : string          // "YYYY-MM" — plaintext, indexed (INV-EVT-03)
  ciphertext  : Uint8Array      // limit (Money), spent (Money, derived)
  iv          : Uint8Array
}

Dexie indexes: "id", "categoryId", "periodMonth", "[categoryId+periodMonth]"

Note: spent is a derived projection, not independently authoritative (INV-EVT-02).
```

#### `goals` (projection — derived from event log)

```
goals {
  id          : string          // UUID PK — plaintext
  ciphertext  : Uint8Array      // name, targetAmount (Money), accumulatedAmount (Money, derived),
                                //   targetDate
  iv          : Uint8Array
}

Dexie indexes: "id"

Note: accumulatedAmount derives exclusively from goalContributions replay (INV-EVT-04).
      No plaintext structural key beyond id is needed for goal queries.
```

#### `goalContributions` (projection — derived from event log)

```
goalContributions {
  id          : string          // UUID PK — plaintext
  goalId      : string          // FK ref — plaintext, indexed (INV-EVT-04)
  timestamp   : number          // Unix ms UTC — plaintext, indexed
  ciphertext  : Uint8Array      // amount (Money)
  iv          : Uint8Array
}

Dexie indexes: "id", "goalId", "[goalId+timestamp]"
```

#### `recurringItems` (projection — derived from event log)

```
recurringItems {
  id          : string          // UUID PK — plaintext
  categoryId  : string          // FK ref — plaintext, indexed (INV-EVT-03)
  ciphertext  : Uint8Array      // label, amount (Money), direction, frequency, startDate
  iv          : Uint8Array
}

Dexie indexes: "id", "categoryId"

Note: projected occurrences are never stored — they are computed in memory by the
      FinancialState Engine (INV-EVT-05). An occurrence enters financialEvents only
      when the user explicitly realises it as a Transaction.
```

#### `financialStateSnapshot` (cached projection — subordinate to log)

```
financialStateSnapshot {
  id          : string          // singleton key, e.g. "current" — plaintext PK
  asOfEventId : string          // last event id incorporated — plaintext (integrity check)
  asOfTimestamp : number        // Unix ms — plaintext
  ciphertext  : Uint8Array      // full FinancialState: totalBalance, periodIncome,
                                //   periodExpenses, netCashFlow, categoryTotals,
                                //   budgetProgress, goalProgress, projectedRecurring
  iv          : Uint8Array
}

Dexie indexes: "id"

Invariant: if asOfEventId does not match the last event in financialEvents, the
           snapshot is stale and the FinancialState Engine must replay from inception
           before serving reads (INV-EVT-02).
```

#### `fxRates` (local rate table — INV-MON-03/04)

```
fxRates {
  id          : string          // composite key "BASE/QUOTE", e.g. "EUR/USD" — plaintext PK
  baseCurrency  : string        // ISO-4217 — plaintext, indexed
  quoteCurrency : string        // ISO-4217 — plaintext, indexed
  lastUpdated   : number        // Unix ms — plaintext, indexed (staleness display)
  ciphertext  : Uint8Array      // rate (high-precision decimal string, never float)
  iv          : Uint8Array
}

Dexie indexes: "id", "baseCurrency", "quoteCurrency", "lastUpdated"

Note: rate is stored as a decimal string inside ciphertext (not float — INV-MON-01).
      Staleness is surfaced via plaintext lastUpdated; it never blocks conversion
      (INV-MON-03). Conversion is display/derivation only; stored amounts are never
      mutated (INV-MON-04). Rounding is half-even to target currency minor unit
      (INV-MON-05), applied at the conversion call site.
      The baseCurrency/quoteCurrency pair being plaintext leaks which currency pairs
      the user works with — accepted metadata leakage.
```

#### `keyMeta` (key-management artifacts — INV-KEY-02/03)

```
keyMeta {
  id              : string      // singleton key "primary" — plaintext PK
  argon2idSalt    : Uint8Array  // KDF salt — plaintext (required for re-derivation on
                                //   restore; the salt is not secret, the passphrase is)
  argon2idParams  : object      // { memory, iterations, parallelism } — plaintext
                                //   (required for KDF re-derivation; not sensitive)
  webAuthnHandle  : Uint8Array | null  // credential handle for the WebAuthn-wrapped
                                //   daily-unlock copy — plaintext (opaque identifier)
  wrappedKey      : Uint8Array | null  // AES-GCM-wrapped master key (wrapped by WebAuthn
                                //   PRF output) — this is encrypted key material,
                                //   never the raw master key
  verificationToken : Uint8Array  // AES-GCM ciphertext of a known constant; decrypting
                                //   it successfully with the derived key verifies the
                                //   passphrase without exposing the key itself
  verificationIv  : Uint8Array  // nonce for verificationToken
}

Dexie indexes: "id"

Invariants:
  - No raw master key material is ever stored unwrapped (INV-KEY-03).
  - argon2idSalt and argon2idParams are intentionally plaintext — they are public
    KDF parameters, not secrets. The passphrase is the secret and is never stored.
  - wrappedKey is encrypted key material (AES-GCM wrapped by WebAuthn PRF output),
    not the master key in plaintext.
  - verificationToken allows passphrase verification on unlock without storing the
    passphrase or the raw key.
```

#### `byoProviderKeys` (BYO key material — INV-KEY-02/03)

```
byoProviderKeys {
  id          : string          // provider identifier, e.g. "openai" — plaintext PK
  provider    : string          // human-readable provider name — plaintext
  ciphertext  : Uint8Array      // encrypted API key (AES-GCM, master key)
  iv          : Uint8Array
}

Dexie indexes: "id", "provider"

Invariants:
  - BYO keys are transmitted ONLY to the intended AI provider endpoint (INV-KEY-02).
  - Never transmitted to the managed proxy, never logged, never in error payloads.
  - No raw key exists in plaintext in persistent storage at any time (INV-KEY-03).
```

### A.3 Dexie versioning and upgrade strategy

Dexie's `version(n).stores({...})` API governs client schema migrations. The
strategy for WiseMoney:

**Version increments.** Each schema change that adds a store, adds/removes an
index, or alters a store definition increments the Dexie version number by one.
Dexie runs the `.upgrade()` callback once per client database when the installed
version is below the declared version. Multiple sequential version declarations
are additive — each `.upgrade()` sees the database as it existed after the
previous version's callback completed.

**Projection rebuild after an upgrade.** Projection stores (`accounts`,
`transactions`, `categories`, `budgets`, `goals`, `goalContributions`,
`recurringItems`, `financialStateSnapshot`) are derived data. When a schema
upgrade changes a projection store structure (e.g. adds an index, adds a
plaintext structural key), the correct upgrade path is:

1. Clear the affected projection store(s) in the `.upgrade()` callback.
2. On application startup, if the projection stores are empty or
   `financialStateSnapshot.asOfEventId` does not match the tail of
   `financialEvents`, trigger a full replay from the `financialEvents` log.
3. The FinancialState Engine replays all events in `timestamp` ascending order,
   re-derives every projection, and re-populates the stores.
4. Only after replay completes does the application allow reads from projection
   stores.

This approach is correct because `financialEvents` is the sole source of truth
(INV-EVT-02); clearing derived stores loses nothing that cannot be recovered
by replay. Replay correctness is guaranteed by the append-only, immutable log
(INV-EVT-01).

**Encryption continuity across upgrades.** The master key derivation mechanism
(`keyMeta`) must not change during an in-place upgrade. If the KDF parameters
must be upgraded (e.g. Argon2id parameter hardening), this is a re-encryption
operation: derive the old key, decrypt all records, derive the new key with new
params, re-encrypt, update `keyMeta`. This is a separate, explicitly user-triggered
operation — not a silent `.upgrade()` side effect.

---

## B. Edge store — PostgreSQL

The edge store exists solely to allow the Go edge to authenticate managed-mode
users. It holds **no financial data whatsoever** (INV-PROXY-01). BYO-key mode
users never interact with this store (INV-AUTH-05).

### B.1 Rate-limiting — in-memory for MVP (Gate-4 decision 20)

**The `RATE_LIMIT_BUCKET` table shown in `01-domain-er.md` does NOT exist in
the MVP Postgres schema.** Gate-4 decision 20 specifies: rate-limit is an
in-memory token-bucket for MVP (tens–hundreds of users), with Redis as the
documented scale-out path (ARCHITECTURE §2.2, §11).

The in-memory design:

```
Per-user token bucket held in a Go process-level map:
  key:   user_id (UUID string)
  value: { tokens float64, lastRefill time.Time }

Refill: on each request, compute elapsed time since lastRefill, add
        elapsed * refillRate tokens (capped at bucketCapacity), then
        attempt to consume 1 token. Reject with 429 if tokens < 1.

Isolation: each user's bucket is accessed only via their authenticated JWT
           user_id claim (INV-AUTH-04). No shared anonymous pool.
```

Implications:

- Rate-limit state is lost on Go process restart. This is acceptable at MVP
  scale — bursts after restart are bounded by bucket capacity and recover
  within one refill window.
- Horizontal scaling (multiple Go instances) requires shared state. The
  documented scale-out path is Redis (ARCHITECTURE §11). When that threshold
  is reached, Redis replaces the in-memory map with no change to the Postgres
  schema.
- **No `rate_limit_buckets` table is created.** The ER diagram note in
  `01-domain-er.md` describing `RATE_LIMIT_BUCKET` as a Postgres table is
  corrected here: at MVP it is in-memory, not Postgres-persisted. The store-
  assignment table in `01-domain-er.md` §3 entry for `RateLimitBucket` reads
  "Edge Postgres" — that entry should be read as "Edge in-memory (Go process);
  Redis on scale-out." The ER diagram `RATE_LIMIT_BUCKET` entity is removed
  from the MVP Postgres schema.

### B.2 Tables

#### `users`

```sql
-- DESIGNED — to be applied by Y4NN; never auto-executed
CREATE TABLE users (
    id            UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    email         CITEXT      NOT NULL,
    password_hash TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT users_email_uq UNIQUE (email),
    CONSTRAINT users_password_hash_nonempty CHECK (LENGTH(password_hash) > 0)
);

CREATE INDEX users_email_idx ON users (email);
CREATE INDEX users_created_at_idx ON users (created_at);
```

Column notes:

- `id` — UUID, generated server-side at insert. UUID is preferred over
  BIGINT identity here because user IDs appear in JWTs and external-facing
  contexts where opacity and global uniqueness matter.
- `email` — `CITEXT` for case-insensitive uniqueness without a separate
  expression index. Requires `CREATE EXTENSION IF NOT EXISTS citext` (see §B.3).
- `password_hash` — stores the full Argon2id output string (the encoded string
  includes the algorithm identifier, version, parameters, salt, and hash — a
  single opaque column). No plaintext credential column exists anywhere
  (INV-AUTH-02). The column name makes the semantics explicit: this is a hash,
  never a password.
- `updated_at` — maintained by application code on credential updates (e.g.
  password reset). A trigger is an option but is deferred to implementation;
  application-layer update is sufficient for MVP.

#### `refresh_tokens`

```sql
-- DESIGNED — to be applied by Y4NN; never auto-executed
CREATE TABLE refresh_tokens (
    id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT        NOT NULL,
    issued_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked_at  TIMESTAMPTZ,
    CONSTRAINT refresh_tokens_token_hash_uq UNIQUE (token_hash),
    CONSTRAINT refresh_tokens_expiry_check CHECK (expires_at > issued_at)
);

CREATE INDEX refresh_tokens_user_id_idx ON refresh_tokens (user_id);
CREATE INDEX refresh_tokens_expires_at_idx ON refresh_tokens (expires_at);
CREATE INDEX refresh_tokens_token_hash_idx ON refresh_tokens (token_hash);
```

Column notes:

- `token_hash` — a hash of the issued refresh token value (e.g. SHA-256). The
  raw token is transmitted to the client once at issuance and never stored
  server-side. Lookup is by hash. The unique constraint enforces no token hash
  collision.
- `revoked_at` — nullable; NULL means active. Set on explicit revocation or
  family invalidation. The THREAT_MODEL owns the rotation policy (single-use
  semantics, family invalidation on reuse detection) — this column is the
  storage hook for that policy.
- `ON DELETE CASCADE` — if a user is deleted, their refresh tokens are removed.
- `expires_at` index — supports a periodic cleanup job to DELETE expired, revoked
  rows, keeping the table lean. The cleanup query is:
  `DELETE FROM refresh_tokens WHERE expires_at < now() AND revoked_at IS NOT NULL;`
  (or a broader sweep per retention policy owned by THREAT_MODEL).
- No financial data. No balance, account, transaction, category, budget, goal, or
  any financial column exists in this table.

### B.3 Designed migration DDL

```sql
-- DESIGNED — to be applied by Y4NN; never auto-executed
-- Migration: 0001_initial_auth_schema
-- Tool: golang-migrate (see §B.4 for rationale)
-- Forward (up):

CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE users (
    id            UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    email         CITEXT      NOT NULL,
    password_hash TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT users_email_uq UNIQUE (email),
    CONSTRAINT users_password_hash_nonempty CHECK (LENGTH(password_hash) > 0)
);

CREATE INDEX users_email_idx ON users (email);
CREATE INDEX users_created_at_idx ON users (created_at);

CREATE TABLE refresh_tokens (
    id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT        NOT NULL,
    issued_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked_at  TIMESTAMPTZ,
    CONSTRAINT refresh_tokens_token_hash_uq UNIQUE (token_hash),
    CONSTRAINT refresh_tokens_expiry_check CHECK (expires_at > issued_at)
);

CREATE INDEX refresh_tokens_user_id_idx ON refresh_tokens (user_id);
CREATE INDEX refresh_tokens_expires_at_idx ON refresh_tokens (expires_at);
CREATE INDEX refresh_tokens_token_hash_idx ON refresh_tokens (token_hash);
```

```sql
-- DESIGNED — to be applied by Y4NN; never auto-executed
-- Migration: 0001_initial_auth_schema
-- Rollback (down):

DROP TABLE IF EXISTS refresh_tokens;
DROP TABLE IF EXISTS users;
DROP EXTENSION IF EXISTS citext;
```

### B.4 Migration tool recommendation

**golang-migrate** is recommended for this project.

Rationale: the Go edge already uses the Go toolchain; golang-migrate integrates
naturally as a Go library (embed migrations in the binary, run on startup with a
guard) or as a standalone CLI. Migration files are plain SQL with `up` and `down`
suffixes — no DSL, no ORM coupling. The schema here is simple (two tables, three
indexes, one extension) and plain SQL is the durable choice.

Goose is a valid alternative with similar characteristics; the deciding factor is
that golang-migrate's library-mode startup integration is well-suited to the
single-binary distroless deployment described in ARCHITECTURE §11.

Neither tool is executed by this document. Y4NN runs migrations.

---

## C. Cross-cutting assertions

### INV-PROXY-01 — zero financial columns in Postgres

Confirmed. The Postgres schema contains:

| Table           | Columns                                                           |
| --------------- | ----------------------------------------------------------------- |
| users           | id, email, password_hash, created_at, updated_at                 |
| refresh_tokens  | id, user_id, token_hash, issued_at, expires_at, revoked_at       |

No column in either table references a transaction, account, balance, amount,
currency value, category, budget, goal, merchant, note, tag, or any financial
concept. INV-PROXY-01 is satisfied by construction.

### INV-AUTH-02 — Argon2id only, no plaintext or reversible encoding

Confirmed. `users.password_hash` holds the Argon2id encoded string. The column
name, the CHECK constraint (`LENGTH > 0` — minimal guard), and the absence of any
plaintext credential column enforce this invariant. The actual enforcement is the
Go Auth Service calling `x/crypto/argon2` at registration and comparison time.
No reversible encoding path exists in the schema.

### INV-MON-01 — no float for money anywhere

Confirmed in both stores. In IndexedDB: all Money values (`minorUnits` + currency)
live inside AES-GCM ciphertext as integer fields in the serialised payload — never
as floats, never as Postgres `NUMERIC`, never as IEEE 754 values in any storage
boundary. In Postgres: no monetary column exists at all (INV-PROXY-01). The Money
value object constraint is enforced at the application serialisation boundary.

### INV-PERS-02 — all financial data encrypted at rest

Confirmed. Every IndexedDB object store entry that carries financial data stores
that data inside `ciphertext` (AES-GCM). The only plaintext fields are structural
index keys (UUIDs, timestamps, type discriminators, FK references). The Postgres
store has no financial data. Key material is stored either as the Argon2id encoded
string (password) or as wrapped/encrypted blobs (BYO keys, wrappedKey). No raw
master key exists in persistent storage (INV-KEY-03).

---

## D. Open questions — genuine only

**DQ-01 — Projection store consistency on concurrent writes.**
The FinancialState Engine appends to `financialEvents` and then updates the
relevant projection store in a single logical operation, but IndexedDB does not
provide cross-store transactions in Dexie's v4 API in the same way a relational
DB does. If the app crashes between the event append and the projection update,
the projection store is stale. The recovery path (replay from the log) handles
this correctly, but the condition that triggers a replay (detecting projection
staleness) needs a precise definition — the `asOfEventId` field in
`financialStateSnapshot` is one hook, but individual projection stores have no
equivalent guard. This needs a precise staleness-detection strategy before
implementation begins.

**DQ-02 — Key-rotation handling.**
If the user changes their passphrase (or Argon2id parameters are hardened in a
future version), every encrypted record in every IndexedDB store must be
re-encrypted with the new key. The mechanism (decrypt-all, re-encrypt-all, atomic
replace) is not yet designed. At MVP scale (single user, single device) this is a
one-time in-browser operation, but it must be interruptible-safe: a crash mid-
rotation must not leave the database in a partially-re-encrypted state. This is
an implementation sequencing concern, not a blocker for the schema, but it must
be addressed before the key-management module is implemented.

**DQ-03 — JSON export losslessness and the encryption boundary.**
INV-PERS-03 requires a lossless JSON export. The export must carry sufficient data
to reconstruct the exact local state on import. Given the encryption scheme, a
plaintext JSON export exposes all financial data in plaintext (the export is
decrypted before serialisation). The optional encrypted export variant (Gate-5
decision 26) wraps the plaintext export in an additional passphrase-encrypted
envelope. The exact serialisation format of the export (does it carry raw
ciphertext blobs or decrypted payloads? how are `keyMeta` KDF parameters
represented?) is not yet specified and must be resolved before the Export/Import
module is implemented.

> **Resolution (2026-06-02).** The lossless JSON export carries **decrypted
> payloads**, not ciphertext blobs. Rationale: a backup exists to survive device/key
> loss; a ciphertext-only export is undecryptable after the device (and its key) is
> gone, defeating the purpose. So restore is portable to a fresh install. On import,
> the user establishes a *new* passphrase/key for that device and the imported data
> is re-encrypted at rest under it — `keyMeta` (salt/KDF params/WebAuthn handle/wrapped
> key) is therefore **NOT** carried in the export; it is regenerated on the target
> device. **BYO provider key material is excluded from the plaintext export** (the
> user re-enters keys on the new device) and may appear only inside the optional
> passphrase-encrypted export. The encrypted export variant (Gate-5 #26, FR-PERSIST-08)
> is exactly the decrypted JSON re-encrypted under a user-supplied export passphrase
> (which may equal the at-rest passphrase). This satisfies INV-PERS-03 (lossless,
> portable restore) while keeping the plaintext-export disclosure surface explicit and
> warned. DQ-03 closed; DQ-01 and DQ-02 remain open as implementation-time items.

---

## E. ER diagram reconciliation note

`docs/diagrams/UML/01-domain-er.md` §2 depicts a `RATE_LIMIT_BUCKET` Postgres
table and §3 lists `RateLimitBucket` as stored in "Edge Postgres." Both entries
are superseded by Gate-4 decision 20: rate-limit is in-memory for MVP.

The correction is recorded here rather than rewriting the ER diagram mid-sequence.
The ER diagram's `RATE_LIMIT_BUCKET` entity and the §3 store-assignment row for
`RateLimitBucket` should be amended on the next revision of `01-domain-er.md` to
read: "in-memory token-bucket (Go process); Redis on scale-out — no Postgres
table at MVP."

---

*End of MODELING T-S0-01 v0.1 — data-model.md. Owned by Shallum (databases).
Next in sequence: implementation of the Dexie schema module (client) and the
golang-migrate migration files (edge). Both are implementation artifacts;
execution is owned by Y4NN.*
