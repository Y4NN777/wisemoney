import type { SurfaceId } from "../help/corpus.ts";
import type { AppFaultCode } from "../help/context.ts";
import { PRODUCT_VERSION } from "../releases/releaseNotes.ts";

const DIAGNOSTICS_KEY = "wisemoney.local-diagnostics.v1";
export const DIAGNOSTICS_CHANGED_EVENT = "wisemoney:diagnostics-changed";
const MAX_RECORDS = 40;

export type LocalDiagnostic = {
  schemaVersion: 1;
  id: string;
  occurredAt: number;
  faultCode: AppFaultCode;
  surfaceId: SurfaceId;
  appVersion: string;
  displayMode: "browser" | "installed";
  online: boolean;
};

function safeRecords(value: unknown): LocalDiagnostic[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (item == null || typeof item !== "object") return [];
    const record = item as Partial<LocalDiagnostic>;
    if (record.schemaVersion !== 1 || typeof record.id !== "string" || !Number.isSafeInteger(record.occurredAt) ||
      !["dashboard_load", "storage_unavailable", "render_conflict", "network_unavailable", "unknown"].includes(record.faultCode ?? "") ||
      typeof record.surfaceId !== "string" || typeof record.appVersion !== "string" || typeof record.online !== "boolean" ||
      !["browser", "installed"].includes(record.displayMode ?? "")) return [];
    return [record as LocalDiagnostic];
  }).slice(-MAX_RECORDS);
}

export function loadLocalDiagnostics(storage: Pick<Storage, "getItem"> | null = typeof localStorage === "undefined" ? null : localStorage): LocalDiagnostic[] {
  if (storage == null) return [];
  try { return safeRecords(JSON.parse(storage.getItem(DIAGNOSTICS_KEY) ?? "[]") as unknown); } catch { return []; }
}

function displayMode(): LocalDiagnostic["displayMode"] {
  return window.matchMedia?.("(display-mode: standalone)").matches === true || (navigator as Navigator & { standalone?: boolean }).standalone === true
    ? "installed"
    : "browser";
}

export function classifyAppError(error: unknown, fallback: AppFaultCode = "unknown"): AppFaultCode {
  if (error instanceof DOMException) {
    if (error.name === "NotFoundError" || error.message.includes("removeChild")) return "render_conflict";
    if (["AbortError", "DataError", "InvalidStateError", "OperationError", "QuotaExceededError", "UnknownError"].includes(error.name)) return "storage_unavailable";
  }
  if (error instanceof TypeError && typeof navigator !== "undefined" && !navigator.onLine) return "network_unavailable";
  return fallback;
}

export function recordLocalDiagnostic(
  faultCode: AppFaultCode,
  surfaceId: SurfaceId,
  storage: Pick<Storage, "getItem" | "setItem"> | null = typeof localStorage === "undefined" ? null : localStorage,
  now = Date.now(),
): LocalDiagnostic {
  const randomPart = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID().slice(0, 6).toUpperCase()
    : Math.random().toString(36).slice(2, 8).toUpperCase();
  const record: LocalDiagnostic = {
    schemaVersion: 1,
    id: `WM-${now.toString(36).toUpperCase()}-${randomPart}`,
    occurredAt: now,
    faultCode,
    surfaceId,
    appVersion: PRODUCT_VERSION,
    displayMode: typeof window === "undefined" ? "browser" : displayMode(),
    online: typeof navigator !== "undefined" && typeof navigator.onLine === "boolean" ? navigator.onLine : false,
  };
  if (storage != null) {
    try {
      const records = loadLocalDiagnostics(storage);
      const previous = records.at(-1);
      if (previous != null && previous.faultCode === faultCode && previous.surfaceId === surfaceId && now - previous.occurredAt < 2_000) {
        return previous;
      }
      storage.setItem(DIAGNOSTICS_KEY, JSON.stringify([...records, record].slice(-MAX_RECORDS)));
    } catch {
      // Diagnostics are best-effort and must never replace the recovery screen.
    }
  }
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(DIAGNOSTICS_CHANGED_EVENT, { detail: record }));
  return record;
}

export function repeatedLocalFault(now = Date.now()): AppFaultCode | null {
  const recent = loadLocalDiagnostics().filter((item) => item.occurredAt >= now - 10 * 60 * 1000);
  for (const code of ["dashboard_load", "storage_unavailable", "render_conflict", "network_unavailable", "unknown"] as const) {
    if (recent.filter((item) => item.faultCode === code).length >= 2) return code;
  }
  return null;
}

export function resetLocalDiagnostics(storage: Pick<Storage, "setItem"> | null = typeof localStorage === "undefined" ? null : localStorage): void {
  try { storage?.setItem(DIAGNOSTICS_KEY, "[]"); } catch { /* Local storage may be unavailable. */ }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(DIAGNOSTICS_CHANGED_EVENT));
}
