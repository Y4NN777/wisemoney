import { describe, expect, it } from "vitest";
import { createSafeHelpContext, isSafeHelpContext } from "./context.ts";

describe("safe WiseBot context", () => {
  it("contains only identifiers and generic environment fields", () => {
    const context = createSafeHelpContext({ locale: "fr", entryPoint: "error", surfaceId: "dashboard", taskId: "hors-ligne", faultCode: "dashboard_load" });
    expect(Object.keys(context).sort()).toEqual(["entryPoint", "faultCode", "knowledgeVersion", "locale", "schemaVersion", "surfaceId", "taskId"]);
    expect(isSafeHelpContext(context)).toBe(true);
  });

  it("rejects extra private fields even when the allowed fields are valid", () => {
    const context = { ...createSafeHelpContext({ locale: "en", surfaceId: "help" }), balance: 100, accountName: "Private" };
    expect(isSafeHelpContext(context)).toBe(false);
  });
});
