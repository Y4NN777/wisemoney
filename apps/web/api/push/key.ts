import { json } from "./_pushTest.js";
import { isVapidPublicKey } from "./_vapid.js";

// The VAPID public key is public by design: the phone passes it to pushManager.subscribe.
export default {
  fetch(request: Request): Response {
    if (request.method !== "GET") return json({ message: "Method not allowed." }, 405);
    const publicKey = process.env.VAPID_PUBLIC_KEY?.trim() ?? "";
    if (!isVapidPublicKey(publicKey)) return json({ message: "Push is not configured on the server." }, 503);
    return json({ publicKey }, 200);
  },
};
