import { isStorageFull } from "@/lib/actionFailure.ts";

/**
 * Maps export, import and cycle-archive failures to the locale key that says what happened and
 * what to do next. The causes come from the errors thrown in index.ts and cycle.ts.
 */

function errorName(error: unknown): string | null {
  return error != null && typeof error === "object" && typeof (error as { name?: unknown }).name === "string"
    ? (error as { name: string }).name
    : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "";
}

/** AES-GCM refuses the key: a wrong passphrase on import, an unreadable record on export. */
function isDecryptFailure(error: unknown): boolean {
  return errorName(error) === "OperationError";
}

/** A stored record that cannot be decrypted or decoded. */
function isUnreadableData(error: unknown): boolean {
  return isDecryptFailure(error) || errorMessage(error).startsWith("exportJSON: unknown event type");
}

export function importFailureKey(error: unknown): string {
  const message = errorMessage(error);
  if (isDecryptFailure(error)) return "exportImport.import.errors.wrongPassphrase";
  if (message.startsWith("importJSON: file exceeds")) return "exportImport.import.errors.tooLarge";
  if (message === "importJSON: invalid JSON" || message === "importJSON: invalid export structure") {
    return "exportImport.import.errors.invalidFile";
  }
  if (message.startsWith("importJSON: invalid") || message.startsWith("importJSON: unsupported") ||
      message.startsWith("importJSON: financial event sequence")) {
    return "exportImport.import.errors.damaged";
  }
  if (isStorageFull(error)) return "exportImport.import.errors.storage";
  return "exportImport.import.errors.failed";
}

export function exportFailureKey(error: unknown, encrypted: boolean): string {
  if (isUnreadableData(error)) return "exportImport.export.errors.unreadable";
  return encrypted ? "exportImport.export.errors.encryptedFailed" : "exportImport.export.errors.failed";
}

export function cyclePrepareFailureKey(error: unknown): string {
  if (errorMessage(error) === "cycleArchive: no financial data to archive") return "exportImport.cycle.errors.nothingToArchive";
  if (isUnreadableData(error)) return "exportImport.cycle.errors.prepareUnreadable";
  return "exportImport.cycle.errors.prepareFailed";
}

/**
 * @param closed whether closeFinancialCycle had already succeeded when the error came: the cycle is
 *               then closed and only the follow-up (default categories, refresh) failed.
 */
export function cycleResetFailureKey(error: unknown, closed: boolean): string {
  if (closed) return "exportImport.cycle.errors.closedNotReady";
  if (errorMessage(error) === "cycleArchive: financial data changed after archive generation") {
    return "exportImport.cycle.errors.dataChanged";
  }
  if (isStorageFull(error)) return "exportImport.cycle.errors.resetStorage";
  return "exportImport.cycle.errors.resetFailed";
}
