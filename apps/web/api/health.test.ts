import { describe, expect, it } from "vitest";

import health from "./health.ts";

describe("Vercel health function", () => {
  it("returns an ok response", async () => {
    const response = health.fetch();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });
});
