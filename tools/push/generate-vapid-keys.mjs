#!/usr/bin/env node
// Prints a new VAPID key pair (P-256, Web Crypto) for ADR-0016, to paste into Vercel's environment
// variables. Writes nothing to disk: copy the two lines, then clear the terminal.
// VAPID_PUBLIC_KEY is the uncompressed point (65 bytes) and VAPID_PRIVATE_KEY the PKCS#8 key, both
// base64url without padding: the formats apps/web/api/push/_vapid.ts imports.

const { subtle } = globalThis.crypto;
const base64url = (buffer) => Buffer.from(new Uint8Array(buffer)).toString("base64url");

const pair = await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
console.log(`VAPID_PUBLIC_KEY=${base64url(await subtle.exportKey("raw", pair.publicKey))}`);
console.log(`VAPID_PRIVATE_KEY=${base64url(await subtle.exportKey("pkcs8", pair.privateKey))}`);
