/**
 * Dexie database schema — WiseMoney client IndexedDB store.
 *
 * data-model.md §A.2 is the authoritative source; this file implements it exactly.
 * ARCHITECTURE §7; INV-PERS-02; INV-EVT-01; INV-MON-01.
 *
 * Encryption boundary (data-model.md §A.1):
 *   PLAINTEXT:  structural index keys only (id, timestamp, type, entityId, …)
 *   ENCRYPTED:  all financial payload (amounts, notes, names, rates, key material)
 *
 * DQ-01 (open): projection-store staleness detection needs a precise strategy
 * before implementation. The asOfEventId field in financialStateSnapshot is one
 * hook; individual projection stores have no equivalent guard yet.
 *
 * DQ-02 (open): key-rotation (passphrase change / Argon2id param hardening) must
 * be interruptible-safe before the crypto module is implemented.
 */

import Dexie, { type Table } from "dexie";

// ---------------------------------------------------------------------------
// Record types — plaintext structural fields + encrypted envelope
// ---------------------------------------------------------------------------

/** Shared encrypted envelope; identical across all stores. */
export type EncryptedRecord = {
  ciphertext: Uint8Array;
  iv: Uint8Array;
};

/** financialEvents — source of truth, append-only (INV-EVT-01). */
export type FinancialEventRecord = EncryptedRecord & {
  id: string;         // UUID PK — plaintext
  timestamp: number;  // Unix ms UTC — plaintext, indexed
  type: string;       // event type enum — plaintext, indexed
  entityId: string;   // primary referenced entity id — plaintext, indexed
};

/** accounts — projection derived from event log. */
export type AccountRecord = EncryptedRecord & {
  id: string;       // UUID PK — plaintext
  currency: string; // ISO-4217, immutable from creation (ARCHITECTURE §6) — plaintext, indexed
  isActive: boolean;// plaintext — supports active-account filter (accepted metadata leakage)
};

/** transactions — projection derived from event log. */
export type TransactionRecord = EncryptedRecord & {
  id: string;        // UUID PK — plaintext
  timestamp: number; // Unix ms UTC — plaintext, indexed
  accountId: string; // FK ref, validated at append time (INV-EVT-03) — plaintext, indexed
  categoryId: string;// FK ref, validated at append time (INV-EVT-03) — plaintext, indexed
};

/** categories — projection derived from event log. */
export type CategoryRecord = EncryptedRecord & {
  id: string;               // UUID PK — plaintext
  parentId: string | null;  // self-referential FK (INV-EVT-03) — plaintext, indexed
  isSystemDefault: boolean; // plaintext — drives UI distinction
};

/** budgets — projection derived from event log. */
export type BudgetRecord = EncryptedRecord & {
  id: string;          // UUID PK — plaintext
  categoryId: string;  // FK ref (INV-EVT-03) — plaintext, indexed
  periodMonth: string; // "YYYY-MM" — plaintext, indexed (INV-EVT-03)
};

/** goals — projection derived from event log. */
export type GoalRecord = EncryptedRecord & {
  id: string; // UUID PK — plaintext
  // accumulatedAmount derives exclusively from goalContributions replay (INV-EVT-04)
};

/** goalContributions — projection derived from event log. */
export type GoalContributionRecord = EncryptedRecord & {
  id: string;        // UUID PK — plaintext
  goalId: string;    // FK ref (INV-EVT-04) — plaintext, indexed
  timestamp: number; // Unix ms UTC — plaintext, indexed
};

/** recurringItems — projection derived from event log. */
export type RecurringItemRecord = EncryptedRecord & {
  id: string;        // UUID PK — plaintext
  categoryId: string;// FK ref (INV-EVT-03) — plaintext, indexed
  // Projected occurrences are NEVER stored — computed in memory (INV-EVT-05)
};

/**
 * financialStateSnapshot — cached projection, subordinate to the event log.
 *
 * Singleton: id = "current".
 * If asOfEventId does not match the last event in financialEvents, the
 * FinancialState Engine must replay from inception before serving reads (INV-EVT-02).
 */
export type FinancialStateSnapshotRecord = EncryptedRecord & {
  id: string;             // singleton key "current" — plaintext PK
  asOfEventId: string;    // last incorporated event id — plaintext (integrity check)
  asOfTimestamp: number;  // Unix ms — plaintext
};

