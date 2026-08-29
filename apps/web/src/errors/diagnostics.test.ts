import { describe, expect, it } from "vitest";
import { classifyAppError, loadLocalDiagnostics, recordLocalDiagnostic } from "./diagnostics.ts";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe("local diagnostics", () => {
  it("stores only a generic code and device context, never technical error text", () => {
    const storage = memoryStorage();
    recordLocalDiagnostic("dashboard_load", "dashboard", storage, 1_000);
    const [record] = loadLocalDiagnostics(storage);
    expect(record).toMatchObject({ faultCode: "dashboard_load", surfaceId: "dashboard", occurredAt: 1_000 });
    expect(Object.keys(record ?? {}).sort()).toEqual(["appVersion", "displayMode", "faultCode", "id", "occurredAt", "online", "schemaVersion", "surfaceId"]);
    expect(JSON.stringify(record)).not.toContain("message");
    expect(JSON.stringify(record)).not.toContain("stack");
  });

  it("deduplicates the React development remount of the same panel", () => {
    const storage = memoryStorage();
    recordLocalDiagnostic("unknown", "planning", storage, 1_000);
    recordLocalDiagnostic("unknown", "planning", storage, 1_100);
    expect(loadLocalDiagnostics(storage)).toHaveLength(1);
  });

  it("recognizes a DOM removal conflict without exposing the DOM exception", () => {
    expect(classifyAppError(new DOMException("Failed to execute removeChild", "NotFoundError"))).toBe("render_conflict");
  });

  it("never replaces recovery when browser storage rejects writes", () => {
    const blocked = { getItem: () => null, setItem: () => { throw new DOMException("blocked", "SecurityError"); } };
    expect(() => recordLocalDiagnostic("storage_unavailable", "dashboard", blocked, 2_000)).not.toThrow();
  });
});
