import { isSameOriginRequest, json, sendMessage } from "../_lib/helpGateway.ts";

// The Web fetch export is Vercel's explicit Node.js Function signature for
// framework-agnostic projects. A bare one-argument default function can be
// classified as an Edge Function during output deployment.
export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") return json({ message: "Method not allowed." }, 405);
    if (!isSameOriginRequest(request)) return json({ message: "Origin not allowed." }, 403);
    return sendMessage(request);
  },
};
