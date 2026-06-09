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
 * Generates a fresh 96-bit (12-byte) random IV via crypto.getRandomValues on
 * every invocation. A unique IV per call is critical — IV reuse with the same
 * AES-GCM key is catastrophic (breaks confidentiality and authenticity).
 *
 * @param plaintext  - serialised record payload (e.g. JSON → TextEncoder)
 * @param masterKey  - in-memory master key for this session
 */
export async function seal(
  plaintext: Uint8Array,
  masterKey: MasterKey
): Promise<EncryptedEnvelope> {
  // 96-bit IV — the standard nonce length for AES-GCM (NIST SP 800-38D §5.2.1.1).
  // Typed as Uint8Array<ArrayBuffer>: new Uint8Array(n) always allocates a plain
  // ArrayBuffer; the explicit type annotation satisfies TS 5.9's stricter
  // typed-array generics which distinguish ArrayBuffer from SharedArrayBuffer.
  const iv: Uint8Array<ArrayBuffer> = crypto.getRandomValues(new Uint8Array(12));
  // Normalize plaintext to Uint8Array<ArrayBuffer> via slice() for the same
  // reason as iv: Web Crypto encrypt requires ArrayBuffer-backed BufferSource.
  const plaintextNorm: Uint8Array<ArrayBuffer> = plaintext.slice();

  const buf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    masterKey.key,
    plaintextNorm
  );

  return { ciphertext: new Uint8Array(buf), iv };
}

/**
 * Open (decrypt) a ciphertext envelope under the master key.
 *
 * AES-GCM's authentication tag is validated during decryption. If the tag does
 * not match (wrong key, tampered ciphertext, or wrong IV), crypto.subtle.decrypt
 * rejects with a DOMException. This rejection is intentionally NOT caught here —
 * callers must handle it; swallowing auth failures would hide data corruption.
 *
 * @param envelope   - { ciphertext, iv } as stored in IndexedDB
 * @param masterKey  - in-memory master key for this session
 */
export async function open(
  envelope: EncryptedEnvelope,
  masterKey: MasterKey
): Promise<Uint8Array> {
  // Normalize iv and ciphertext to Uint8Array<ArrayBuffer>: slice() always
  // produces a fresh ArrayBuffer-backed view, satisfying the Web Crypto
  // BufferSource constraint under TS 5.9's stricter typed-array generics.
  const iv: Uint8Array<ArrayBuffer> = envelope.iv.slice();
  const ciphertext: Uint8Array<ArrayBuffer> = envelope.ciphertext.slice();

  const buf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    masterKey.key,
    ciphertext
  );

  return new Uint8Array(buf);
}
