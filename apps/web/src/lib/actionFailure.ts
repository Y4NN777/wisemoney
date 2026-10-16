import { AppendEventError } from "@/domain/eventStore.ts";
import { ValidationError } from "@/pillars/state/index.ts";

/**
 * Why a write to the local journal failed, in the terms a person can act on.
 * - changedMeanwhile: the data moved between validation and write (STALE_SNAPSHOT), e.g. another tab.
 * - gone: something the action points at no longer exists or is archived (INV-EVT-03).
 * - storage: the device refused the write (IndexedDB write failure, quota exceeded).
 * - other: anything else; the screen says what did not happen and how to retry.
 */
export type ActionFailureCause = "changedMeanwhile" | "gone" | "storage" | "other";

const NOT_FOUND = /not found/i;

/** True when the error, or an error it wraps, is the browser's QuotaExceededError. */
export function isStorageFull(failure: unknown): boolean {
  let current: unknown = failure;
  for (let depth = 0; depth < 4 && current != null && typeof current === "object"; depth++) {
    const candidate = current as { name?: unknown; message?: unknown; inner?: unknown; cause?: unknown };
    if (candidate.name === "QuotaExceededError") return true;
    if (typeof candidate.message === "string" && candidate.message.includes("QuotaExceeded")) return true;
    current = candidate.inner ?? candidate.cause;
  }
  return false;
}

/** True when a ValidationError carries this exact domain message. */
export function hasValidationMessage(failure: unknown, message: string): boolean {
  return failure instanceof ValidationError && failure.details.some((detail) => detail.message === message);
}

export function actionFailureCause(failure: unknown): ActionFailureCause {
  if (failure instanceof AppendEventError) {
    if (failure.code === "STALE_SNAPSHOT") return "changedMeanwhile";
    if (failure.code === "WRITE_FAILED") return "storage";
    return "other";
  }
  if (isStorageFull(failure)) return "storage";
  if (failure instanceof ValidationError && failure.details.length > 0 &&
      failure.details.every((detail) => NOT_FOUND.test(detail.message))) {
    return "gone";
  }
  return "other";
}

type Translate = (key: string) => string;

/**
 * The message for a failed write: a known cause gets its shared message (what happened and what
 * to do), anything else the screen's own message for that action.
 */
export function actionFailureMessage(t: Translate, failure: unknown, fallbackKey: string): string {
  const cause = actionFailureCause(failure);
  return cause === "other" ? t(fallbackKey) : t(`actionFailure.${cause}`);
}
