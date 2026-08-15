import { isSameOriginRequest, json, sendMessage } from "../_lib/helpGateway.ts";

// Use Vercel's default Node.js runtime. Unlike the Edge runtime, it bundles the
// shared TypeScript gateway imported from api/_lib without deployment-time
// unsupported-module restrictions.
export const config = { maxDuration: 90 };

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") return json({ message: "Method not allowed." }, 405);
  if (!isSameOriginRequest(request)) return json({ message: "Origin not allowed." }, 403);
  return sendMessage(request);
}
