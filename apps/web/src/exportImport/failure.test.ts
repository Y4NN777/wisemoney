import { describe, expect, it } from "vitest";
import { cyclePrepareFailureKey, cycleResetFailureKey, exportFailureKey, importFailureKey } from "./failure.ts";

const decryptRefused = new DOMException("", "OperationError");
const quota = new DOMException("The quota has been exceeded.", "QuotaExceededError");

describe("importFailureKey", () => {
  it("names a wrong passphrase when AES-GCM refuses the derived key", () => {
    expect(importFailureKey(decryptRefused)).toBe("exportImport.import.errors.wrongPassphrase");
  });

  it("tells a file that is not a backup from a damaged backup", () => {
    expect(importFailureKey(new Error("importJSON: invalid JSON"))).toBe("exportImport.import.errors.invalidFile");
    expect(importFailureKey(new Error("importJSON: invalid export structure"))).toBe("exportImport.import.errors.invalidFile");
    for (const message of [
      "importJSON: invalid financial event",
      "importJSON: invalid payload for event e1",
      "importJSON: invalid currency settings",
      "importJSON: invalid FX rate",
      "importJSON: invalid iv length",
      "importJSON: unsupported encrypted export parameters",
      "importJSON: financial event sequence is inconsistent",
    ]) {
      expect(importFailureKey(new Error(message))).toBe("exportImport.import.errors.damaged");
    }
  });

  it("names the size limit and a full device", () => {
    expect(importFailureKey(new Error("importJSON: file exceeds the 100 MB limit"))).toBe("exportImport.import.errors.tooLarge");
    expect(importFailureKey(quota)).toBe("exportImport.import.errors.storage");
  });

  it("falls back to the generic import message", () => {
    expect(importFailureKey(new Error("No file selected"))).toBe("exportImport.import.errors.failed");
    expect(importFailureKey(undefined)).toBe("exportImport.import.errors.failed");
  });
});

describe("exportFailureKey", () => {
  it("names unreadable data, otherwise the export's own message", () => {
    expect(exportFailureKey(decryptRefused, false)).toBe("exportImport.export.errors.unreadable");
    expect(exportFailureKey(new Error("exportJSON: unknown event type x"), true)).toBe("exportImport.export.errors.unreadable");
    expect(exportFailureKey(new Error("boom"), false)).toBe("exportImport.export.errors.failed");
    expect(exportFailureKey(new Error("boom"), true)).toBe("exportImport.export.errors.encryptedFailed");
  });
});

describe("cycle failure keys", () => {
  it("explains a failed preparation", () => {
    expect(cyclePrepareFailureKey(new Error("cycleArchive: no financial data to archive"))).toBe("exportImport.cycle.errors.nothingToArchive");
    expect(cyclePrepareFailureKey(decryptRefused)).toBe("exportImport.cycle.errors.prepareUnreadable");
    expect(cyclePrepareFailureKey(new Error("cycleArchive: invalid XLSX report"))).toBe("exportImport.cycle.errors.prepareFailed");
  });

  it("keeps a closed cycle apart from a refused closure", () => {
    expect(cycleResetFailureKey(new Error("seed failed"), true)).toBe("exportImport.cycle.errors.closedNotReady");
    expect(cycleResetFailureKey(new Error("cycleArchive: financial data changed after archive generation"), false))
      .toBe("exportImport.cycle.errors.dataChanged");
    expect(cycleResetFailureKey({ name: "AbortError", inner: quota }, false)).toBe("exportImport.cycle.errors.resetStorage");
    expect(cycleResetFailureKey(new Error("cycleArchive: invalid backup"), false)).toBe("exportImport.cycle.errors.resetFailed");
  });
});
