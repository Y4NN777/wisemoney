import { describe, expect, it } from "vitest";
import { getDashboardMode } from "./dashboardMode.ts";

describe("getDashboardMode", () => {
  it("shows setup when there is no active account", () => {
    expect(getDashboardMode(0, false)).toBe("setup");
    expect(getDashboardMode(0, true)).toBe("setup");
  });

  it("asks for the first transaction after an account is created", () => {
    expect(getDashboardMode(1, false)).toBe("first-transaction");
  });

  it("keeps onboarding complete after any surviving transaction", () => {
    expect(getDashboardMode(1, true)).toBe("active");
  });
});
