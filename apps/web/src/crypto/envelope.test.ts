/**
 * envelope.ts unit tests — AES-GCM seal/open round-trip.
 *
 * Environment: vitest (Node ≥ 20). Web Crypto (crypto.subtle,
 * crypto.getRandomValues) is available natively in Node 20+.
 */

import { describe, it, expect } from "vitest";
import { seal, open } from "./envelope.ts";
import type { MasterKey } from "./envelope.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a fresh non-extractable AES-GCM-256 CryptoKey for test use. */
async function makeTestKey(): Promise<MasterKey> {
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
  // The _brand discriminant is type-level only (erased at runtime).
  // Construct the object with the full shape so no assertion is needed.
  const mk: MasterKey = { _brand: "MasterKey", key };
  return mk;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("seal / open round-trip", () => {
  it("round-trips arbitrary plaintext", async () => {
    const key = await makeTestKey();
    const plaintext = new TextEncoder().encode("hello wisemoney");

    const envelope = await seal(plaintext, key);
    const recovered = await open(envelope, key);

    expect(recovered).toEqual(plaintext);
  });

  it("round-trips empty plaintext", async () => {
    const key = await makeTestKey();
    const plaintext = new Uint8Array(0);

    const envelope = await seal(plaintext, key);
    const recovered = await open(envelope, key);

    expect(recovered).toEqual(plaintext);
  });

  it("round-trips binary payload", async () => {
    const key = await makeTestKey();
    const plaintext = crypto.getRandomValues(new Uint8Array(256));

    const envelope = await seal(plaintext, key);
    const recovered = await open(envelope, key);

    expect(recovered).toEqual(plaintext);
  });
});

describe("seal — IV properties", () => {
  it("produces a 12-byte (96-bit) IV", async () => {
    const key = await makeTestKey();
    const { iv } = await seal(new Uint8Array(8), key);

    expect(iv).toHaveLength(12);
  });

  it("generates a unique IV on each invocation (no IV reuse)", async () => {
    const key = await makeTestKey();
    const plaintext = new TextEncoder().encode("same input");

    const { iv: iv1 } = await seal(plaintext, key);
    const { iv: iv2 } = await seal(plaintext, key);

    // The probability of two random 96-bit values colliding is ~2^-96 — treat
    // a collision here as a bug in crypto.getRandomValues.
    expect(iv1).not.toEqual(iv2);
  });

  it("produces different ciphertexts for the same plaintext (IV randomness)", async () => {
    const key = await makeTestKey();
    const plaintext = new TextEncoder().encode("same input");

    const { ciphertext: c1 } = await seal(plaintext, key);
    const { ciphertext: c2 } = await seal(plaintext, key);

    expect(c1).not.toEqual(c2);
  });
});

describe("open — authentication / error paths", () => {
  it("rejects when the wrong key is used", async () => {
    const key1 = await makeTestKey();
    const key2 = await makeTestKey();
    const plaintext = new TextEncoder().encode("secret");

    const envelope = await seal(plaintext, key1);

    await expect(open(envelope, key2)).rejects.toThrow();
  });

  it("rejects when the ciphertext is tampered", async () => {
    const key = await makeTestKey();
    const plaintext = new TextEncoder().encode("secret");

    const envelope = await seal(plaintext, key);

    // Flip the first byte of ciphertext — invalidates the AEAD tag.
    // Non-null assertion: tampered is a freshly-allocated copy of a non-empty
    // ciphertext (AES-GCM output is always at least 16 bytes for the auth tag),
    // so index 0 is guaranteed to exist.
    const tampered = new Uint8Array(envelope.ciphertext);
    tampered[0] = tampered[0]! ^ 0xff;

    await expect(
      open({ ciphertext: tampered, iv: envelope.iv }, key)
    ).rejects.toThrow();
  });

  it("rejects when the IV is tampered", async () => {
    const key = await makeTestKey();
    const plaintext = new TextEncoder().encode("secret");

    const envelope = await seal(plaintext, key);

    // Non-null assertion: IV is always exactly 12 bytes, so index 0 is present.
    const tamperedIv = new Uint8Array(envelope.iv);
    tamperedIv[0] = tamperedIv[0]! ^ 0xff;

    await expect(
      open({ ciphertext: envelope.ciphertext, iv: tamperedIv }, key)
    ).rejects.toThrow();
  });
});
