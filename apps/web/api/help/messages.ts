function json(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'",
      "x-content-type-options": "nosniff",
    },
  });
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") return json({ message: "Method not allowed." }, 405);

    // Vercel evaluates the entrypoint before invoking fetch. Loading the heavier
    // gateway lazily keeps method handling observable if that module cannot load.
    const { isSameOriginRequest, sendMessage } = await import("./_helpGateway.js");
    if (!isSameOriginRequest(request)) return json({ message: "Origin not allowed." }, 403);
    return sendMessage(request);
  },
};
