// /lab/push calls to docs/api/push.openapi.yaml (ADR-0016 step 1, test only).
// Only the subscription endpoint is sent: never its p256dh or auth keys.

export const PUSH_TEST_DELAY_SECONDS = 30;

export type PushTestResult = { ok: true; sentAt: string; pushStatus: number } | { ok: false; status: number; message: string; pushStatus?: number };

export function base64UrlToBytes(text: string): Uint8Array<ArrayBuffer> {
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(text.length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export async function fetchPushPublicKey(): Promise<string> {
  const response = await fetch("/api/push/key", { headers: { accept: "application/json" } });
  const body = (await response.json().catch(() => null)) as { publicKey?: unknown; message?: unknown } | null;
  if (!response.ok || typeof body?.publicKey !== "string") {
    throw new Error(`Key unavailable (${response.status}${typeof body?.message === "string" ? `: ${body.message}` : ""})`);
  }
  return body.publicKey;
}

export async function requestTestPush(endpoint: string, delaySeconds: number): Promise<PushTestResult> {
  const response = await fetch("/api/push/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ endpoint, delaySeconds }),
  });
  const body = (await response.json().catch(() => null)) as { sentAt?: unknown; pushStatus?: unknown; message?: unknown } | null;
  const pushStatus = typeof body?.pushStatus === "number" ? body.pushStatus : undefined;
  if (response.status === 202 && typeof body?.sentAt === "string" && pushStatus !== undefined) {
    return { ok: true, sentAt: body.sentAt, pushStatus };
  }
  const message = typeof body?.message === "string" ? body.message : "No message";
  return pushStatus === undefined ? { ok: false, status: response.status, message } : { ok: false, status: response.status, message, pushStatus };
}

export function endpointHost(endpoint: string | null): string {
  if (endpoint == null) return "none";
  try {
    return new URL(endpoint).host;
  } catch {
    return "invalid";
  }
}
