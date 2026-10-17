// Unlinked test page (/lab/push) for Y4NN's phones: subscribe to Web Push and ask the server for one
// empty push, to measure delivery with the app closed (ADR-0016 step 1). English only: a measuring tool.
import { useEffect, useState } from "react";
import { Button } from "../../components/ui/button.tsx";
import { base64UrlToBytes, endpointHost, fetchPushPublicKey, PUSH_TEST_DELAY_SECONDS, requestTestPush, type PushTestResult } from "./pushLabClient.ts";

type Trial = { id: number; requestedAt: Date; delaySeconds: number; result: PushTestResult | null };

const clock = (date: Date) => date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

function displayMode(): "standalone" | "browser" {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia("(display-mode: standalone)").matches ? "standalone" : "browser";
}

const hasPushManager = () => typeof window !== "undefined" && "PushManager" in window;
const hasNotification = () => typeof Notification !== "undefined";
const currentPermission = () => (hasNotification() ? Notification.permission : "unsupported");

async function registration(): Promise<ServiceWorkerRegistration> {
  if (!("serviceWorker" in navigator)) throw new Error("No service worker support in this browser.");
  return navigator.serviceWorker.ready;
}

const errorText = (cause: unknown) => (cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause));

export default function PushLabPage() {
  const [permission, setPermission] = useState<string>(currentPermission);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [trials, setTrials] = useState<Trial[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!hasPushManager()) return;
    void registration()
      .then((worker) => worker.pushManager.getSubscription())
      .then((subscription) => setEndpoint(subscription?.endpoint ?? null), (cause: unknown) => setError(errorText(cause)));
  }, []);

  const run = async (action: () => Promise<void>) => {
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  };

  const allow = () => run(async () => {
    if (!hasNotification()) throw new Error("Notifications are not supported here.");
    setPermission(await Notification.requestPermission());
  });

  const subscribe = () => run(async () => {
    const publicKey = await fetchPushPublicKey();
    const worker = await registration();
    const subscription = await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(publicKey) });
    setEndpoint(subscription.endpoint);
    setPermission(currentPermission());
  });

  const unsubscribe = () => run(async () => {
    const subscription = await (await registration()).pushManager.getSubscription();
    await subscription?.unsubscribe();
    setEndpoint(null);
  });

  const send = async (delaySeconds: number) => {
    if (endpoint == null) return;
    setError(null);
    const id = Date.now();
    setTrials((previous) => [...previous, { id, requestedAt: new Date(), delaySeconds, result: null }]);
    let result: PushTestResult;
    try {
      result = await requestTestPush(endpoint, delaySeconds);
    } catch (cause) {
      result = { ok: false, status: 0, message: errorText(cause) };
    }
    setTrials((previous) => previous.map((trial) => (trial.id === id ? { ...trial, result } : trial)));
  };

  const resultLine = (trial: Trial): string => {
    if (trial.result == null) return `waiting · push expected about ${clock(new Date(trial.requestedAt.getTime() + trial.delaySeconds * 1000))}`;
    if (trial.result.ok) return `sent at ${clock(new Date(trial.result.sentAt))} · push service ${trial.result.pushStatus}`;
    return `failed ${trial.result.status}${trial.result.pushStatus === undefined ? "" : ` (push service ${trial.result.pushStatus})`}: ${trial.result.message}`;
  };

  const diagnostics = [
    `permission=${permission}`,
    `pushManager=${hasPushManager()}`,
    `display=${displayMode()}`,
    `endpointHost=${endpointHost(endpoint)}`,
    `ua=${navigator.userAgent}`,
    ...trials.map((trial) => `requested ${clock(trial.requestedAt)} delay=${trial.delaySeconds}s · ${resultLine(trial)}`),
  ].join("\n");

  const copy = async () => {
    await navigator.clipboard.writeText(diagnostics);
    setCopied(true);
  };

  return (
    <main className="mx-auto max-w-lg space-y-4 p-4">
      <h1 className="text-xl font-semibold">Push lab</h1>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Allow notifications, then Subscribe.</li>
        <li>Tap “Send test in 30 s”, close the app and lock the phone.</li>
        <li>Wait. Note the time the notification arrives.</li>
        <li>Open this page again and Copy diagnostics.</li>
      </ol>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Permission</dt><dd>{permission}</dd>
        <dt className="text-muted-foreground">PushManager</dt><dd>{hasPushManager() ? "yes" : "no"}</dd>
        <dt className="text-muted-foreground">Display</dt><dd>{displayMode()}</dd>
        <dt className="text-muted-foreground">Subscribed</dt><dd>{endpoint == null ? "no" : `yes · ${endpointHost(endpoint)}`}</dd>
      </dl>

      <section className="flex flex-wrap gap-2">
        <Button onClick={() => { void allow(); }} disabled={busy || permission === "granted"}>Allow notifications</Button>
        <Button onClick={() => { void subscribe(); }} disabled={busy || endpoint != null || !hasPushManager()}>Subscribe</Button>
        <Button onClick={() => { void send(PUSH_TEST_DELAY_SECONDS); }} disabled={endpoint == null}>Send test in 30 s</Button>
        <Button variant="outline" onClick={() => { void send(0); }} disabled={endpoint == null}>Send now</Button>
        <Button variant="outline" onClick={() => { void unsubscribe(); }} disabled={busy || endpoint == null}>Unsubscribe</Button>
      </section>

      {error != null && <p className="text-sm text-destructive" role="alert">{error}</p>}

      {trials.length > 0 && (
        <ol className="space-y-2 text-sm" aria-live="polite">
          {trials.map((trial) => (
            <li key={trial.id} className="rounded-md border p-2">
              <div>Requested {clock(trial.requestedAt)} · delay {trial.delaySeconds} s</div>
              <div>{resultLine(trial)}</div>
            </li>
          ))}
        </ol>
      )}

      <section className="space-y-2">
        <Button variant="outline" onClick={() => { void copy(); }}>{copied ? "Copied" : "Copy diagnostics"}</Button>
        <pre className="whitespace-pre-wrap break-words text-xs text-muted-foreground">{navigator.userAgent}</pre>
      </section>
    </main>
  );
}
