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
 *   WebAuthn / biometric ──unwraps──▶ wrapped master key ──▶ master key (in memory)
 *
 * Recovery: passphrase is the root of trust. Losing it makes data unrecoverable.
 * The lossless JSON export (INV-PERS-03) is the documented recovery mechanism.
 *
 * INV-KEY-03: no raw master key material is ever stored unwrapped in persistent storage.
 */

import type { MasterKey } from "./envelope.ts";

/** Argon2id KDF parameters stored in keyMeta alongside the salt. */
export type Argon2idParams = {
  /** Memory in KiB. Minimum 65536 (64 MiB) per ARCHITECTURE §7. */
  memory: number;
  /** Iteration count. Minimum 3. */
  iterations: number;
  /** Parallelism degree. */
  parallelism: number;
};

/**
 * Derive the master key from a passphrase using Argon2id.
 *
 * TODO (INV-KEY-03, NFR-SEC-05): implement via hash-wasm argon2id.
 * - Generate a fresh 16-byte random salt if not supplied (setup path).
 * - Pass memory >= 64 MiB, iterations >= 3 (ARCHITECTURE §7).
 * - Derive 32 bytes → import as CryptoKey for AES-GCM 256.
 * - Store salt + params in keyMeta (plaintext — they are public KDF params).
 * - NFR-SEC-05: validate passphrase strength before derivation; surface
 *   a warning (not a hard block) to the user if entropy is low.
 *
 * @param passphrase - raw user passphrase (never stored)
 * @param params     - Argon2id params; use defaults on first setup
 * @param salt       - existing salt from keyMeta on restore/unlock; null on setup
 */
export async function deriveMasterKey(
  _passphrase: string,
  _params: Argon2idParams,
  _salt: Uint8Array | null
): Promise<{ masterKey: MasterKey; salt: Uint8Array; params: Argon2idParams }> {
  // TODO: implement Argon2id derivation via hash-wasm
  throw new Error("deriveMasterKey: not yet implemented");
}

/**
 * Wrap the master key for WebAuthn-backed daily unlock.
 *
 * TODO (INV-KEY-03, ARCHITECTURE §7): implement via @simplewebauthn/browser.
 * - Use the WebAuthn PRF extension output (or HMAC secret extension fallback)
 *   as the wrapping key to AES-GCM-wrap the master key.
 * - Store { webAuthnHandle, wrappedKey } in keyMeta.
 * - The passphrase remains the root of trust; WebAuthn is a convenience layer.
 *
 * @param masterKey     - in-memory master key to wrap
 * @param credentialId  - WebAuthn credential handle
 */
export async function wrapMasterKeyWithWebAuthn(
  _masterKey: MasterKey,
  _credentialId: Uint8Array
): Promise<{ webAuthnHandle: Uint8Array; wrappedKey: Uint8Array }> {
  // TODO: implement WebAuthn PRF-based key wrapping
  throw new Error("wrapMasterKeyWithWebAuthn: not yet implemented");
}

/**
 * Unwrap the master key using WebAuthn (daily unlock path).
 *
 * TODO (INV-KEY-03): implement using the stored webAuthnHandle + wrappedKey
 * from keyMeta, driving a WebAuthn assertion via @simplewebauthn/browser.
 */
export async function unwrapMasterKeyWithWebAuthn(
  _webAuthnHandle: Uint8Array,
  _wrappedKey: Uint8Array
): Promise<MasterKey> {
  // TODO: implement WebAuthn PRF-based key unwrap
  throw new Error("unwrapMasterKeyWithWebAuthn: not yet implemented");
}

/**
 * Encrypt a BYO provider API key for at-rest storage.
 *
 * TODO (INV-KEY-02/03): use the session master key to AES-GCM-seal the raw API
 * key string. Write { ciphertext, iv } to byoProviderKeys[providerId].
 * The raw key must be zeroed from memory after the call.
 *
 * @param providerId - e.g. "openai", "gemini" (plaintext PK in byoProviderKeys)
 * @param rawApiKey  - raw string API key (caller must zero after this call returns)
 * @param masterKey  - session master key
 */
export async function storeBYOKey(
  _providerId: string,
  _rawApiKey: string,
  _masterKey: MasterKey
): Promise<void> {
  // TODO: implement BYO key encryption + Dexie write
  throw new Error("storeBYOKey: not yet implemented");
}

/**
 * Decrypt a BYO provider API key for a single provider call.
 *
 * TODO (INV-KEY-02): decrypt in-memory only. The caller MUST zero the returned
 * string from memory after the provider call completes — never store or log it.
 * Key is never transmitted to the managed edge (INV-KEY-02).
 *
 * @returns raw API key string — caller owns zeroing after use
 */
export async function decryptBYOKey(
  _providerId: string,
  _masterKey: MasterKey
): Promise<string> {
  // TODO: implement BYO key decryption from Dexie byoProviderKeys
  throw new Error("decryptBYOKey: not yet implemented");
}

/**
 * Verify that a passphrase is correct without exposing the master key.
 *
 * TODO: derive key from passphrase + stored salt/params, then attempt to
 * decrypt keyMeta.verificationToken with keyMeta.verificationIv.
 * Return true if decryption succeeds (known-constant plaintext matches).
 * data-model.md §A.2 keyMeta documents verificationToken/verificationIv.
 */
export async function verifyPassphrase(
  _passphrase: string
): Promise<boolean> {
  // TODO: implement passphrase verification via verificationToken
  throw new Error("verifyPassphrase: not yet implemented");
}
