import { describe, expect, it } from "vitest";
import { base64UrlDecode, base64UrlEncode, buildVapidJwt, importVapidPrivateKey, isVapidPublicKey, isVapidSubject, VAPID_JWT_LIFETIME_SECONDS, vapidAuthorization } from "./_vapid.ts";

async function generateKeys(): Promise<{ publicKey: string; privateKey: string; verifyKey: CryptoKey }> {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  return {
    publicKey: base64UrlEncode(await crypto.subtle.exportKey("raw", pair.publicKey)),
    privateKey: base64UrlEncode(await crypto.subtle.exportKey("pkcs8", pair.privateKey)),
    verifyKey: pair.publicKey,
  };
}

function decodeJson(part: string): unknown {
  return JSON.parse(new TextDecoder().decode(base64UrlDecode(part)));
}

describe("VAPID JWT", () => {
  it("signs ES256 over the push service origin, verifiable with the raw public key", async () => {
    const keys = await generateKeys();
    const nowSeconds = 1_800_000_000;
    const jwt = await buildVapidJwt({
      audience: "https://fcm.googleapis.com",
      subject: "https://wisemoney.y7labs.studio",
      privateKey: await importVapidPrivateKey(keys.privateKey),
      nowSeconds,
    });

    const [header, claims, signature] = jwt.split(".");
    expect(decodeJson(header ?? "")).toEqual({ typ: "JWT", alg: "ES256" });
    expect(decodeJson(claims ?? "")).toEqual({
      aud: "https://fcm.googleapis.com",
      exp: nowSeconds + VAPID_JWT_LIFETIME_SECONDS,
      sub: "https://wisemoney.y7labs.studio",
    });
    expect(VAPID_JWT_LIFETIME_SECONDS).toBeLessThanOrEqual(24 * 60 * 60);

    const signatureBytes = base64UrlDecode(signature ?? "");
    expect(signatureBytes).toHaveLength(64);
    const rawPublic = await crypto.subtle.importKey("raw", base64UrlDecode(keys.publicKey), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const signed = new TextEncoder().encode(`${header}.${claims}`);
    await expect(crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, rawPublic, signatureBytes, signed)).resolves.toBe(true);
    const other = await generateKeys();
    await expect(crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, other.verifyKey, signatureBytes, signed)).resolves.toBe(false);
  });

  it("formats the vapid Authorization header", () => {
    expect(vapidAuthorization("a.b.c", "KEY")).toBe("vapid t=a.b.c, k=KEY");
  });

  it("accepts only an uncompressed P-256 public key and an https or mailto subject", async () => {
    const keys = await generateKeys();
    expect(isVapidPublicKey(keys.publicKey)).toBe(true);
    expect(isVapidPublicKey(keys.privateKey)).toBe(false);
    expect(isVapidPublicKey("not base64url!")).toBe(false);
    expect(isVapidSubject("https://wisemoney.y7labs.studio")).toBe(true);
    expect(isVapidSubject("mailto:owner@example.test")).toBe(true);
    expect(isVapidSubject("http://wisemoney.y7labs.studio")).toBe(false);
    expect(isVapidSubject("")).toBe(false);
  });

  it("rejects a private key that is not PKCS#8", async () => {
    await expect(importVapidPrivateKey(base64UrlEncode(new Uint8Array(32)))).rejects.toThrow();
  });
});
