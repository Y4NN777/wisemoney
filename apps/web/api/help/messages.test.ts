import { describe, expect, it } from "vitest";

import handler from "./messages.ts";

describe("help messages Vercel entrypoint", () => {
  it("exports a callable handler and rejects unsupported methods", async () => {
    expect(typeof handler).toBe("function");

    const response = await handler(new Request("https://app.example.test/api/help/messages"));

    expect(response.status).toBe(405);
    await expect(response.json()).resolves.toEqual({ message: "Method not allowed." });
  });
});
