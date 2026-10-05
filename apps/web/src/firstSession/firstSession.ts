import { db } from "../db/schema.ts";
import { open, seal, type MasterKey } from "../crypto/envelope.ts";
import type { FinancialStateSnapshot } from "../domain/financialState.ts";

/**
 * The first session is a required, task-shaped flow (docs/plans/first-session-wisebot-literacy.md,
 * track 1): Home stays a stepper until the space has a first movement and either a plan or an
 * explicit "later". The account step only asks to confirm the currency and the account made at
 * setup: the defaults are accepted as they are (UX audit 2026-10). What was done is derived from
 * the data itself; only "completed" and "planLater" are stored, encrypted with the rest of the
 * settings so a backup restores them.
 */
export type FirstSessionState = { completed: boolean; planLater: boolean };
export type FirstSessionStep = "accounts" | "movement" | "plan" | "done";

export const FIRST_SESSION_STEPS: readonly Exclude<FirstSessionStep, "done">[] = ["accounts", "movement", "plan"];
const SETTING_ID = "firstSession";

export async function loadFirstSessionState(masterKey: MasterKey): Promise<FirstSessionState | null> {
  const record = await db.appSettings.get(SETTING_ID);
  if (record == null) return null;
  const plaintext = await open({ ciphertext: record.ciphertext, iv: record.iv }, masterKey);
  try {
    const parsed = JSON.parse(new TextDecoder().decode(plaintext)) as Partial<FirstSessionState>;
    return { completed: parsed.completed === true, planLater: parsed.planLater === true };
  } finally {
    plaintext.fill(0);
  }
}

export async function saveFirstSessionState(state: FirstSessionState, masterKey: MasterKey): Promise<void> {
  const plaintext = new TextEncoder().encode(JSON.stringify(state));
  let envelope;
  try {
    envelope = await seal(plaintext, masterKey);
  } finally {
    plaintext.fill(0);
  }
  await db.appSettings.put({ id: SETTING_ID, ciphertext: envelope.ciphertext, iv: envelope.iv });
}

type SnapshotSlice = Pick<FinancialStateSnapshot, "accounts" | "budgets" | "goals" | "plannedExpenses" | "recurringItems" | "debtCredits">;

/** True once the default account is renamed or a second active account exists (any locale's default name). */
export function isAccountsCustomised(snapshot: SnapshotSlice, defaultAccountNames: readonly string[]): boolean {
  const active = snapshot.accounts.filter((account) => account.isActive);
  return active.length > 1 || active.some((account) => !defaultAccountNames.includes(account.name));
}

export function isPlanStepDone(snapshot: SnapshotSlice): boolean {
  return (
    snapshot.budgets.some((item) => !item.isArchived) ||
    snapshot.goals.some((item) => !item.isArchived) ||
    snapshot.plannedExpenses.some((item) => item.status === "pending") ||
    snapshot.recurringItems.some((item) => !item.isArchived) ||
    snapshot.debtCredits.some((item) => item.status !== "settled")
  );
}

/**
 * Which step the data says is next. A space with no stored state but with movements already in it
 * (an existing user after this update, or a restored backup) is never forced through the flow.
 * The plan step stays current until "completed" is stored, so its result can be shown first.
 */
export function selectFirstSessionStep(input: {
  snapshot: SnapshotSlice;
  hasMovement: boolean;
  state: FirstSessionState | null;
}): FirstSessionStep {
  if (input.state?.completed === true) return "done";
  if (input.state == null && input.hasMovement) return "done";
  if (!input.hasMovement) return "movement";
  return "plan";
}

/**
 * Where the flow opens. While no movement exists it opens on the account step, because the
 * currency can only be corrected before the first movement; afterwards on the step the data names.
 */
export function firstSessionEntryStep(derived: Exclude<FirstSessionStep, "done">): Exclude<FirstSessionStep, "done"> {
  return derived === "movement" ? "accounts" : derived;
}
