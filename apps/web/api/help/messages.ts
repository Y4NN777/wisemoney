import { isSameOriginRequest, json, sendMessage } from "../_lib/helpGateway.ts";

export const config = { runtime: "edge" };

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") return json({ message: "Method not allowed." }, 405);
  if (!isSameOriginRequest(request)) return json({ message: "Origin not allowed." }, 403);
  return sendMessage(request);
}
