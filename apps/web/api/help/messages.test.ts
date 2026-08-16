import { describe, expect, it } from "vitest";

import { GET, POST } from "./messages.ts";

describe("help messages Vercel entrypoint", () => {
  it("exports callable HTTP handlers and rejects GET", async () => {
    expect(typeof GET).toBe("function");
    expect(typeof POST).toBe("function");

    const response = GET();

    expect(response.status).toBe(405);
    await expect(response.json()).resolves.toEqual({ message: "Method not allowed." });
  });
});
