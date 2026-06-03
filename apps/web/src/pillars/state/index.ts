/**
 * Financial State pillar — accounts, transactions, categories, budgets, goals,
 * recurring items, timeline.
 *
 * NFR-MOD-01: this pillar has ZERO compile-time or runtime dependency on the
 * Intelligence or Literacy pillars, or on AIOrchestrClient. AI failure must not
 * affect this module.
 *
 * INV-MON-01: all amounts passed through this pillar are integer minor units.
 * Account currency is immutable from creation (ARCHITECTURE §6).
 *
 * INV-EVT-03: referential integrity (accountId, categoryId) is validated at
 * append time within this module before calling appendEvent.
 */

export type { FinancialStateSnapshot } from "@/domain/financialState.ts";
export { getSnapshot } from "@/domain/financialState.ts";

// Re-export append — callers in this pillar use it; AI pillar does not.
export { appendEvent } from "@/domain/eventStore.ts";

/**
 * TODO (FR-FS-01): createAccount — validate currency is ISO-4217, emit
 * account_created event. Currency immutable from creation (ARCHITECTURE §6).
 */

/**
 * TODO (FR-FS-02): recordTransaction — validate accountId + categoryId exist
 * (INV-EVT-03), emit transaction_created event with Money payload (INV-MON-01).
 */

/**
 * TODO (FR-FS-03): createBudget — validate categoryId exists (INV-EVT-03),
 * validate limit is integer minor units (INV-MON-01), emit budget_created event.
 */

/**
 * TODO (FR-FS-04): createGoal — emit goal_created event. targetAmount integer
 * minor units (INV-MON-01). Accumulated total derived from contributions only
 * (INV-EVT-04).
 */

/**
 * TODO (FR-FS-05): recordGoalContribution — emit goal_contribution event.
 * This is the SOLE mechanism that advances a goal's accumulated amount (INV-EVT-04).
 */

/**
 * TODO (FR-FS-06): createRecurringItem — emit recurring_item_created event.
 * Projected occurrences are derived in memory; they NEVER enter the event log
 * until the user explicitly realises them (INV-EVT-05).
 */

/**
 * TODO (FR-FS-07): realiseRecurringOccurrence — emit recurring_item_realised +
 * transaction_created events. The occurrence enters the log only at this point
 * (INV-EVT-05).
 */
