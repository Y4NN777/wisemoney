import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { isKnownPushHost, parsePushTestBody, resetPushTestRateLimit, sendTestPush, type PushTestDeps } from "./_pushTest.ts";
import { base64UrlDecode, base64UrlEncode } from "./_vapid.ts";
import key from "./key.ts";
import test from "./test.ts";

const ORIGINAL_ENV = { ...process.env };
const ENDPOINT = "https://fcm.googleapis.com/fcm/send/abc:def";
const NOW = Date.UTC(2026, 9, 17, 8, 30, 0);
let keys: { publicKey: string; privateKey: string };

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  keys = {
    publicKey: base64UrlEncode(await crypto.subtle.exportKey("raw", pair.publicKey)),
    privateKey: base64UrlEncode(await crypto.subtle.exportKey("pkcs8", pair.privateKey)),
  };
});

beforeEach(() => {
  resetPushTestRateLimit();
  process.env = {
    ...ORIGINAL_ENV,
    PUSH_TEST_ENABLED: "1",
    VAPID_PUBLIC_KEY: keys.publicKey,
    VAPID_PRIVATE_KEY: keys.privateKey,
    VAPID_SUBJECT: "https://wisemoney.y7labs.studio",
  };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

function request(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://app.example.test/api/push/test", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function deps(status = 201): PushTestDeps & { fetch: ReturnType<typeof vi.fn>; sleep: ReturnType<typeof vi.fn> } {
  return {
    fetch: vi.fn().mockResolvedValue(new Response(null, { status })),
    sleep: vi.fn().mockResolvedValue(undefined),
    now: () => NOW,
  };
}

describe("push test body", () => {
  it("accepts an https endpoint on a known push service and a delay of 0 to 45 s", () => {
    expect(parsePushTestBody({ endpoint: ENDPOINT, delaySeconds: 30 }).endpoint.origin).toBe("https://fcm.googleapis.com");
    expect(parsePushTestBody({ endpoint: "https://web.push.apple.com/QGx", delaySeconds: 0 }).delaySeconds).toBe(0);
    expect(parsePushTestBody({ endpoint: "https://updates.push.services.mozilla.com/wpush/v2/x", delaySeconds: 45 }).delaySeconds).toBe(45);
    expect(parsePushTestBody({ endpoint: "https://wns2-par02p.notify.windows.com/w/?token=x", delaySeconds: 1 }).delaySeconds).toBe(1);
  });

  it.each([
    ["extra property", { endpoint: ENDPOINT, delaySeconds: 1, keys: { p256dh: "x", auth: "y" } }],
    ["missing delay", { endpoint: ENDPOINT }],
    ["delay too long", { endpoint: ENDPOINT, delaySeconds: 46 }],
    ["negative delay", { endpoint: ENDPOINT, delaySeconds: -1 }],
    ["fractional delay", { endpoint: ENDPOINT, delaySeconds: 1.5 }],
    ["delay as text", { endpoint: ENDPOINT, delaySeconds: "30" }],
    ["http endpoint", { endpoint: "http://fcm.googleapis.com/fcm/send/x", delaySeconds: 1 }],
    ["explicit port", { endpoint: "https://fcm.googleapis.com:8443/fcm/send/x", delaySeconds: 1 }],
    ["credentials", { endpoint: "https://user:pass@fcm.googleapis.com/fcm/send/x", delaySeconds: 1 }],
    ["unknown host", { endpoint: "https://example.com/push", delaySeconds: 1 }],
    ["look-alike host", { endpoint: "https://fcm.googleapis.com.example.com/x", delaySeconds: 1 }],
    ["bare suffix", { endpoint: "https://push.apple.com/x", delaySeconds: 1 }],
    ["not an url", { endpoint: "fcm.googleapis.com", delaySeconds: 1 }],
    ["array", [ENDPOINT, 1]],
    ["null", null],
  ])("rejects %s", (_name, body) => {
    expect(() => parsePushTestBody(body)).toThrow();
  });

  it("recognises push service hosts", () => {
    expect(isKnownPushHost("FCM.googleapis.com")).toBe(true);
    expect(isKnownPushHost("api.push.apple.com")).toBe(true);
    expect(isKnownPushHost("evil-push.apple.com")).toBe(false);
    expect(isKnownPushHost("notify.windows.com")).toBe(false);
  });
});

describe("push test endpoint", () => {
  it("is switched off unless PUSH_TEST_ENABLED is 1", async () => {
    for (const value of [undefined, "", "0", "true", "yes"]) {
      if (value === undefined) delete process.env.PUSH_TEST_ENABLED;
      else process.env.PUSH_TEST_ENABLED = value;
      const fake = deps();
      const response = await sendTestPush(request({ endpoint: ENDPOINT, delaySeconds: 0 }), fake);
      expect(response.status).toBe(403);
      expect(fake.fetch).not.toHaveBeenCalled();
    }
  });

  it("waits, then sends one empty push with TTL, urgency and a vapid authorization", async () => {
    const fake = deps(201);
    const response = await sendTestPush(request({ endpoint: ENDPOINT, delaySeconds: 30 }), fake);

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ sentAt: new Date(NOW).toISOString(), pushStatus: 201 });
    expect(fake.sleep).toHaveBeenCalledWith(30_000);
    expect(fake.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fake.fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(ENDPOINT);
    expect(init.method).toBe("POST");
    expect(init.body).toBeUndefined();
    expect(init.redirect).toBe("manual");
    const headers = init.headers as Record<string, string>;
    expect(headers.TTL).toBe("600");
    expect(headers.Urgency).toBe("high");
    const match = /^vapid t=([^,]+), k=(.+)$/.exec(headers.Authorization ?? "");
    expect(match?.[2]).toBe(keys.publicKey);
    const claims = JSON.parse(new TextDecoder().decode(base64UrlDecode(match?.[1]?.split(".")[1] ?? ""))) as { aud: string; exp: number };
    expect(claims.aud).toBe("https://fcm.googleapis.com");
    expect(claims.exp).toBe(Math.floor(NOW / 1000) + 12 * 60 * 60);
  });

  it("reports a push service refusal as 502 with its status", async () => {
    const response = await sendTestPush(request({ endpoint: ENDPOINT, delaySeconds: 0 }), deps(410));
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ pushStatus: 410 });
  });

  it("rejects cross-origin calls, bad bodies and missing configuration before sending", async () => {
    const crossOrigin = deps();
    expect((await sendTestPush(request({ endpoint: ENDPOINT, delaySeconds: 0 }, { origin: "https://evil.example" }), crossOrigin)).status).toBe(403);
    const bad = deps();
    expect((await sendTestPush(request("{not json"), bad)).status).toBe(400);
    expect((await sendTestPush(request({ endpoint: "https://example.com/x", delaySeconds: 0 }), bad)).status).toBe(400);
    delete process.env.VAPID_PRIVATE_KEY;
    expect((await sendTestPush(request({ endpoint: ENDPOINT, delaySeconds: 0 }), bad)).status).toBe(503);
    expect(crossOrigin.fetch).not.toHaveBeenCalled();
    expect(bad.fetch).not.toHaveBeenCalled();
  });

  it("limits the number of test pushes per instance", async () => {
    const statuses: number[] = [];
    for (let index = 0; index < 13; index += 1) {
      statuses.push((await sendTestPush(request({ endpoint: ENDPOINT, delaySeconds: 0 }), deps())).status);
    }
    expect(statuses.slice(0, 12).every((status) => status === 202)).toBe(true);
    expect(statuses[12]).toBe(429);
  });

  it("exposes Web Handler entrypoints for the key and the test", async () => {
    expect((await test.fetch(new Request("https://app.example.test/api/push/test"))).status).toBe(405);
    const keyResponse = key.fetch(new Request("https://app.example.test/api/push/key"));
    expect(keyResponse.status).toBe(200);
    await expect(keyResponse.json()).resolves.toEqual({ publicKey: keys.publicKey });
    delete process.env.VAPID_PUBLIC_KEY;
    expect(key.fetch(new Request("https://app.example.test/api/push/key")).status).toBe(503);
    expect(key.fetch(new Request("https://app.example.test/api/push/key", { method: "POST" })).status).toBe(405);
  });
});
