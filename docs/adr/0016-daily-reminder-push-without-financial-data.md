# ADR-0016: A daily reminder push that carries no financial data

| Field    | Value |
| -------- | ----- |
| Status   | Proposed (2026-10-17); step 1 measures delivery before anything else is built |
| Date     | 2026-10-17 |
| Diátaxis | Explanation |
| Source   | Y4NN 2026-10-17 ("phone push notifications reminders"; "push notifications are ingress, not egress"; "how is it working on Android"); research below; CONTRACT INV-EGR-01/02 |
| Binds    | `apps/web/src/sw.ts`; `apps/web/src/reminders/`; `apps/web/api/push/` (new); `docs/api/push.openapi.yaml` (new); `vercel.json` crons |

## Context

Reminders are computed on the phone from the vault (`src/reminders/`). A system notification appears
only when the app is open, when a new version installs, or on Chrome's periodic background sync, which
works only for an installed app, fires as often as Chrome decides from site engagement, possibly never,
and only on a known network (Chrome docs; MDN). iPhone has no periodic background sync. So with the app
closed nothing is guaranteed, and Y4NN's phone notifications "stopped working" (with a second cause,
reminders off by default, fixed in d013523).

Y4NN's point: a push is ingress. The server only needs to know when to wake the phone, not why.

Research, 2026-10-17:

- **Every push must show a notification.** Subscriptions require `userVisibleOnly: true`; Safari
  revokes a subscription after a few pushes that show nothing (WebKit "Meet Web Push"; WebKit commit
  108ccb4 sets three); Chrome shows its own "This site has been updated in the background" instead
  (Pushpad; W3C public-webapps thread with Chrome engineers, 2014).
- **iPhone:** Web Push only for a web app added to the Home Screen, iOS 16.4 or later (Apple, "Sending
  web push notifications in web apps and browsers").
- **Android Chrome:** no install needed; pushes travel through Google's push service. Delivery with
  Chrome closed and under aggressive battery savers (brands common in West Africa) is not documented in
  the sources read: to be measured (step 1).
- **Vercel Hobby crons** (docs updated 2026-07-15): up to 100 per project, each at most once a day,
  triggered within the hour (±59 min). Pro: per minute.

## Decision (proposed)

1. **A daily summary at a time the user picks**, among a few fixed slots (for example 7:00, 12:00,
   19:00 local), one cron per slot. The push is empty. On waking, the service worker reads the reminder
   queue already on the phone and always shows one notification: "Aujourd'hui : loyer, Awa doit vous
   rendre 12 500 F" or "Rien d'urgent aujourd'hui". Never a silent push.
2. **What leaves the phone:** the push subscription endpoint (an address issued by Google or Apple)
   and the chosen slot. Not the subscription's encryption keys (an empty push needs none), no account,
   no amount, name or date. Stored server-side with a creation date; deleted on unsubscribe and when the
   push service answers 404 or 410.
3. **No package on the server:** an empty push is one HTTPS POST with a VAPID header (an ES256 JWT
   signed with Web Crypto), which keeps the `api/` rule of no dependencies. The VAPID private key lives
   only in Vercel's environment.
4. **Opt-in, with its own switch** in Settings › Rappels, after the existing notification permission;
   the screen says in one line what leaves the phone.
5. **The calendar stays** for anyone who wants an alert at the exact due time with no server.

## Steps

1. **Measure delivery first.** A test endpoint sends one empty push to a subscription Y4NN creates on
   the Android phone and the iPhone (installed app); app closed, phone locked, on mobile data, at three
   moments. Record arrival and delay. If delivery fails on either phone, stop and amend this ADR.
2. OpenAPI contract `docs/api/push.openapi.yaml` (subscribe, unsubscribe; closed schemas), storage
   choice for subscriptions (to decide: a Vercel Marketplace store or the planned Postgres), THREAT_MODEL
   entry.
3. Server: subscribe and unsubscribe functions, one cron per slot, VAPID signing, cleanup on 404/410,
   rate limit on subscribe.
4. Client: subscription with `userVisibleOnly`, the slot picker, the service worker's daily summary
   from the local queue, help topic `rappels`.

## Consequences

- Positive: notifications with the app closed on both phones; no financial data on any server.
- Negative: one notification a day at a chosen hour, not at each due time; ±59 min on Hobby; a server
  and a store to run; iPhone needs the installed app.
- Risk: battery savers on some Android brands may delay or drop pushes (step 1 measures it); an
  endpoint store is a list of device addresses, protected like any personal data.

## Alternatives considered

- **Server pushes at each due time.** Exact, but the server would hold due dates: vault metadata
  leaving the phone. Rejected.
- **Periodic background sync only** (today). No server, but Chromium only, installed app only, at
  Chrome's discretion. Kept as a bonus where it fires.
- **Calendar export only.** Exact and private, but manual per item. Kept alongside.

## Sources

- Chrome, periodic background sync: https://developer.chrome.com/docs/capabilities/periodic-background-sync
- MDN, Web Periodic Background Synchronization API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Periodic_Background_Synchronization_API
- WebKit, Meet Web Push: https://webkit.org/?p=12945
- WebKit commit 108ccb4 (silent push quota): https://webkit.googlesource.com/WebKit/+/108ccb442e40e9705d212e74c1f213e3b5a0ea05
- Apple, Sending web push notifications in web apps and browsers: https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers
- Pushpad, "This site has been updated in the background": https://pushpad.xyz/blog/chrome-push-notifications-this-site-has-been-updated-in-the-background
- W3C public-webapps, userVisibleOnly discussion (2014): https://lists.w3.org/Archives/Public/public-webapps/2014OctDec/0251.html
- Vercel, cron jobs usage and pricing: https://vercel.com/docs/cron-jobs/usage-and-pricing
