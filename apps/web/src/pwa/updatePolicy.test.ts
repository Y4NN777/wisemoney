import { describe, expect, it } from "vitest";
import {
  clearPwaUpdateReload,
  consumePwaUpdateReload,
  getPwaUpdateDisposition,
  markPwaUpdateReload,
  shouldReloadAfterControllerChange,
} from "./updatePolicy.ts";

describe("PWA update policy", () => {
  it("does not activate a waiting update while the encrypted vault is open", () => {
    expect(getPwaUpdateDisposition(true, true)).toBe("defer");
    expect(shouldReloadAfterControllerChange(true)).toBe(false);
  });

  it("activates and reloads safely once the vault is locked", () => {
    expect(getPwaUpdateDisposition(true, false)).toBe("activate");
    expect(shouldReloadAfterControllerChange(false)).toBe(true);
  });

  it("reloads an open vault only after the user explicitly approves the update", () => {
    expect(shouldReloadAfterControllerChange(true, true)).toBe(true);
  });

  it("does nothing when no update is waiting", () => {
    expect(getPwaUpdateDisposition(false, true)).toBe("idle");
    expect(getPwaUpdateDisposition(false, false)).toBe("idle");
  });

  it("persists and consumes the post-reload confirmation once", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    };

    expect(markPwaUpdateReload(storage)).toBe(true);
    expect(consumePwaUpdateReload(storage)).toBe(true);
    expect(consumePwaUpdateReload(storage)).toBe(false);
  });

  it("keeps the update flow operational when session storage is unavailable", () => {
    const storage = {
      getItem: () => {
        throw new Error("storage disabled");
      },
      removeItem: () => {
        throw new Error("storage disabled");
      },
      setItem: () => {
        throw new Error("storage disabled");
      },
    };

    expect(markPwaUpdateReload(storage)).toBe(false);
    expect(consumePwaUpdateReload(storage)).toBe(false);
    expect(() => clearPwaUpdateReload(storage)).not.toThrow();
  });
});
