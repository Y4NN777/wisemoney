/**
 * keyManagement.ts unit tests.
 *
 * Environment: vitest (Node ≥ 20). Web Crypto is available natively.
 *
 * TEST DEPENDENCY NOTE:
 * storeBYOKey, decryptBYOKey, verifyPassphrase, and setupMasterKey write/read
 * Dexie (IndexedDB). The real IndexedDB is not available in Node. The package
 * `fake-indexeddb` (npm: fake-indexeddb) would allow wiring Dexie to an
 * in-memory IDB shim without changing production code; it is NOT currently in
 * package.json. Rather than add a dependency without vetting (dependencies.md),
 * we mock the Dexie module with a minimal in-memory fake that satisfies the
 * exact Table API surface used by these functions (get, put). This avoids an
 * unvetted transitive dependency at the cost of a more explicit mock.
 *
 * SURFACE to Zadok/Nathan: if fake-indexeddb is vetted and added, replace the
 * vi.mock block below with:
 *   import "fake-indexeddb/auto";
 *   // and remove the vi.mock("../db/schema.ts") block entirely.
 *
 * WEBAUTHN PRF TESTS:
 * wrapMasterKeyWithWebAuthn and unwrapMasterKeyWithWebAuthn require a real FIDO2
 * authenticator with PRF extension support. They cannot be executed headlessly.
 * The tests below are marked skip with an explanatory message.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { KeyMetaRecord, BYOProviderKeyRecord } from "../db/schema.ts";

// ---------------------------------------------------------------------------
// Minimal in-memory Dexie table fake
// vi.hoisted() ensures these are available when the vi.mock factory runs,
// even after vitest hoists the vi.mock() call above the import statements.
// ---------------------------------------------------------------------------

const { fakeKeyMeta, fakeByoProviderKeys } = vi.hoisted(() => {
  type AnyRecord = { id: string };

  class FakeTable<T extends AnyRecord> {
    private store = new Map<string, T>();

    // Return Promise.resolve() explicitly rather than marking the methods async:
    // the Map operations are synchronous and async-with-no-await triggers the
    // @typescript-eslint/require-await lint rule.
    get(id: string): Promise<T | undefined> {
      return Promise.resolve(this.store.get(id));
    }

    put(record: T): Promise<string> {
      this.store.set(record.id, record);
      return Promise.resolve(record.id);
    }

    clear(): void {
      this.store.clear();
    }
  }

  return {
    fakeKeyMeta: new FakeTable<KeyMetaRecord>(),
    fakeByoProviderKeys: new FakeTable<BYOProviderKeyRecord>(),
  };
});

// Mock the db singleton before importing keyManagement.
vi.mock("../db/schema.ts", () => ({
  db: {
    keyMeta: fakeKeyMeta,
    byoProviderKeys: fakeByoProviderKeys,
  },
}));

// Import under test after mock is in place.
import {
  deriveMasterKey,
  setupMasterKey,
  storeBYOKey,
  decryptBYOKey,
  verifyPassphrase,
  DEFAULT_ARGON2ID_PARAMS,
  wrapMasterKeyWithWebAuthn,
  unwrapMasterKeyWithWebAuthn,
} from "./keyManagement.ts";

// ---------------------------------------------------------------------------
// Reduced Argon2id params for test speed
// ---------------------------------------------------------------------------

/**
 * Use minimal Argon2id parameters in tests. Production defaults (64 MiB,
 * 3 iterations) take ~500ms per derivation — unacceptable in a test suite.
 * These values are only safe for test use; never use them in production code.
 */
const TEST_PARAMS = {
  memory: 1024,   // 1 MiB — below production minimum, acceptable for tests only
  iterations: 1,
  parallelism: 1,
};

// ---------------------------------------------------------------------------
// Reset fake stores between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  fakeKeyMeta.clear();
  fakeByoProviderKeys.clear();
});

// ---------------------------------------------------------------------------
// deriveMasterKey
// ---------------------------------------------------------------------------