/**
 * fxRates — locally-cached, user-editable rate table (ARCHITECTURE §5).
 *
 * id = "BASE/QUOTE" composite key, e.g. "EUR/USD".
 * Rate value is a high-precision decimal STRING inside ciphertext — never a float
 * (INV-MON-01). Conversions always read from this table, never a live call (INV-MON-03).
 */
export type FxRateRecord = EncryptedRecord & {
  id: string;             // composite "BASE/QUOTE" — plaintext PK
  baseCurrency: string;   // ISO-4217 — plaintext, indexed
  quoteCurrency: string;  // ISO-4217 — plaintext, indexed
  lastUpdated: number;    // Unix ms — plaintext, indexed (staleness display, INV-MON-03)
};

/**
 * keyMeta — Argon2id KDF params + WebAuthn wrapped master key (singleton).
 *
 * id = "primary".
 * argon2idSalt and argon2idParams are INTENTIONALLY plaintext — they are public
 * KDF parameters; the passphrase is the secret (INV-KEY-03).
 * wrappedKey is the AES-GCM ciphertext of the raw master key bytes sealed under
 * the PRF-derived wrapping key. wrappedIv is the nonce for that sealing operation.
 * Both are null when WebAuthn unlock has not been configured.
 */
export type KeyMetaRecord = {
  id: string;                        // "primary" — plaintext PK
  argon2idSalt: Uint8Array;          // KDF salt — plaintext
  argon2idParams: {                  // plaintext
    memory: number;
    iterations: number;
    parallelism: number;
  };
  webAuthnHandle: Uint8Array | null; // credential handle — plaintext opaque id
  wrappedKey: Uint8Array | null;     // AES-GCM ciphertext of wrapped master key (INV-KEY-03)
  wrappedIv: Uint8Array | null;      // nonce for wrappedKey seal (null when WebAuthn not configured)
  verificationToken: Uint8Array;     // AES-GCM ciphertext of known constant
  verificationIv: Uint8Array;        // nonce for verificationToken
};

/**
 * byoProviderKeys — BYO API key material, encrypted at rest (INV-KEY-02/03).
 *
 * id = provider identifier, e.g. "openai".
 * Raw key is never stored in plaintext anywhere (INV-KEY-03).
 * BYO keys transmitted ONLY to the intended AI provider endpoint (INV-KEY-02).
 */
export type BYOProviderKeyRecord = EncryptedRecord & {
  id: string;       // provider identifier — plaintext PK
  provider: string; // human-readable provider name — plaintext
};

/**
 * authSession — sealed refresh-token store (INV-AUTH-06/ADR-0012).
 *
 * id = "primary" (singleton).
 * The access JWT is NEVER stored here — it lives only in the zustand session store
 * (module-scope in-memory). Only the refresh token is persisted, sealed under the
 * master key so the device-at-rest attacker cannot replay it without the passphrase.
 *
 * refreshCiphertext / refreshIv are the AES-GCM envelope from envelope.seal().
 * The masterKey is required to open() the record — INV-AUTH-07: no offline replay
 * without the unlock credential.
 */
export type AuthSessionRecord = {
  id: string;                    // "primary" — plaintext PK
  refreshCiphertext: Uint8Array; // AES-GCM ciphertext of the refresh token bytes
  refreshIv: Uint8Array;         // nonce for refreshCiphertext
};

// ---------------------------------------------------------------------------
// Dexie database class
// ---------------------------------------------------------------------------

/**
 * WiseMoneyDB — current schema version: 3.
 *
 * Version 1 → 2: added `wrappedIv` to keyMeta (WebAuthn wrap IV, parallel to
 * wrappedKey). data-model.md §A.3 records the migration rationale.
 * Shallum documents this in data-model.md in parallel.
 *
 * Version 2 → 3: added `authSession` store (ADR-0012, INV-AUTH-06).
 * Additive only — no transform on existing records.
 *
 * Version increments on every schema change per data-model.md §A.3 strategy.
 * Projection stores are clearable + replayable from financialEvents (INV-EVT-01/02).
 */
