/**
 * AES-GCM per-record encryption envelope.
 *
 * ARCHITECTURE §7, INV-PERS-02, INV-KEY-03.
 *
 * Each IndexedDB record divides into:
 *   - plaintext structural index keys (id, timestamp, type, entityId, …)
 *   - ciphertext (AES-GCM, 256-bit key) — all financial payload
 *   - iv — 96-bit nonce, unique per record
 *
 * data-model.md §A.1 describes the full envelope design.
 *
 * The master key is derived via Argon2id from the user's passphrase, or
 * unwrapped from the WebAuthn-held wrapped copy on daily unlock
 * (ARCHITECTURE §7, INV-KEY-03). The raw master key lives only in memory
 * during a session — it is NEVER stored in plaintext (INV-KEY-03).
 */

/** Opaque wrapper so raw CryptoKey objects don't leak into domain code. */
export type MasterKey = { readonly _brand: "MasterKey"; readonly key: CryptoKey };

/** Wire type stored alongside every encrypted record in IndexedDB. */
export type EncryptedEnvelope = {
  ciphertext: Uint8Array;
  iv: Uint8Array;
};

/**
 * Seal (encrypt) a plaintext payload under the master key.
 *
 * TODO (INV-PERS-02, INV-KEY-03): implement using Web Crypto AES-GCM 256-bit.
 * - Generate a 96-bit random nonce with crypto.getRandomValues().
 * - Encrypt with SubtleCrypto.encrypt({ name: "AES-GCM", iv }, key, plaintext).
 * - Return { ciphertext, iv }.
 *
 * @param plaintext  - serialised record payload (e.g. JSON → TextEncoder)
 * @param masterKey  - in-memory master key for this session
 */
export async function seal(
  _plaintext: Uint8Array,
  _masterKey: MasterKey
): Promise<EncryptedEnvelope> {
  // TODO: implement AES-GCM seal
  throw new Error("seal: not yet implemented");
}

/**
 * Open (decrypt) a ciphertext envelope under the master key.
 *
 * TODO (INV-PERS-02): implement using Web Crypto AES-GCM.
 * - SubtleCrypto.decrypt({ name: "AES-GCM", iv: envelope.iv }, key, envelope.ciphertext).
 * - Return the raw plaintext bytes; caller is responsible for deserialisation.
 *
 * @param envelope   - { ciphertext, iv } as stored in IndexedDB
 * @param masterKey  - in-memory master key for this session
 */
export async function open(
  _envelope: EncryptedEnvelope,
  _masterKey: MasterKey
): Promise<Uint8Array> {
  // TODO: implement AES-GCM open
  throw new Error("open: not yet implemented");
}
