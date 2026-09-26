import { describe, expect, it, vi } from "vitest";
vi.mock("../db/schema.ts", () => ({ db: { appSettings: { get: vi.fn(), put: vi.fn() } } }));
import { FIRST_SESSION_STEPS, isAccountsStepDone, isPlanStepDone, selectFirstSessionStep } from "./firstSession.ts";

const empty = { accounts: [], budgets: [], goals: [], plannedExpenses: [], recurringItems: [], debtCredits: [] } as never;
const withAccounts = (...names: string[]) => ({ ...(empty as object), accounts: names.map((name) => ({ id: name, name, isActive: true })) }) as never;
const defaults = ["Cash", "Espèces"];

describe("first session steps", () => {
  it("orders the four steps", () => {
    expect([...FIRST_SESSION_STEPS]).toEqual(["accounts", "movement", "plan", "tour"]);
  });

  it("starts at accounts for a fresh space with only the default account", () => {
    expect(selectFirstSessionStep({ snapshot: withAccounts("Espèces"), hasMovement: false, state: null, defaultAccountNames: defaults })).toBe("accounts");
  });

  it("moves to the movement, then the plan, then the tour as data appears", () => {
    const named = withAccounts("Orange Money");
    expect(selectFirstSessionStep({ snapshot: named, hasMovement: false, state: { completed: false, planLater: false }, defaultAccountNames: defaults })).toBe("movement");
    expect(selectFirstSessionStep({ snapshot: named, hasMovement: true, state: { completed: false, planLater: false }, defaultAccountNames: defaults })).toBe("plan");
    expect(selectFirstSessionStep({ snapshot: named, hasMovement: true, state: { completed: false, planLater: true }, defaultAccountNames: defaults })).toBe("tour");
    expect(selectFirstSessionStep({ snapshot: { ...(named as object), goals: [{ isArchived: false }] } as never, hasMovement: true, state: { completed: false, planLater: false }, defaultAccountNames: defaults })).toBe("tour");
  });

  it("is done once completed, and never forces a space that already has movements and no state", () => {
    expect(selectFirstSessionStep({ snapshot: withAccounts("Cash"), hasMovement: true, state: { completed: true, planLater: false }, defaultAccountNames: defaults })).toBe("done");
    expect(selectFirstSessionStep({ snapshot: withAccounts("Cash"), hasMovement: true, state: null, defaultAccountNames: defaults })).toBe("done");
  });

  it("counts accounts as done on rename or a second account, in any locale", () => {
    expect(isAccountsStepDone(withAccounts("Cash"), defaults)).toBe(false);
    expect(isAccountsStepDone(withAccounts("Espèces"), defaults)).toBe(false);
    expect(isAccountsStepDone(withAccounts("Banque"), defaults)).toBe(true);
    expect(isAccountsStepDone(withAccounts("Cash", "Savings"), defaults)).toBe(true);
  });

  it("counts any live planning item as a plan", () => {
    expect(isPlanStepDone(empty)).toBe(false);
    expect(isPlanStepDone({ ...(empty as object), budgets: [{ isArchived: true }] } as never)).toBe(false);
    expect(isPlanStepDone({ ...(empty as object), plannedExpenses: [{ status: "pending" }] } as never)).toBe(true);
  });
});
