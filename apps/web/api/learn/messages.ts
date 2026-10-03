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

    // Same pattern as api/help/messages.ts: the entrypoint stays observable if a gateway module
    // cannot load.
    const [{ isSameOriginRequest }, { sendLearnMessage }] = await Promise.all([
      import("../help/_helpGateway.js"),
      import("./_learnGateway.js"),
    ]);
    if (!isSameOriginRequest(request)) return json({ message: "Origin not allowed." }, 403);
    return sendLearnMessage(request);
  },
};
