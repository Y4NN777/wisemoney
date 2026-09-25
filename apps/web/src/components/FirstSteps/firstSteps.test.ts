import { describe, expect, it } from "vitest";
import { allFirstStepsDone, selectFirstSteps } from "./firstSteps.ts";

const empty = { accounts: [], budgets: [], goals: [], plannedExpenses: [], recurringItems: [], debtCredits: [] };
const cash = (name: string, isActive = true) => ({ id: name, name, isActive });
const defaults = ["Cash", "Espèces"];

describe("selectFirstSteps", () => {
  it("starts with nothing done", () => {
    const steps = selectFirstSteps(empty, false, defaults);
    expect(steps.map((step) => step.done)).toEqual([false, false, false]);
    expect(allFirstStepsDone(steps)).toBe(false);
  });

  it("ticks the first movement from real state, not a flag", () => {
    expect(selectFirstSteps(empty as never, true, defaults)[0]?.done).toBe(true);
  });

  it("counts accounts as done once one is renamed or a second exists, in any locale", () => {
    expect(selectFirstSteps({ ...empty, accounts: [cash("Cash")] } as never, false, defaults)[1]?.done).toBe(false);
    expect(selectFirstSteps({ ...empty, accounts: [cash("Espèces")] } as never, false, defaults)[1]?.done).toBe(false);
    expect(selectFirstSteps({ ...empty, accounts: [cash("Orange Money")] } as never, false, defaults)[1]?.done).toBe(true);
    expect(selectFirstSteps({ ...empty, accounts: [cash("Cash"), cash("Bank")] } as never, false, defaults)[1]?.done).toBe(true);
    expect(selectFirstSteps({ ...empty, accounts: [cash("Cash"), cash("Old", false)] } as never, false, defaults)[1]?.done).toBe(false);
  });

  it("counts any live planning item as the plan step", () => {
    expect(selectFirstSteps({ ...empty, budgets: [{ isArchived: true }] } as never, false, defaults)[2]?.done).toBe(false);
    expect(selectFirstSteps({ ...empty, goals: [{ isArchived: false }] } as never, false, defaults)[2]?.done).toBe(true);
    expect(selectFirstSteps({ ...empty, debtCredits: [{ status: "settled" }] } as never, false, defaults)[2]?.done).toBe(false);
    expect(selectFirstSteps({ ...empty, plannedExpenses: [{ status: "pending" }] } as never, false, defaults)[2]?.done).toBe(true);
  });

  it("is complete only when all three are done", () => {
    const steps = selectFirstSteps({ ...empty, accounts: [cash("Bank")], goals: [{ isArchived: false }] } as never, true, defaults);
    expect(allFirstStepsDone(steps)).toBe(true);
  });
});
