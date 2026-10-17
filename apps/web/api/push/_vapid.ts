// VAPID (RFC 8292) with Web Crypto only: the api/ functions take no npm package (serverGraph.test.ts).
// Key formats, as printed by tools/push/generate-vapid-keys.mjs:
// - VAPID_PUBLIC_KEY: the uncompressed P-256 point (65 bytes), base64url without padding.
// - VAPID_PRIVATE_KEY: the PKCS#8 encoding of the private key, base64url without padding.

const JWT_LIFETIME_SECONDS = 12 * 60 * 60;
const UNCOMPRESSED_POINT_BYTES = 65;

export function base64UrlEncode(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Buffer.from(view).toString("base64url");
}

export function base64UrlDecode(text: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new Error("not-base64url");
  const decoded = Buffer.from(text, "base64url");
  const bytes = new Uint8Array(new ArrayBuffer(decoded.length));
  bytes.set(decoded);
  return bytes;
}

export function isVapidPublicKey(text: string): boolean {
  try {
    const bytes = base64UrlDecode(text);
    return bytes.length === UNCOMPRESSED_POINT_BYTES && bytes[0] === 0x04;
  } catch {
    return false;
  }
}

export function isVapidSubject(text: string): boolean {
  return /^https:\/\/[^\s]+$/.test(text) || /^mailto:[^\s@]+@[^\s@]+$/.test(text);
}

export async function importVapidPrivateKey(pkcs8Base64Url: string): Promise<CryptoKey> {
  const bytes = base64UrlDecode(pkcs8Base64Url);
  return crypto.subtle.importKey("pkcs8", bytes, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}

/** The JWT of the vapid Authorization scheme. Web Crypto's ECDSA output is r||s, the JWS ES256 form. */
export async function buildVapidJwt(options: {
  audience: string;
  subject: string;
  privateKey: CryptoKey;
  nowSeconds: number;
}): Promise<string> {
  const encoder = new TextEncoder();
  const header = base64UrlEncode(encoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = base64UrlEncode(encoder.encode(JSON.stringify({
    aud: options.audience,
    exp: options.nowSeconds + JWT_LIFETIME_SECONDS,
    sub: options.subject,
  })));
  const signingInput = `${header}.${claims}`;
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, options.privateKey, encoder.encode(signingInput));
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

export function vapidAuthorization(jwt: string, publicKey: string): string {
  return `vapid t=${jwt}, k=${publicKey}`;
}

export const VAPID_JWT_LIFETIME_SECONDS = JWT_LIFETIME_SECONDS;
