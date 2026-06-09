/**
 * Hybrid key-management module.
 *
 * ARCHITECTURE §7; INV-KEY-02/03; INV-PERS-02; NFR-SEC-05.
 *
 * Setup flow:
 *   passphrase ──Argon2id──▶ master key (in memory)
 *   master key ──AES-GCM──▶ encrypts IndexedDB store + BYO key material
 *
 * Daily unlock flow:
 *   WebAuthn / biometric ──PRF──▶ wrapping key ──unseals──▶ raw bytes
 *     ──import──▶ master key (in memory)
 *
 * Recovery: passphrase is the root of trust. Losing it makes data unrecoverable.
 * The lossless JSON export (INV-PERS-03) is the documented recovery mechanism.
 *
 * INV-KEY-03: no raw master key material is ever stored unwrapped in persistent storage.
 *
 * Key-usage minimization (F1 — Joab review):
 *   All CryptoKey imports grant ONLY ["encrypt","decrypt"]. No wrapKey/unwrapKey
 *   usage is needed because wrapping is performed via seal() treating raw bytes as
 *   opaque plaintext — the underlying WebCrypto key is never passed to wrapKey.
 */

import { argon2id } from "hash-wasm";
import { startAuthentication } from "@simplewebauthn/browser";
import type { AuthenticationResponseJSON } from "@simplewebauthn/browser";
import { db } from "../db/schema.ts";
import type { MasterKey } from "./envelope.ts";
import { seal, open } from "./envelope.ts";


// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Argon2id KDF parameters stored in keyMeta alongside the salt. */
export type Argon2idParams = {
  /** Memory in KiB. Minimum 65536 (64 MiB) per ARCHITECTURE §7. */
  memory: number;
  /** Iteration count. Minimum 3. */
  iterations: number;
  /** Parallelism degree. */
  parallelism: number;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Production-grade Argon2id parameters (ARCHITECTURE §7, NFR-SEC-05).
 * memory=65536 KiB (64 MiB), iterations=3, parallelism=1.
 * These are the minimum acceptable values; they may be hardened in a future
 * key-rotation pass (DQ-02) without breaking backward compatibility because
 * the params are stored plaintext in keyMeta.
 */
export const DEFAULT_ARGON2ID_PARAMS: Argon2idParams = {
  memory: 65_536,
  iterations: 3,
  parallelism: 1,
};

/**
 * Known-constant plaintext sealed into keyMeta as the verificationToken.
 * MUST NOT change between versions — changing it would invalidate all
 * existing stored verification tokens (treat as a schema constant).
 */
const VERIFICATION_CONSTANT = new TextEncoder().encode(
  "wisemoney-master-key-verification-v1"
);

/**
 * Fixed application salt for the WebAuthn PRF evaluation input.
 * Must be stable across sessions — the PRF output is deterministically bound
 * to this value and the credential. Exactly 32 bytes.
 */
const WEBAUTHN_PRF_APP_SALT: BufferSource = (() => {
  // "wisemoney-prf-salt-v1" = 21 bytes; pad to exactly 32 with nulls.
  const buf = new Uint8Array(32);
  const src = new TextEncoder().encode("wisemoney-prf-salt-v1");
  buf.set(src);
  return buf;
})();

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Wrap raw key bytes as a typed MasterKey.
 * The `_brand` discriminant is present only at the type level (erased at
 * runtime), so we cast here — the shape is correct.
 */
function asMasterKey(key: CryptoKey): MasterKey {
  // Construct with explicit _brand so the object satisfies MasterKey without
  // a type assertion. The brand is type-level only (erased at runtime).
  const mk: MasterKey = { _brand: "MasterKey", key };
  return mk;
}

/**
 * Import 32 raw bytes as a non-extractable AES-GCM-256 CryptoKey.
 *
 * Key usage is intentionally restricted to ["encrypt","decrypt"] only (F1).
 * Wrapping is performed via seal() treating raw key bytes as opaque plaintext,
 * so wrapKey/unwrapKey usage is never required here.
 */
async function importRawAsAesGcm256(raw: Uint8Array): Promise<CryptoKey> {
  // Normalize to Uint8Array<ArrayBuffer> via slice() to satisfy TS 5.9's
  // stricter typed-array generics: Web Crypto importKey requires an
  // ArrayBuffer-backed BufferSource, not SharedArrayBuffer-backed.
  const normalised: Uint8Array<ArrayBuffer> = raw.slice();
  return crypto.subtle.importKey(
    "raw",
    normalised,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encode a Uint8Array credential id to the base64url string format required
 * by @simplewebauthn/browser. Avoids spread of large arrays (the WebAuthn spec
 * allows credential ids up to 1023 bytes).
 */
function credentialIdToBase64Url(id: Uint8Array): string {
  let s = "";
  for (let i = 0; i < id.length; i++) s += String.fromCharCode(id[i] ?? 0);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/**
 * Normalize a WebAuthn PRF result to a 32-byte Uint8Array.
 *
 * The PRF extension returns either an ArrayBuffer or a Uint8Array depending on
 * browser / @simplewebauthn version. This helper handles both (F2 — Joab review:
 * byteOffset must be respected when wrapping an existing ArrayBuffer view).
 *
 * @throws if the result is not exactly 32 bytes.
 */
function normalizePrfOutput(raw: ArrayBuffer | Uint8Array): Uint8Array {
  if (raw instanceof Uint8Array) {
    // Slice to get a fresh buffer that starts at byte 0 and has byteLength=32,
    // regardless of the view's byteOffset into its backing ArrayBuffer.
    if (raw.byteLength !== 32) {
      throw new Error(
        `normalizePrfOutput: expected 32 bytes, got ${raw.byteLength}`
      );
    }
    return raw.slice(0, 32);
  }

  // ArrayBuffer path.
  if (raw.byteLength !== 32) {
    throw new Error(
      `normalizePrfOutput: expected 32 bytes, got ${raw.byteLength}`
    );
  }
  return new Uint8Array(raw);
}

/**
 * Run a WebAuthn PRF assertion for the given credential and return the
 * normalized 32-byte PRF output as a disposable Uint8Array.
 *
 * Caller is responsible for zeroing the returned buffer after use.
 */
async function assertPrfBytes(credentialId: Uint8Array): Promise<Uint8Array> {
  const credentialIdBase64 = credentialIdToBase64Url(credentialId);

  // Generate a fresh random challenge. The challenge is not verified server-side
  // in the BYO-key / local flow; it satisfies the WebAuthn API requirement.
  const challengeBytes = crypto.getRandomValues(new Uint8Array(32));
  let challengeStr = "";
  for (let i = 0; i < challengeBytes.length; i++) {
    challengeStr += String.fromCharCode(challengeBytes[i] ?? 0);
  }

  let authResponse: AuthenticationResponseJSON;
  try {
    authResponse = await startAuthentication({
      optionsJSON: {
        challenge: btoa(challengeStr),
        allowCredentials: [{ id: credentialIdBase64, type: "public-key" }],
        userVerification: "required",
        // @simplewebauthn/browser re-declares AuthenticationExtensionsClientInputs
        // in its own esm/types/dom.d.ts without the `prf` property (predates the
        // W3C WebAuthn L3 PRF extension). The global DOM lib (TS 5.9.3) carries
        // the full definition including prf. Construct the extensions value as the
        // global type, then cast through unknown to the narrower simplewebauthn
        // type — structurally safe because both share the same field name and the
        // PRF bytes are passed at runtime regardless of the static type visible
        // at the call site.
        extensions: {
          prf: { eval: { first: WEBAUTHN_PRF_APP_SALT } },
        } as unknown as AuthenticationExtensionsClientInputs,
      },
    });
  } catch (err) {
    throw new Error(
      `WebAuthn assertion failed — ${String(err)}`
    );
  }

  // clientExtensionResults carries prf.results.first when PRF is supported.
  const prfFirst = (
    authResponse.clientExtensionResults as {
      prf?: { results?: { first?: ArrayBuffer | Uint8Array } };
    }
  ).prf?.results?.first;

  if (prfFirst == null) {
    throw new Error(
      "WebAuthn authenticator does not support the PRF extension. " +
        "PRF (hmac-secret) is required for WebAuthn-backed key wrapping."
    );
  }

  return normalizePrfOutput(prfFirst);
}

// ---------------------------------------------------------------------------
// deriveMasterKey (public API — unchanged from v1)
// ---------------------------------------------------------------------------

/**
 * Derive the master key from a passphrase using Argon2id (hash-wasm).
 *
 * - If salt is null, generates a fresh 16-byte random salt (setup path).
 * - Runs Argon2id with memory >= 64 MiB, iterations >= 3 (ARCHITECTURE §7).
 * - Derives 32 raw bytes → imports as AES-GCM-256 CryptoKey (encrypt/decrypt only).
 * - Zeroes the intermediate raw buffer immediately after import.
 * - Salt and params are returned so the caller can persist them to keyMeta
 *   (they are public KDF parameters — not secrets — INV-KEY-03).
 *
 * NFR-SEC-05: passphrase strength is a caller responsibility. This function
 * does not block on low entropy — surface a warning in the UI layer before
 * calling here if passphrase strength validation is required.
 *
 * @param passphrase - raw user passphrase (never stored, never logged)
 * @param params     - Argon2id params; use DEFAULT_ARGON2ID_PARAMS on first setup
 * @param salt       - existing salt from keyMeta on restore/unlock; null on setup
 */
export async function deriveMasterKey(
  passphrase: string,
  params: Argon2idParams,
  salt: Uint8Array | null
): Promise<{ masterKey: MasterKey; salt: Uint8Array; params: Argon2idParams }> {
  const { masterKey, salt: effectiveSalt, params: effectiveParams, rawBytes } =
    await deriveMasterKeyWithRaw(passphrase, params, salt);

  // Zero the raw bytes immediately — public callers must not receive them.
  rawBytes.fill(0);

  return { masterKey, salt: effectiveSalt, params: effectiveParams };
}

// ---------------------------------------------------------------------------
// deriveMasterKeyWithRaw (internal — caller must zero rawBytes)
// ---------------------------------------------------------------------------

/**
 * Internal variant of deriveMasterKey that returns the raw Argon2id output
 * BEFORE zeroing, so it can be threaded through to wrapMasterKeyWithWebAuthn.
 *
 * CONTRACT: the caller MUST zero rawBytes (rawBytes.fill(0)) as soon as it is
 * no longer needed. This function must never be exported — it exists solely to
 * allow setupMasterKey to hand raw bytes to the WebAuthn wrap path without
 * requiring an extractable CryptoKey (which would violate INV-KEY-03).
 *
 * Joab ruling (Gap-2 Option A): raw bytes flow: deriveMasterKeyWithRaw →
 * setupMasterKey → wrapMasterKeyWithWebAuthn → zeroed inside wrap → then
 * setupMasterKey zeroes the copy too as a belt-and-suspenders measure.
 */
async function deriveMasterKeyWithRaw(
  passphrase: string,
  params: Argon2idParams,
  salt: Uint8Array | null
): Promise<{
  masterKey: MasterKey;
  salt: Uint8Array;
  params: Argon2idParams;
  rawBytes: Uint8Array;
}> {
  const effectiveSalt: Uint8Array =
    salt ?? crypto.getRandomValues(new Uint8Array(16));

  // hash-wasm argon2id: outputType "binary" returns raw Uint8Array (no hex encoding).
  const raw = await argon2id({
    password: passphrase,
    salt: effectiveSalt,
    parallelism: params.parallelism,
    iterations: params.iterations,
    memorySize: params.memory,
    hashLength: 32,
    outputType: "binary",
  });

  // Import a non-extractable CryptoKey. The raw buffer is NOT zeroed here —
  // that is the caller's responsibility (see contract above).
  const cryptoKey = await importRawAsAesGcm256(raw);

  return {
    masterKey: asMasterKey(cryptoKey),
    salt: effectiveSalt,
    params,
    rawBytes: raw,
  };
}

// ---------------------------------------------------------------------------
// setupMasterKey
// ---------------------------------------------------------------------------

/**
 * First-time setup: derive the master key from a passphrase, seal a
 * verificationToken, and persist keyMeta to Dexie.
 *
 * If credentialId is provided, also wraps the master key for WebAuthn-backed
 * daily unlock by calling wrapMasterKeyWithWebAuthn with the raw key bytes
 * before they are zeroed. If the PRF extension is unsupported by the
 * authenticator, the error surfaces to the caller — setup is NOT aborted
 * (passphrase path remains usable; webAuthnHandle/wrappedKey/wrappedIv stay null).
 *
 * CONTRACT ADDITION: this function is needed because verifyPassphrase reads
 * keyMeta but nothing in the original stub contract wrote it. Flagged to
 * Zadok/Nathan for ratification before the feature lands.
 *
 * Writes:
 *   keyMeta["primary"] = {
 *     id, argon2idSalt, argon2idParams,
 *     webAuthnHandle: <credentialId | null>,
 *     wrappedKey: <ciphertext | null>,
 *     wrappedIv: <iv | null>,
 *     verificationToken, verificationIv
 *   }
 *
 * @param passphrase   - raw user passphrase (never stored)
 * @param params       - Argon2id params; defaults to DEFAULT_ARGON2ID_PARAMS
 * @param credentialId - WebAuthn credential handle; omit to skip WebAuthn setup
 * @returns the in-memory MasterKey for the current session
 */
export async function setupMasterKey(
  passphrase: string,
  params: Argon2idParams = DEFAULT_ARGON2ID_PARAMS,
  credentialId?: Uint8Array
): Promise<MasterKey> {
  const { masterKey, salt, rawBytes } = await deriveMasterKeyWithRaw(
    passphrase,
    params,
    null
  );

  // Seal the known constant to produce the verificationToken/verificationIv pair.
  const { ciphertext: verificationToken, iv: verificationIv } =
    await seal(VERIFICATION_CONSTANT, masterKey);

  let webAuthnHandle: Uint8Array | null = null;
  let wrappedKey: Uint8Array | null = null;
  let wrappedIv: Uint8Array | null = null;

  if (credentialId != null) {
    // rawBytes are passed to wrapMasterKeyWithWebAuthn, which zeroes them
    // internally after sealing. The fill(0) below is belt-and-suspenders.
    try {
      const wrapped = await wrapMasterKeyWithWebAuthn(rawBytes, credentialId);
      webAuthnHandle = wrapped.webAuthnHandle;
      wrappedKey = wrapped.wrappedKey;
      wrappedIv = wrapped.wrappedIv;
    } catch (err) {
      // PRF unsupported or authenticator error — WebAuthn unlock will not be
      // available, but the passphrase path works. Surface the error as a
      // non-fatal warning: the caller can notify the user.
      // rawBytes must still be zeroed even on this path.
      rawBytes.fill(0);
      throw new Error(
        `setupMasterKey: WebAuthn wrap failed — ${String(err)}. ` +
          "WebAuthn daily unlock will not be available. " +
          "Re-call setupMasterKey without credentialId to complete passphrase-only setup."
      );
    }
  }

  // Zero raw bytes. If credentialId was provided, wrapMasterKeyWithWebAuthn
  // already zeroed them; this fill is the belt-and-suspenders second zero.
  rawBytes.fill(0);

  await db.keyMeta.put({
    id: "primary",
    argon2idSalt: salt,
    argon2idParams: params,
    webAuthnHandle,
    wrappedKey,
    wrappedIv,
    verificationToken,
    verificationIv,
  });

  return masterKey;
}

// ---------------------------------------------------------------------------
// wrapMasterKeyWithWebAuthn / unwrapMasterKeyWithWebAuthn
// ---------------------------------------------------------------------------

/**
 * Wrap the raw master key bytes for WebAuthn-backed daily unlock.
 *
 * Uses the WebAuthn PRF extension (@simplewebauthn/browser v13).
 * The PRF output is a 32-byte deterministic value bound to the authenticator
 * credential and the fixed WEBAUTHN_PRF_APP_SALT. That output is imported as
 * a non-extractable AES-GCM wrapping key (encrypt/decrypt only — F1), then used
 * to seal the raw master key bytes via seal(). The raw key bytes and PRF bytes
 * are zeroed before returning.
 *
 * BROWSER-ONLY: requires a real WebAuthn authenticator with PRF (hmac-secret)
 * extension support. Cannot be executed headlessly — do not include in unit tests.
 * Integration verification requires a browser with a compatible FIDO2 device.
 *
 * @param rawMasterKeyBytes - 32 raw Argon2id output bytes (CALLER MUST ZERO after call)
 * @param credentialId      - WebAuthn credential handle (from registration)
 * @returns { webAuthnHandle, wrappedKey, wrappedIv }
 */
export async function wrapMasterKeyWithWebAuthn(
  rawMasterKeyBytes: Uint8Array,
  credentialId: Uint8Array
): Promise<{
  webAuthnHandle: Uint8Array;
  wrappedKey: Uint8Array;
  wrappedIv: Uint8Array;
}> {
  const prfBytes = await assertPrfBytes(credentialId);

  // Import PRF bytes as the wrapping key (encrypt/decrypt only — F1).
  const wrappingKey = await importRawAsAesGcm256(prfBytes);

  // Zero the PRF bytes immediately — they must not outlive this import.
  prfBytes.fill(0);

  // Seal the raw master key bytes under the wrapping key. seal() generates a
  // fresh IV and returns { ciphertext, iv }. We treat rawMasterKeyBytes as
  // opaque plaintext so no extractable CryptoKey is ever needed.
  const wrappingMasterKey = { _brand: "MasterKey" as const, key: wrappingKey };
  const { ciphertext: wrappedKey, iv: wrappedIv } = await seal(
    rawMasterKeyBytes,
    wrappingMasterKey
  );

  // Zero the raw master key bytes as required by contract.
  rawMasterKeyBytes.fill(0);

  return {
    webAuthnHandle: credentialId,
    wrappedKey,
    wrappedIv,
  };
}

/**
 * Unwrap the master key using WebAuthn (daily unlock path).
 *
 * Runs a PRF assertion with the stored credential, imports the PRF output as
 * the wrapping key, opens the wrapped envelope, imports the recovered raw bytes
 * as a non-extractable session master key, then zeros the raw bytes.
 *
 * BROWSER-ONLY: requires a real WebAuthn authenticator with PRF support.
 *
 * @param webAuthnHandle - stored credential handle (from keyMeta)
 * @param wrappedKey     - AES-GCM ciphertext of raw master key bytes (from keyMeta)
 * @param wrappedIv      - nonce for wrappedKey seal (from keyMeta)
 * @returns in-memory MasterKey for the current session
 */
export async function unwrapMasterKeyWithWebAuthn(
  webAuthnHandle: Uint8Array,
  wrappedKey: Uint8Array,
  wrappedIv: Uint8Array
): Promise<MasterKey> {
  const prfBytes = await assertPrfBytes(webAuthnHandle);

  // Import PRF bytes as the wrapping key (encrypt/decrypt only — F1).
  const wrappingKey = await importRawAsAesGcm256(prfBytes);

  // Zero PRF bytes immediately.
  prfBytes.fill(0);

  // Open the wrapped envelope to recover the raw master key bytes.
  const wrappingMasterKey = { _brand: "MasterKey" as const, key: wrappingKey };
  const rawBytes = await open(
    { ciphertext: wrappedKey, iv: wrappedIv },
    wrappingMasterKey
  );

  // Import recovered bytes as the session master key (non-extractable,
  // encrypt/decrypt only — F1).
  const cryptoKey = await importRawAsAesGcm256(rawBytes);

  // Zero the raw bytes immediately after import.
  rawBytes.fill(0);

  return asMasterKey(cryptoKey);
}

// ---------------------------------------------------------------------------
// storeBYOKey / decryptBYOKey
// ---------------------------------------------------------------------------

/**
 * Encrypt a BYO provider API key for at-rest storage (INV-KEY-02/03).
 *
 * Seals the raw API key under the session master key and writes the resulting
 * envelope to the byoProviderKeys Dexie store. The raw key is zeroed from its
 * Uint8Array representation after sealing; the JS string parameter itself
 * cannot be zeroed (JS strings are immutable/GC-managed — the caller should
 * avoid retaining the reference longer than necessary).
 *
 * The encrypted key is NEVER sent to the managed edge (INV-KEY-02). It is
 * decrypted in-memory only for the duration of a provider call.
 *
 * @param providerId - e.g. "openai", "gemini" (plaintext PK in byoProviderKeys)
 * @param rawApiKey  - raw string API key
 * @param masterKey  - session master key
 */
export async function storeBYOKey(
  providerId: string,
  rawApiKey: string,
  masterKey: MasterKey
): Promise<void> {
  const encoder = new TextEncoder();
  const rawBytes = encoder.encode(rawApiKey);

  const { ciphertext, iv } = await seal(rawBytes, masterKey);

  // Best-effort zero the intermediate byte buffer. The JS string rawApiKey
  // itself cannot be zeroed — string immutability is a language constraint.
  rawBytes.fill(0);

  await db.byoProviderKeys.put({
    id: providerId,
    provider: providerId,
    ciphertext,
    iv,
  });
}

/**
 * Decrypt a BYO provider API key for a single provider call (INV-KEY-02).
 *
 * Decrypts in-memory only. The returned string must be used immediately and
 * the reference discarded — do not persist, log, or pass the result beyond
 * the immediate provider call. The key is never transmitted to the managed
 * edge (INV-KEY-02).
 *
 * @param providerId - provider identifier as stored in byoProviderKeys
 * @param masterKey  - session master key
 * @returns raw API key string — caller must discard after use; do not persist or log
 */
export async function decryptBYOKey(
  providerId: string,
  masterKey: MasterKey
): Promise<string> {
  const record = await db.byoProviderKeys.get(providerId);
  if (record == null) {
    throw new Error(
      `decryptBYOKey: no BYO key stored for provider "${providerId}"`
    );
  }

  const plaintext = await open(
    { ciphertext: record.ciphertext, iv: record.iv },
    masterKey
  );

  return new TextDecoder().decode(plaintext);
}

// ---------------------------------------------------------------------------
// verifyPassphrase
// ---------------------------------------------------------------------------

/**
 * Verify that a passphrase is correct without exposing the master key.
 *
 * Reads keyMeta["primary"], re-derives the key with the stored salt + params,
 * and attempts to decrypt the verificationToken with the verificationIv.
 * Returns true iff decryption succeeds (AEAD tag validates → passphrase correct).
 * Returns false on any decryption failure (wrong passphrase or corrupted token).
 *
 * The AEAD rejection is intentionally caught here and converted to false —
 * this is the correct pattern for passphrase verification (the auth tag IS
 * the verification mechanism). Contrast with open(), which lets rejection
 * propagate for data integrity purposes.
 *
 * @param passphrase - candidate passphrase to verify
 */
export async function verifyPassphrase(passphrase: string): Promise<boolean> {
  const meta = await db.keyMeta.get("primary");
  if (meta == null) {
    throw new Error(
      "verifyPassphrase: keyMeta not initialised — call setupMasterKey first"
    );
  }

  const { masterKey } = await deriveMasterKey(
    passphrase,
    meta.argon2idParams,
    meta.argon2idSalt
  );

  try {
    await open(
      { ciphertext: meta.verificationToken, iv: meta.verificationIv },
      masterKey
    );
    return true;
  } catch {
    // AES-GCM auth tag mismatch → wrong passphrase.
    return false;
  }
}
