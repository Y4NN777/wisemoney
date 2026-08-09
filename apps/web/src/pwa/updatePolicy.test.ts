import { describe, expect, it } from "vitest";
import { getPwaUpdateDisposition, shouldReloadAfterControllerChange } from "./updatePolicy.ts";

describe("PWA update policy", () => {
  it("does not activate a waiting update while the encrypted vault is open", () => {
    expect(getPwaUpdateDisposition(true, true)).toBe("defer");
    expect(shouldReloadAfterControllerChange(true)).toBe(false);
  });

  it("activates and reloads safely once the vault is locked", () => {
    expect(getPwaUpdateDisposition(true, false)).toBe("activate");
    expect(shouldReloadAfterControllerChange(false)).toBe(true);
  });

  it("does nothing when no update is waiting", () => {
    expect(getPwaUpdateDisposition(false, true)).toBe("idle");
    expect(getPwaUpdateDisposition(false, false)).toBe("idle");
  });
});
