import type { FinancialStateSnapshot, MoneyDTO } from "../../domain/financialState.ts";

export type PlanSectionId = "budgets" | "goals" | "plannedExpenses" | "recurring" | "debts";

export type PlanRow = {
  id: string;
  label: string;
  amount: MoneyDTO | null;
  /** The reference the amount is measured against (budget limit, goal target); null when there is none. */
  secondary: MoneyDTO | null;
  dueAt: number | null;
  detailKey: string | null;
};

export type PlanSection = {
  id: PlanSectionId;
  to: "/budgets" | "/goals" | "/planned-expenses" | "/recurring" | "/debts";
  count: number;
  rows: PlanRow[];
};

/** Same order as the former hub tiles, so muscle memory and the smoke keep working. */
export const PLAN_SECTION_ORDER: readonly PlanSectionId[] = ["budgets", "goals", "plannedExpenses", "recurring", "debts"];

export const PLAN_ROW_LIMIT = 5;

/**
 * One scrolling Plan page (ux-simplification decision 4): every section from snapshot
 * fields only, with the same "active" predicates the hub used for its counts.
 */
export function selectPlanSections(snapshot: FinancialStateSnapshot, limit = PLAN_ROW_LIMIT): PlanSection[] {
  const budgets = snapshot.budgets.filter((budget) => !budget.isArchived);
  const goals = snapshot.goals.filter((goal) => !goal.isArchived);
  const planned = snapshot.plannedExpenses.filter((item) => item.status === "pending");
  const recurring = snapshot.recurringItems.filter((item) => !item.isArchived);
  const debts = snapshot.debtCredits.filter((item) => item.status !== "settled");

  const sections: Record<PlanSectionId, PlanSection> = {
    budgets: {
      id: "budgets",
      to: "/budgets",
      count: budgets.length,
      rows: budgets.slice(0, limit).map((budget) => ({
        id: budget.id,
        label: budget.name,
        amount: snapshot.budgetProgress[budget.id]?.spent ?? budget.spent,
        secondary: budget.limit,
        dueAt: null,
        detailKey: null,
      })),
    },
    goals: {
      id: "goals",
      to: "/goals",
      count: goals.length,
      rows: goals.slice(0, limit).map((goal) => ({
        id: goal.id,
        label: goal.name,
        amount: snapshot.goalProgress[goal.id]?.accumulated ?? goal.accumulated,
        secondary: goal.targetAmount,
        dueAt: goal.targetDate,
        detailKey: null,
      })),
    },
    plannedExpenses: {
      id: "plannedExpenses",
      to: "/planned-expenses",
      count: planned.length,
      rows: planned.slice(0, limit).map((item) => ({
        id: item.id,
        label: item.label,
        amount: item.estimatedAmount,
        secondary: null,
        dueAt: item.dueDate,
        detailKey: null,
      })),
    },
    recurring: {
      id: "recurring",
      to: "/recurring",
      count: recurring.length,
      rows: recurring.slice(0, limit).map((item) => ({
        id: item.id,
        label: item.label,
        amount: item.amount,
        secondary: null,
        dueAt: null,
        detailKey: `planning.frequency.${item.frequency}`,
      })),
    },
    debts: {
      id: "debts",
      to: "/debts",
      count: debts.length,
      rows: debts.slice(0, limit).map((item) => ({
        id: item.id,
        label: item.partyName,
        amount: item.amount,
        secondary: null,
        dueAt: item.dueDate,
        detailKey: `planning.debtKinds.${item.kind}`,
      })),
    },
  };
  return PLAN_SECTION_ORDER.map((id) => sections[id]);
}

export function isPlanSectionEmpty(section: PlanSection): boolean {
  return section.count === 0;
}
