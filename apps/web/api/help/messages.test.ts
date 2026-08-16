import { describe, expect, it } from "vitest";

import messages from "./messages.ts";

describe("help messages Vercel entrypoint", () => {
  it("exports a callable Web Handler and rejects GET", async () => {
    expect(typeof messages.fetch).toBe("function");

    const response = await messages.fetch(new Request("https://app.example.test/api/help/messages"));

    expect(response.status).toBe(405);
    await expect(response.json()).resolves.toEqual({ message: "Method not allowed." });
  });
});
