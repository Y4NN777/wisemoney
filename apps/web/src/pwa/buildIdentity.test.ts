import { describe, expect, it } from "vitest";
import { currentBuildId, takeUpdateNotice } from "./buildIdentity.ts";

function memoryStorage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}

describe("update notice", () => {
  it("stays quiet on the first build, then tells once per new build", () => {
    const storage = memoryStorage();
    expect(takeUpdateNotice("/assets/index-a.js", storage)).toBe(false);
    expect(takeUpdateNotice("/assets/index-a.js", storage)).toBe(false);
    expect(takeUpdateNotice("/assets/index-b.js", storage)).toBe(true);
    expect(takeUpdateNotice("/assets/index-b.js", storage)).toBe(false);
  });

  it("says nothing when the build or the storage is unknown", () => {
    expect(takeUpdateNotice(null, memoryStorage())).toBe(false);
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => undefined };
    expect(takeUpdateNotice("/assets/index-a.js", broken)).toBe(false);
  });

  it("reads the entry script of the page", () => {
    const doc = { querySelector: (selector: string) => selector === 'script[type="module"][src]' ? { getAttribute: () => "/assets/index-x.js" } : null };
    expect(currentBuildId(doc as unknown as Pick<Document, "querySelector">)).toBe("/assets/index-x.js");
  });
});
