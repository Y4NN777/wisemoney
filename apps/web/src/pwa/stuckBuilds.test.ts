import { describe, expect, it } from "vitest";
import { cacheHoldsStuckBuild } from "./stuckBuilds.ts";

describe("stuck builds", () => {
  it("recognises a precache from one of the four builds that never update", () => {
    expect(cacheHoldsStuckBuild(["https://wisemoney.y7labs.studio/index.html?__WB_REVISION__=1", "https://wisemoney.y7labs.studio/assets/index-B_0kXTWF.js"])).toBe(true);
  });

  it("leaves any other build to the normal rule", () => {
    expect(cacheHoldsStuckBuild(["https://wisemoney.y7labs.studio/assets/index-B-oCWh8z.js"])).toBe(false);
    expect(cacheHoldsStuckBuild([])).toBe(false);
  });
});
