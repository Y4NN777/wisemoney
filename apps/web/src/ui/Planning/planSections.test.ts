import { describe, expect, it } from "vitest";
import type { FinancialStateSnapshot } from "../../domain/financialState.ts";
import { PLAN_SECTION_ORDER, isPlanSectionEmpty, selectPlanSections, type PlanSection } from "./planSections.ts";

const xof = (minorUnits: number) => ({ minorUnits, currency: "XOF" });

function snapshot(overrides: Partial<FinancialStateSnapshot> = {}): FinancialStateSnapshot {
  return {
    budgets: [], goals: [], plannedExpenses: [], recurringItems: [], debtCredits: [],
    budgetProgress: {}, goalProgress: {},
    ...overrides,
  } as unknown as FinancialStateSnapshot;
}

describe("selectPlanSections", () => {
  it("keeps the hub order and reports every section, empty or not", () => {
    const sections = selectPlanSections(snapshot());
    expect(sections.map((section) => section.id)).toEqual([...PLAN_SECTION_ORDER]);
    expect(sections.every(isPlanSectionEmpty)).toBe(true);
    expect(sections.map((section) => section.to)).toEqual(["/budgets", "/goals", "/planned-expenses", "/recurring", "/debts"]);
  });

  it("applies the same active predicates the hub counted with", () => {
    const sections = selectPlanSections(snapshot({
      budgets: [
        { id: "b1", name: "Food", categoryId: "c", limit: xof(500), periodMonth: "2026-09", isArchived: false, spent: xof(120) },
        { id: "b2", name: "Old", categoryId: "c", limit: xof(1), periodMonth: "2026-01", isArchived: true, spent: xof(0) },
      ],
      goals: [
        { id: "g1", name: "Bike", targetAmount: xof(1000), targetDate: 5, isArchived: false, accumulated: xof(250) },
        { id: "g2", name: "Done", targetAmount: xof(1), targetDate: null, isArchived: true, accumulated: xof(1) },
      ],
      plannedExpenses: [
        { id: "p1", label: "Rent", estimatedAmount: xof(300), dueDate: 9, status: "pending" },
        { id: "p2", label: "Paid", estimatedAmount: xof(300), dueDate: 9, status: "completed" },
        { id: "p3", label: "Dropped", estimatedAmount: xof(300), dueDate: 9, status: "cancelled" },
      ],
      recurringItems: [
        { id: "r1", label: "Phone", amount: xof(20), frequency: "monthly", isArchived: false },
        { id: "r2", label: "Gone", amount: xof(20), frequency: "weekly", isArchived: true },
      ],
      debtCredits: [
        { id: "d1", partyName: "Awa", amount: xof(50), dueDate: 3, status: "pending", kind: "debt" },
        { id: "d2", partyName: "Moussa", amount: xof(50), dueDate: null, status: "partial", kind: "receivable" },
        { id: "d3", partyName: "Paid", amount: xof(50), dueDate: null, status: "settled", kind: "debt" },
      ],
      budgetProgress: { b1: { limit: xof(500), spent: xof(200), percentage: 40 } },
      goalProgress: { g1: { target: xof(1000), accumulated: xof(400), percentage: 40 } },
    } as unknown as Partial<FinancialStateSnapshot>));
    const section = (id: PlanSection["id"]): PlanSection => sections.find((candidate) => candidate.id === id)!;
    const byId = { budgets: section("budgets"), goals: section("goals"), plannedExpenses: section("plannedExpenses"), recurring: section("recurring"), debts: section("debts") };
    expect(byId.budgets.count).toBe(1);
    expect(byId.budgets.rows.at(0)).toMatchObject({ label: "Food", amount: xof(200), secondary: xof(500) });
    expect(byId.goals.rows.at(0)).toMatchObject({ label: "Bike", amount: xof(400), secondary: xof(1000), dueAt: 5 });
    expect(byId.plannedExpenses.count).toBe(1);
    expect(byId.plannedExpenses.rows.at(0)).toMatchObject({ label: "Rent", amount: xof(300), dueAt: 9 });
    expect(byId.recurring.rows.at(0)).toMatchObject({ label: "Phone", detailKey: "planning.frequency.monthly" });
    expect(byId.debts.count).toBe(2);
    expect(byId.debts.rows.map((row) => row.label)).toEqual(["Awa", "Moussa"]);
    expect(byId.debts.rows.at(0)).toMatchObject({ detailKey: "planning.debtKinds.debt", dueAt: 3 });
  });

  it("caps rows but counts everything", () => {
    const debtCredits = Array.from({ length: 7 }, (_, index) => ({ id: `d${index}`, partyName: `P${index}`, amount: xof(1), dueDate: null, status: "pending", kind: "debt" }));
    const debts = selectPlanSections(snapshot({ debtCredits } as unknown as Partial<FinancialStateSnapshot>), 2).find((candidate) => candidate.id === "debts")!;
    expect(debts.count).toBe(7);
    expect(debts.rows).toHaveLength(2);
    expect(isPlanSectionEmpty(debts)).toBe(false);
  });
});
