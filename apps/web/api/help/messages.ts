import { isSameOriginRequest, json, sendMessage } from "../_lib/helpGateway";

// `vercel.json` selects the Node.js Function runtime. The Vite integration
// invokes this module's default export directly, so it must remain callable.
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") return json({ message: "Method not allowed." }, 405);
  if (!isSameOriginRequest(request)) return json({ message: "Origin not allowed." }, 403);
  return sendMessage(request);
}
