import { isSameOriginRequest, json, sendMessage } from "./_helpGateway";

// Named HTTP method exports use Vercel's unambiguous Web Handler contract and
// avoid the legacy two-argument Node handler adapter used by some Vite builds.
export function GET(): Response {
  return json({ message: "Method not allowed." }, 405);
}

export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginRequest(request)) return json({ message: "Origin not allowed." }, 403);
  return sendMessage(request);
}
