import { describe, expect, it } from "vitest";
import { parseCaptureSearch } from "./capture.tsx";

describe("parseCaptureSearch", () => {
  it("accepts supported capture tabs", () => {
    expect(parseCaptureSearch({ tab: "manage" })).toEqual({ tab: "manage" });
    expect(parseCaptureSearch({ tab: "transaction" })).toEqual({ tab: "transaction" });
  });

  it("falls back to the transaction tab for missing or invalid values", () => {
    expect(parseCaptureSearch({})).toEqual({});
    expect(parseCaptureSearch({ tab: "unknown" })).toEqual({});
  });
});
