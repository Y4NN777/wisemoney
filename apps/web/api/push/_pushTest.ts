// ADR-0016 step 1: one empty Web Push to a subscription the owner creates on /lab/push, to measure
// delivery on real phones. Test only; switched off by unsetting PUSH_TEST_ENABLED after the trials.
import { buildVapidJwt, importVapidPrivateKey, isVapidPublicKey, isVapidSubject, vapidAuthorization } from "./_vapid.js";

const MAX_REQUEST_BYTES = 4096;
const MAX_ENDPOINT_LENGTH = 2048;
const MAX_DELAY_SECONDS = 45;
const PUSH_TTL_SECONDS = 600;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 12;

const EXACT_PUSH_HOSTS = new Set(["fcm.googleapis.com", "updates.push.services.mozilla.com"]);
const PUSH_HOST_SUFFIXES = [".push.apple.com", ".notify.windows.com"];

export type PushTestBody = { endpoint: URL; delaySeconds: number };

export type PushTestDeps = {
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
};

const defaultDeps: PushTestDeps = {
  fetch: (input, init) => fetch(input, init),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
};

class RequestError extends Error {
  constructor(readonly status: number, readonly publicMessage: string) {
    super(publicMessage);
  }
}

export function json(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'",
      "x-content-type-options": "nosniff",
    },
  });
}

export function isKnownPushHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return EXACT_PUSH_HOSTS.has(host) || PUSH_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix) && host.length > suffix.length);
}

export function isPushTestEnabled(): boolean {
  return process.env.PUSH_TEST_ENABLED === "1";
}

function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  return origin == null || origin === new URL(request.url).origin;
}

/** Closed schema of docs/api/push.openapi.yaml#PushTestRequest. Throws a 400 on anything else. */
export function parsePushTestBody(value: unknown): PushTestBody {
  const invalid = new RequestError(400, "This test request is not valid.");
  if (typeof value !== "object" || value == null || Array.isArray(value)) throw invalid;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== 2 || !keys.includes("endpoint") || !keys.includes("delaySeconds")) throw invalid;
  const { endpoint, delaySeconds } = record;
  if (typeof delaySeconds !== "number" || !Number.isInteger(delaySeconds) || delaySeconds < 0 || delaySeconds > MAX_DELAY_SECONDS) throw invalid;
  if (typeof endpoint !== "string" || endpoint.length > MAX_ENDPOINT_LENGTH) throw invalid;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw invalid;
  }
  if (url.protocol !== "https:" || url.port !== "" || url.username !== "" || url.password !== "") throw invalid;
  if (!isKnownPushHost(url.hostname)) throw new RequestError(400, "This push service is not allowed.");
  return { endpoint: url, delaySeconds };
}

async function readJson(request: Request): Promise<unknown> {
  const declaredLength = Number.parseInt(request.headers.get("content-length") ?? "0", 10);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) throw new RequestError(413, "This test request is too large.");
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_REQUEST_BYTES) throw new RequestError(413, "This test request is too large.");
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new RequestError(400, "This test request is not valid.");
  }
}

// A per-instance memory, lost on every cold start and not shared between instances. Enough to stop a
// loop from one page during a test that runs for a few days; the daily summary gets a real limit
// (ADR-0016 step 3).
const recentRequests: number[] = [];

export function resetPushTestRateLimit(): void {
  recentRequests.length = 0;
}

function allowRequest(now: number): boolean {
  while (recentRequests.length > 0 && (recentRequests[0] ?? 0) <= now - RATE_LIMIT_WINDOW_MS) recentRequests.shift();
  if (recentRequests.length >= RATE_LIMIT_MAX_REQUESTS) return false;
  recentRequests.push(now);
  return true;
}

type VapidConfig = { publicKey: string; privateKey: string; subject: string };

export function readVapidConfig(): VapidConfig | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim() ?? "";
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim() ?? "";
  const subject = process.env.VAPID_SUBJECT?.trim() ?? "";
  if (!isVapidPublicKey(publicKey) || privateKey.length === 0 || !isVapidSubject(subject)) return null;
  return { publicKey, privateKey, subject };
}

export async function sendTestPush(request: Request, deps: PushTestDeps = defaultDeps): Promise<Response> {
  if (request.method !== "POST") return json({ message: "Method not allowed." }, 405);
  if (!isPushTestEnabled()) return json({ message: "The push test is switched off." }, 403);
  if (!isSameOriginRequest(request)) return json({ message: "Origin not allowed." }, 403);
  if (!allowRequest(deps.now())) return json({ message: "Too many test pushes. Wait a few minutes." }, 429);

  let body: PushTestBody;
  try {
    body = parsePushTestBody(await readJson(request));
  } catch (error) {
    if (error instanceof RequestError) return json({ message: error.publicMessage }, error.status);
    throw error;
  }

  const config = readVapidConfig();
  if (config == null) return json({ message: "Push is not configured on the server." }, 503);
  let privateKey: CryptoKey;
  try {
    privateKey = await importVapidPrivateKey(config.privateKey);
  } catch {
    return json({ message: "Push is not configured on the server." }, 503);
  }

  if (body.delaySeconds > 0) await deps.sleep(body.delaySeconds * 1000);

  const sentAtMs = deps.now();
  const jwt = await buildVapidJwt({
    audience: body.endpoint.origin,
    subject: config.subject,
    privateKey,
    nowSeconds: Math.floor(sentAtMs / 1000),
  });
  const sentAt = new Date(sentAtMs).toISOString();
  let pushStatus: number;
  try {
    const response = await deps.fetch(body.endpoint.href, {
      method: "POST",
      // Empty push: no payload, so no aes128gcm encryption and no subscription keys needed.
      headers: { TTL: String(PUSH_TTL_SECONDS), Urgency: "high", Authorization: vapidAuthorization(jwt, config.publicKey) },
      redirect: "manual",
    });
    pushStatus = response.status;
    await response.body?.cancel();
  } catch {
    return json({ message: "The push service could not be reached.", sentAt }, 502);
  }
  if (pushStatus < 200 || pushStatus >= 300) return json({ message: "The push service refused the push.", sentAt, pushStatus }, 502);
  return json({ sentAt, pushStatus }, 202);
}
