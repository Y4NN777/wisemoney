import type { FinancialStateSnapshot } from "../../domain/financialState.ts";

export type FirstStepId = "firstMovement" | "accounts" | "plan";
export type FirstStep = { id: FirstStepId; done: boolean };

const STORAGE_KEY = "wisemoney.firstSteps.v1";

/**
 * The three things a new user needs to have done to stop feeling lost (onboarding-rethink
 * decision 2). Each reads real state, never a flag: a step un-ticks itself if the state goes.
 * `defaultAccountNames` are the silent "Cash" names in every locale, so renaming counts.
 */
export function selectFirstSteps(
  snapshot: Pick<FinancialStateSnapshot, "accounts" | "budgets" | "goals" | "plannedExpenses" | "recurringItems" | "debtCredits">,
  hasMovement: boolean,
  defaultAccountNames: readonly string[],
): FirstStep[] {
  const activeAccounts = snapshot.accounts.filter((account) => account.isActive);
  const accountsDone = activeAccounts.length > 1 || activeAccounts.some((account) => !defaultAccountNames.includes(account.name));
  const planDone =
    snapshot.budgets.some((item) => !item.isArchived) ||
    snapshot.goals.some((item) => !item.isArchived) ||
    snapshot.plannedExpenses.some((item) => item.status === "pending") ||
    snapshot.recurringItems.some((item) => !item.isArchived) ||
    snapshot.debtCredits.some((item) => item.status !== "settled");
  return [
    { id: "firstMovement", done: hasMovement },
    { id: "accounts", done: accountsDone },
    { id: "plan", done: planDone },
  ];
}

export function allFirstStepsDone(steps: readonly FirstStep[]): boolean {
  return steps.every((step) => step.done);
}

export function isFirstStepsDismissed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "dismissed";
  } catch {
    return false;
  }
}

export function dismissFirstSteps(): void {
  try {
    localStorage.setItem(STORAGE_KEY, "dismissed");
  } catch {
    // Storage unavailable: the card simply shows again next time.
  }
}
