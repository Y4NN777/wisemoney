import { describe, expect, it } from "vitest";
import { getDashboardMode } from "./dashboardMode.ts";

describe("getDashboardMode", () => {
  it("stays in the first-transaction mode until a movement exists — setup is obsolete since capture creates the default account silently", () => {
    expect(getDashboardMode(false)).toBe("first-transaction");
  });

  it("goes active once any movement is recorded", () => {
    expect(getDashboardMode(true)).toBe("active");
  });
});
