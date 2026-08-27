import { describe, expect, it } from "vitest";
import { parseCaptureSearch } from "./capture.tsx";

describe("parseCaptureSearch", () => {
  it("accepts supported capture tabs", () => {
    expect(parseCaptureSearch({ tab: "manage" })).toEqual({ tab: "manage" });
    expect(parseCaptureSearch({ tab: "manage", section: "categories" })).toEqual({ tab: "manage", section: "categories" });
    expect(parseCaptureSearch({ tab: "transaction" })).toEqual({ tab: "transaction" });
    expect(parseCaptureSearch({ tab: "transaction", direction: "income" })).toEqual({ tab: "transaction", direction: "income" });
  });

  it("keeps management sections scoped to the manage tab", () => {
    expect(parseCaptureSearch({ tab: "manage", section: "unknown" })).toEqual({ tab: "manage" });
    expect(parseCaptureSearch({ tab: "transaction", section: "accounts" })).toEqual({ tab: "transaction" });
    expect(parseCaptureSearch({ tab: "transfer", direction: "income" })).toEqual({ tab: "transfer" });
  });

  it("falls back to the transaction tab for missing or invalid values", () => {
    expect(parseCaptureSearch({})).toEqual({});
    expect(parseCaptureSearch({ tab: "unknown" })).toEqual({});
  });
});
