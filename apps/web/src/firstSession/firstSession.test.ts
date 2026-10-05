import { describe, expect, it, vi } from "vitest";
vi.mock("../db/schema.ts", () => ({ db: { appSettings: { get: vi.fn(), put: vi.fn() } } }));
import { FIRST_SESSION_STEPS, firstSessionEntryStep, isAccountsCustomised, isPlanStepDone, selectFirstSessionStep } from "./firstSession.ts";

const empty = { accounts: [], budgets: [], goals: [], plannedExpenses: [], recurringItems: [], debtCredits: [] } as never;
const withAccounts = (...names: string[]) => ({ ...(empty as object), accounts: names.map((name) => ({ id: name, name, isActive: true })) }) as never;
const defaults = ["Cash", "Espèces"];

describe("first session steps", () => {
  it("orders the three steps", () => {
    expect([...FIRST_SESSION_STEPS]).toEqual(["accounts", "movement", "plan"]);
  });

  it("never blocks on the default account: a fresh space is waiting for its first movement", () => {
    expect(selectFirstSessionStep({ snapshot: withAccounts("Espèces"), hasMovement: false, state: { completed: false, planLater: false } })).toBe("movement");
  });

  it("opens on the account step until a movement exists, then where the data says", () => {
    expect(firstSessionEntryStep("movement")).toBe("accounts");
    expect(firstSessionEntryStep("plan")).toBe("plan");
  });

  it("stays on the plan step after the first movement until completion is stored", () => {
    const named = withAccounts("Orange Money");
    expect(selectFirstSessionStep({ snapshot: named, hasMovement: true, state: { completed: false, planLater: false } })).toBe("plan");
    expect(selectFirstSessionStep({ snapshot: named, hasMovement: true, state: { completed: false, planLater: true } })).toBe("plan");
    expect(selectFirstSessionStep({ snapshot: { ...(named as object), goals: [{ isArchived: false }] } as never, hasMovement: true, state: { completed: false, planLater: false } })).toBe("plan");
  });

  it("is done once completed, and never forces a space that already has movements and no state", () => {
    expect(selectFirstSessionStep({ snapshot: withAccounts("Cash"), hasMovement: true, state: { completed: true, planLater: false } })).toBe("done");
    expect(selectFirstSessionStep({ snapshot: withAccounts("Cash"), hasMovement: true, state: null })).toBe("done");
  });

  it("sees a renamed or a second account as customised, in any locale", () => {
    expect(isAccountsCustomised(withAccounts("Cash"), defaults)).toBe(false);
    expect(isAccountsCustomised(withAccounts("Espèces"), defaults)).toBe(false);
    expect(isAccountsCustomised(withAccounts("Banque"), defaults)).toBe(true);
    expect(isAccountsCustomised(withAccounts("Cash", "Savings"), defaults)).toBe(true);
  });

  it("counts any live planning item as a plan", () => {
    expect(isPlanStepDone(empty)).toBe(false);
    expect(isPlanStepDone({ ...(empty as object), budgets: [{ isArchived: true }] } as never)).toBe(false);
    expect(isPlanStepDone({ ...(empty as object), plannedExpenses: [{ status: "pending" }] } as never)).toBe(true);
  });
});