export class WiseMoneyDB extends Dexie {
  financialEvents!: Table<FinancialEventRecord, string>;
  accounts!: Table<AccountRecord, string>;
  transactions!: Table<TransactionRecord, string>;
  categories!: Table<CategoryRecord, string>;
  budgets!: Table<BudgetRecord, string>;
  goals!: Table<GoalRecord, string>;
  goalContributions!: Table<GoalContributionRecord, string>;
  recurringItems!: Table<RecurringItemRecord, string>;
  financialStateSnapshot!: Table<FinancialStateSnapshotRecord, string>;
  fxRates!: Table<FxRateRecord, string>;
  keyMeta!: Table<KeyMetaRecord, string>;
  byoProviderKeys!: Table<BYOProviderKeyRecord, string>;
  authSession!: Table<AuthSessionRecord, string>;

  constructor() {
    super("WiseMoney");

    // Version 1 — original schema; must remain present for Dexie's upgrade chain.
    // PK is the first field in the index string; Dexie uses it as the primary key.
    // Dexie index syntax: "pk, index1, index2, [compound+index]"
    this.version(1).stores({
      financialEvents:
        "id, timestamp, type, entityId, [type+timestamp]",

      accounts:
        "id, currency, isActive",

      transactions:
        "id, timestamp, accountId, categoryId, [accountId+timestamp], [categoryId+timestamp]",

      categories:
        "id, parentId",

      budgets:
        "id, categoryId, periodMonth, [categoryId+periodMonth]",

      goals:
        "id",

      goalContributions:
        "id, goalId, [goalId+timestamp]",

      recurringItems:
        "id, categoryId",

      financialStateSnapshot:
        "id",

      fxRates:
        "id, baseCurrency, quoteCurrency, lastUpdated",

      keyMeta:
        "id",

      byoProviderKeys:
        "id, provider",
    });

    // Version 2 — adds `wrappedIv` to keyMeta (WebAuthn seal nonce, matches wrappedKey).
    // Upgrade callback sets the field to null on any existing "primary" record so reads
    // against the new type are safe without a code-path branch.
    this.version(2)
      .stores({
        // Re-declare every store; Dexie requires all stores to be present in the
        // version that changes them, even if the index definition is unchanged.
        financialEvents:
          "id, timestamp, type, entityId, [type+timestamp]",

        accounts:
          "id, currency, isActive",

        transactions:
          "id, timestamp, accountId, categoryId, [accountId+timestamp], [categoryId+timestamp]",

        categories:
          "id, parentId",

        budgets:
          "id, categoryId, periodMonth, [categoryId+periodMonth]",

        goals:
          "id",

        goalContributions:
          "id, goalId, [goalId+timestamp]",

        recurringItems:
          "id, categoryId",

        financialStateSnapshot:
          "id",

        fxRates:
          "id, baseCurrency, quoteCurrency, lastUpdated",

        keyMeta:
          "id",

        byoProviderKeys:
          "id, provider",
      })
      .upgrade(async (tx) => {
        // Set wrappedIv = null on the existing "primary" keyMeta record so it
        // conforms to the updated KeyMetaRecord shape. New records written by
        // setupMasterKey always include wrappedIv explicitly.
        await tx.table("keyMeta").where("id").equals("primary").modify({
          wrappedIv: null,
        });
      });

    // Version 3 — adds `authSession` store (ADR-0012, INV-AUTH-06).
    // Additive migration: no existing records are modified. The upgrade callback
    // is a no-op but is declared explicitly to satisfy Dexie's upgrade chain
    // requirement and to document intent for future readers.
    this.version(3)
      .stores({
        financialEvents:
          "id, timestamp, type, entityId, [type+timestamp]",

        accounts:
          "id, currency, isActive",

        transactions:
          "id, timestamp, accountId, categoryId, [accountId+timestamp], [categoryId+timestamp]",

        categories:
          "id, parentId",

        budgets:
          "id, categoryId, periodMonth, [categoryId+periodMonth]",

        goals:
          "id",

        goalContributions:
          "id, goalId, [goalId+timestamp]",

        recurringItems:
          "id, categoryId",

        financialStateSnapshot:
          "id",

        fxRates:
          "id, baseCurrency, quoteCurrency, lastUpdated",

        keyMeta:
          "id",

        byoProviderKeys:
          "id, provider",

        // authSession: singleton store, keyed on id = "primary".
        // Contains the sealed refresh token only — access JWTs are never persisted.
        authSession:
          "id",
      });
    // No .upgrade() needed — pure addition of a new store; Dexie creates it empty.
  }
}

/** Singleton database instance — import and use across the app. */
export const db = new WiseMoneyDB();
