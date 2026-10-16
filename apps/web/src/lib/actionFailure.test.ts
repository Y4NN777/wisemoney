import { describe, expect, it } from "vitest";
import { AppendEventError } from "@/domain/eventStore.ts";
import { AccountNotEmptyError, REFUSAL, ValidationError } from "@/pillars/state/index.ts";
import { actionFailureCause, actionFailureMessage, hasValidationMessage, isStorageFull } from "./actionFailure.ts";

const t = (key: string) => `[${key}]`;

describe("actionFailureCause", () => {
  it("reads a concurrent change from STALE_SNAPSHOT", () => {
    expect(actionFailureCause(new AppendEventError("STALE_SNAPSHOT", "e1", "changed"))).toBe("changedMeanwhile");
  });

  it("reads a refused device write as storage", () => {
    expect(actionFailureCause(new AppendEventError("WRITE_FAILED", "e1", "Failed to append event: QuotaExceededError"))).toBe("storage");
    expect(actionFailureCause(new DOMException("The quota has been exceeded.", "QuotaExceededError"))).toBe("storage");
  });

  it("finds a quota error wrapped by Dexie (inner) or by a cause", () => {
    const quota = new DOMException("full", "QuotaExceededError");
    expect(isStorageFull({ name: "AbortError", message: "Transaction aborted", inner: quota })).toBe(true);
    expect(isStorageFull(new Error("import failed", { cause: quota }))).toBe(true);
    expect(isStorageFull(new Error("something else"))).toBe(false);
  });

  it("reads a validation made only of not-found details as gone", () => {
    expect(actionFailureCause(new ValidationError([{ field: "goalId", message: "Goal not found (INV-EVT-03)" }]))).toBe("gone");
  });

  it("leaves other validation, duplicate ids and unknown errors to the screen", () => {
    expect(actionFailureCause(new ValidationError([
      { field: "categoryId", message: "Category not found (INV-EVT-03)" },
      { field: "name", message: "Budget name is required" },
    ]))).toBe("other");
    expect(actionFailureCause(new ValidationError([]))).toBe("other");
    expect(actionFailureCause(new AppendEventError("DUPLICATE_ID", "e1", "exists"))).toBe("other");
    expect(actionFailureCause(new Error("boom"))).toBe("other");
    expect(actionFailureCause("boom")).toBe("other");
  });
});

describe("actionFailureMessage", () => {
  it("gives the shared message for a known cause and the screen's message otherwise", () => {
    expect(actionFailureMessage(t, new AppendEventError("STALE_SNAPSHOT", "e1", "changed"), "budgets.errors.failed"))
      .toBe("[actionFailure.changedMeanwhile]");
    expect(actionFailureMessage(t, new ValidationError([{ field: "budgetId", message: "Budget not found (INV-EVT-03)" }]), "budgets.errors.archiveFailed"))
      .toBe("[actionFailure.gone]");
    expect(actionFailureMessage(t, new AppendEventError("WRITE_FAILED", "e1", "write"), "goals.errors.failed"))
      .toBe("[actionFailure.storage]");
    expect(actionFailureMessage(t, new Error("boom"), "goals.errors.failed")).toBe("[goals.errors.failed]");
  });
});

describe("hasValidationMessage", () => {
  it("matches a domain refusal by its constant", () => {
    const refusal = new ValidationError([{ field: "categoryId", message: REFUSAL.categoryUsedByBudget }]);
    expect(hasValidationMessage(refusal, REFUSAL.categoryUsedByBudget)).toBe(true);
    expect(hasValidationMessage(refusal, REFUSAL.categoryHasChildren)).toBe(false);
    expect(hasValidationMessage(new Error(REFUSAL.categoryUsedByBudget), REFUSAL.categoryUsedByBudget)).toBe(false);
  });

  it("sees the subclass AccountNotEmptyError as a validation error", () => {
    expect(new AccountNotEmptyError()).toBeInstanceOf(ValidationError);
  });
});
