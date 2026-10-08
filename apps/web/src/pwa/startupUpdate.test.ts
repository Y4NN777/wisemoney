import { describe, expect, it } from "vitest";
import { shouldActivateAtStartup } from "./startupUpdate.ts";

describe("startup update", () => {
  it("installs a version that was waiting at opening, before any touch", () => {
    expect(shouldActivateAtStartup(true, false, false)).toBe(true);
  });

  it("never installs once the user has touched the page or unlocked", () => {
    expect(shouldActivateAtStartup(true, true, false)).toBe(false);
    expect(shouldActivateAtStartup(true, false, true)).toBe(false);
  });

  it("does nothing without a waiting version", () => {
    expect(shouldActivateAtStartup(false, false, false)).toBe(false);
  });
});