describe("deriveMasterKey", () => {
  it("generates a fresh 16-byte salt when salt is null", async () => {
    const { salt } = await deriveMasterKey("pass", TEST_PARAMS, null);
    expect(salt).toHaveLength(16);
  });

  it("is deterministic: same passphrase + salt + params produce a key that round-trips", async () => {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const plaintext = new TextEncoder().encode("determinism check");

    const { masterKey: key1 } = await deriveMasterKey("mypass", TEST_PARAMS, salt);
    const { masterKey: key2 } = await deriveMasterKey("mypass", TEST_PARAMS, salt);

    // If both keys are the same, data sealed with key1 can be opened with key2.
    const { seal, open } = await import("./envelope.ts");
    const envelope = await seal(plaintext, key1);
    const recovered = await open(envelope, key2);

    expect(recovered).toEqual(plaintext);
  });

  it("different salts produce different keys", async () => {
    const salt1 = crypto.getRandomValues(new Uint8Array(16));
    const salt2 = crypto.getRandomValues(new Uint8Array(16));
    const plaintext = new TextEncoder().encode("diverge check");

    const { masterKey: keyA } = await deriveMasterKey("mypass", TEST_PARAMS, salt1);
    const { masterKey: keyB } = await deriveMasterKey("mypass", TEST_PARAMS, salt2);

    // Seal with keyA; open with keyB must fail (different keys).
    const { seal, open } = await import("./envelope.ts");
    const envelope = await seal(plaintext, keyA);

    await expect(open(envelope, keyB)).rejects.toThrow();
  });

  it("different passphrases produce different keys", async () => {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const plaintext = new TextEncoder().encode("diverge passphrase");

    const { masterKey: keyA } = await deriveMasterKey("passA", TEST_PARAMS, salt);
    const { masterKey: keyB } = await deriveMasterKey("passB", TEST_PARAMS, salt);

    const { seal, open } = await import("./envelope.ts");
    const envelope = await seal(plaintext, keyA);

    await expect(open(envelope, keyB)).rejects.toThrow();
  });

  it("returns the provided salt unchanged when supplied", async () => {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const { salt: returnedSalt } = await deriveMasterKey("pass", TEST_PARAMS, salt);

    expect(returnedSalt).toEqual(salt);
  });

  it("returns the provided params", async () => {
    const { params } = await deriveMasterKey("pass", TEST_PARAMS, null);
    expect(params).toEqual(TEST_PARAMS);
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_ARGON2ID_PARAMS
// ---------------------------------------------------------------------------

describe("DEFAULT_ARGON2ID_PARAMS", () => {
  it("meets minimum memory requirement (≥ 65536 KiB)", () => {
    expect(DEFAULT_ARGON2ID_PARAMS.memory).toBeGreaterThanOrEqual(65_536);
  });

  it("meets minimum iterations requirement (≥ 3)", () => {
    expect(DEFAULT_ARGON2ID_PARAMS.iterations).toBeGreaterThanOrEqual(3);
  });

  it("has a positive parallelism value", () => {
    expect(DEFAULT_ARGON2ID_PARAMS.parallelism).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// setupMasterKey + verifyPassphrase
// ---------------------------------------------------------------------------

describe("setupMasterKey / verifyPassphrase", () => {
  it("setupMasterKey persists keyMeta and verifyPassphrase returns true for the correct passphrase", async () => {
    await setupMasterKey("correct-horse-battery-staple", TEST_PARAMS);

    const result = await verifyPassphrase("correct-horse-battery-staple");
    expect(result).toBe(true);
  });

  it("verifyPassphrase returns false for the wrong passphrase", async () => {
    await setupMasterKey("correct-horse-battery-staple", TEST_PARAMS);

    const result = await verifyPassphrase("wrong-passphrase");
    expect(result).toBe(false);
  });

  it("verifyPassphrase throws when keyMeta has not been initialised", async () => {
    // Store is cleared in beforeEach — no keyMeta present.
    await expect(verifyPassphrase("any")).rejects.toThrow(
      "keyMeta not initialised"
    );
  });

  it("setupMasterKey returns a MasterKey that can be used for seal/open", async () => {
    const masterKey = await setupMasterKey("test-passphrase", TEST_PARAMS);
    const { seal, open } = await import("./envelope.ts");

    const plaintext = new TextEncoder().encode("round-trip via setupMasterKey");
    const envelope = await seal(plaintext, masterKey);
    const recovered = await open(envelope, masterKey);

    expect(recovered).toEqual(plaintext);
  });
});

// ---------------------------------------------------------------------------
// storeBYOKey / decryptBYOKey
// ---------------------------------------------------------------------------

describe("storeBYOKey / decryptBYOKey", () => {
  async function makeKey() {
    const { masterKey } = await deriveMasterKey("byotest", TEST_PARAMS, null);
    return masterKey;
  }

  it("round-trips an API key", async () => {
    const masterKey = await makeKey();
    await storeBYOKey("openai", "sk-test-1234567890abcdef", masterKey);

    const recovered = await decryptBYOKey("openai", masterKey);
    expect(recovered).toBe("sk-test-1234567890abcdef");
  });

  it("round-trips an empty API key string", async () => {
    const masterKey = await makeKey();
    await storeBYOKey("gemini", "", masterKey);

    const recovered = await decryptBYOKey("gemini", masterKey);
    expect(recovered).toBe("");
  });

  it("throws when provider id is not found", async () => {
    const masterKey = await makeKey();

    await expect(decryptBYOKey("nonexistent", masterKey)).rejects.toThrow(
      'no BYO key stored for provider "nonexistent"'
    );
  });

  it("fails to decrypt with the wrong key", async () => {
    const masterKey1 = await makeKey();
    const { masterKey: masterKey2 } = await deriveMasterKey(
      "different",
      TEST_PARAMS,
      null
    );

    await storeBYOKey("openai", "sk-secret", masterKey1);

    await expect(decryptBYOKey("openai", masterKey2)).rejects.toThrow();
  });

  it("stores the provider id as both id and provider fields", async () => {
    const masterKey = await makeKey();
    await storeBYOKey("nvidia", "key123", masterKey);

    const record = await fakeByoProviderKeys.get("nvidia");
    expect(record?.id).toBe("nvidia");
    expect(record?.provider).toBe("nvidia");
  });
});

// ---------------------------------------------------------------------------
// storeBYOKey opacity — INV-KEY-02 (F7 — Joab review)
// ---------------------------------------------------------------------------

describe("storeBYOKey opacity (INV-KEY-02 — F7)", () => {
  it("ciphertext stored for a BYO credential does not equal the plaintext encoding", async () => {
    const { masterKey } = await deriveMasterKey("byotest-f7", TEST_PARAMS, null);
    // Synthetic fixture value representative of a provider token shape.
    // The opacity assertion does not depend on the specific content.
    const fixture = "opacity-fixture-f7-xyzzy";
    await storeBYOKey("openai", fixture, masterKey);

    const record = await fakeByoProviderKeys.get("openai");
    if (record == null) throw new Error("record not found — test setup failure");

    // AES-GCM ciphertext must not equal the UTF-8 encoding of the plaintext.
    // The 16-byte auth tag guarantees length differs when plaintext < 16 bytes;
    // for longer inputs we also check content byte-by-byte.
    const plaintextBytes = new TextEncoder().encode(fixture);
    const bytesMatch =
      record.ciphertext.byteLength === plaintextBytes.byteLength &&
      record.ciphertext.every((b, i) => b === plaintextBytes[i]);

    expect(bytesMatch).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Production Argon2id params — slow round-trip (F8 — Joab review)
// ---------------------------------------------------------------------------

describe("DEFAULT_ARGON2ID_PARAMS round-trip (slow)", () => {
  it(
    "F8: deriveMasterKey with DEFAULT_ARGON2ID_PARAMS completes and produces " +
      "a working round-trip key (confirms hash-wasm accepts production params)",
    async () => {
      // Intentionally uses production parameters (64 MiB, 3 iterations).
      // Expected duration: 300–800 ms on a modern Node process.
      // CI may filter with --testNamePattern if suite runtime budgets require it.
      const plaintext = new TextEncoder().encode("production-params-round-trip");

      const { masterKey } = await deriveMasterKey(
        "production-strength-passphrase",
        DEFAULT_ARGON2ID_PARAMS,
        null
      );

      const { seal, open } = await import("./envelope.ts");
      const envelope = await seal(plaintext, masterKey);
      const recovered = await open(envelope, masterKey);

      expect(recovered).toEqual(plaintext);
    },
    // 30-second timeout — Argon2id at 64 MiB is CPU-bound; CI runners may be slow.
    30_000
  );
});

// ---------------------------------------------------------------------------
// WebAuthn PRF — skipped (browser-only, not headlessly testable)
// ---------------------------------------------------------------------------

describe("wrapMasterKeyWithWebAuthn / unwrapMasterKeyWithWebAuthn", () => {
  it.skip(
    "wrapMasterKeyWithWebAuthn — BROWSER-ONLY: requires a real FIDO2 authenticator " +
      "with PRF (hmac-secret) extension support. Cannot be executed in a Node/jsdom " +
      "headless environment. Verify manually in a browser with a compatible device.\n" +
      "Signature (Gap-2 Option A): wrapMasterKeyWithWebAuthn(" +
      "rawMasterKeyBytes: Uint8Array, credentialId: Uint8Array" +
      ") — returns { webAuthnHandle, wrappedKey, wrappedIv }",
    async () => {
      // Not implemented — browser-only; see skip reason above.
    }
  );

  it.skip(
    "unwrapMasterKeyWithWebAuthn — BROWSER-ONLY: requires a real FIDO2 authenticator " +
      "with PRF (hmac-secret) extension support. Cannot be executed headlessly.\n" +
      "Signature (Gap-2 Option A): unwrapMasterKeyWithWebAuthn(" +
      "webAuthnHandle: Uint8Array, wrappedKey: Uint8Array, wrappedIv: Uint8Array" +
      ") — returns MasterKey",
    async () => {
      // Not implemented — browser-only; see skip reason above.
    }
  );

  it("wrapMasterKeyWithWebAuthn throws clearly in a non-browser environment", async () => {
    // Gap-2 Option A: first parameter is rawMasterKeyBytes (Uint8Array), not MasterKey.
    const rawBytes = crypto.getRandomValues(new Uint8Array(32));
    const credentialId = crypto.getRandomValues(new Uint8Array(32));

    // In Node, startAuthentication (WebAuthn) is unavailable. The function must
    // throw rather than silently succeeding or returning garbage.
    await expect(
      wrapMasterKeyWithWebAuthn(rawBytes, credentialId)
    ).rejects.toThrow();
  });

  it("unwrapMasterKeyWithWebAuthn throws clearly in a non-browser environment", async () => {
    const handle = crypto.getRandomValues(new Uint8Array(32));
    const wrapped = crypto.getRandomValues(new Uint8Array(64));
    const wrappedIv = crypto.getRandomValues(new Uint8Array(12));

    await expect(
      unwrapMasterKeyWithWebAuthn(handle, wrapped, wrappedIv)
    ).rejects.toThrow();
  });
});
