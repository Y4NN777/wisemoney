/// <reference lib="webworker" />

import { ExpirationPlugin } from "workbox-expiration";
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { CacheFirst } from "workbox-strategies";
import {
  REMINDER_PERIODIC_SYNC_TAG,
  getReminderQueueStorage,
  isReminderWorkerMessage,
  notificationFor,
  processDueReminders,
} from "./pwa/reminderQueue.ts";
import { cacheHoldsStuckBuild } from "./pwa/stuckBuilds.ts";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ revision?: string; url: string }>;
};

type CacheStrategyPlugin = NonNullable<
  NonNullable<ConstructorParameters<typeof CacheFirst>[0]>["plugins"]
>[number];

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Preserve SPA navigation offline while leaving server functions outside the
// shell fallback.
registerRoute(new NavigationRoute(createHandlerBoundToURL("/index.html"), {
  denylist: [/^\/api\//],
}));

// Argon2id comes from hash-wasm and must remain usable for offline unlock.
registerRoute(
  ({ url }) => url.pathname.endsWith(".wasm"),
  new CacheFirst({
    cacheName: "wasm-cache",
    // Workbox's optional callback declarations predate exactOptionalPropertyTypes.
    plugins: [new ExpirationPlugin({ maxAgeSeconds: 60 * 60 * 24 * 30 }) as unknown as CacheStrategyPlugin],
  }),
);

async function processReminderQueue(): Promise<void> {
  await processDueReminders(
    getReminderQueueStorage(),
    async (reminder) => {
      const notification = notificationFor(reminder);
      await self.registration.showNotification(notification.title, notification.options);
    },
  );
}

self.addEventListener("message", (event) => {
  // The page asks the waiting worker to take over only at opening, before the first touch.
  if ((event.data as { type?: unknown } | null)?.type === "SKIP_WAITING") {
    event.waitUntil(self.skipWaiting());
    return;
  }
  if (isReminderWorkerMessage(event.data)) event.waitUntil(processReminderQueue());
});

// A device on a build that never activates a waiting version would stay on it: take over at once,
// without reloading any page, so no unlock is cut off (Y4NN chose this on 2026-10-08). The old page
// runs on until its next opening; every later version follows the opening rule in startupUpdate.ts.
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const names = (await caches.keys()).filter((name) => name.startsWith("workbox-precache"));
    const urls = (await Promise.all(names.map(async (name) => (await (await caches.open(name)).keys()).map((request) => request.url)))).flat();
    if (cacheHoldsStuckBuild(urls)) await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(Promise.all([self.clients.claim(), processReminderQueue()]));
});

self.addEventListener("periodicsync", (event) => {
  const periodicEvent = event as ExtendableEvent & { tag: string };
  if (periodicEvent.tag === REMINDER_PERIODIC_SYNC_TAG) {
    periodicEvent.waitUntil(processReminderQueue());
  }
});

// ADR-0016 STEP 1 HANDLER, TEST ONLY: replaced by the daily summary read from the local reminder queue
// (step 4). Every push shows a notification inside waitUntil: Safari revokes a subscription after a few
// pushes that show nothing, and Chrome shows its own generic notice instead.
const PUSH_TEST_TIME = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });

self.addEventListener("push", (event) => {
  event.waitUntil(self.registration.showNotification("WiseMoney", {
    body: `Test de notification reçu à ${PUSH_TEST_TIME.format(new Date())}`,
    icon: "/icons/wisemoney-icon-192.png",
    data: { href: "/lab/push", kind: "push-test" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const value = (event.notification.data as { href?: unknown } | null)?.href;
    const href = typeof value === "string" && /^\/(?!\/)/.test(value) ? value : "/";
    const target = new URL(href, self.location.origin).href;
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const exactWindow = windows.find((client) => client.url === target);
    if (exactWindow != null) {
      await exactWindow.focus();
      return;
    }
    const appWindow = windows[0];
    if (appWindow != null) {
      await appWindow.navigate(target);
      await appWindow.focus();
      return;
    }
    await self.clients.openWindow(target);
  })());
});
