import { describe, expect, it } from "vitest";
import { FIRST_SESSION_EXTRAS, nextExtra } from "./extras.ts";

describe("first session extras", () => {
  it("goes voice, then the assistant, then back to Home", () => {
    expect(FIRST_SESSION_EXTRAS).toEqual(["voice", "ai"]);
    expect(nextExtra("voice")).toBe("ai");
    expect(nextExtra("ai")).toBeNull();
  });
});
