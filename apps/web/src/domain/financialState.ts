/**
 * FinancialState Engine — replay + snapshot management.
 *
 * INV-EVT-02: replay is authoritative; the cached snapshot is an optimisation.
 * If asOfEventId does not match the last event in financialEvents, replay from
 * inception before serving any reads.
 *
 * NFR-MOD-01: this module has ZERO dependency on Intelligence, Literacy, or
 * AIOrchestrClient. AI-layer failure must not affect this module.
 *
 * data-model.md §A.2 financialStateSnapshot.
 */

import type { MasterKey } from "@/crypto/envelope.ts";
import type { FinancialEventRecord } from "@/db/schema.ts";

/**
 * The derived financial state at a point in time.
 *
 * All Money fields use integer minor units (INV-MON-01).
 * Stored in financialStateSnapshot.ciphertext as a serialised JSON blob.
 *
 * TODO (FR-FS): flesh out the full snapshot shape as features are implemented:
 * totalBalance, periodIncome, periodExpenses, netCashFlow, categoryTotals,
 * budgetProgress, goalProgress, projectedRecurring.
 */
export type FinancialStateSnapshot = {
  asOfEventId: string;
  asOfTimestamp: number;
  // TODO: add Money fields for balances, period totals, category breakdowns, etc.
  // All amounts: { minorUnits: number, currency: string } — no floats (INV-MON-01)
};

/**
 * Replay the full event log into a FinancialStateSnapshot.
 *
 * TODO (INV-EVT-02, FR-FS): implement the fold:
 * - Sort events by timestamp ascending (already ordered from readAllEvents).
 * - Decrypt each event payload via open(envelope, masterKey).
 * - Apply each event to the accumulator state.
 * - Return the final snapshot.
 *
 * INV-EVT-04: goal accumulated amount derives ONLY from goal_contribution events.
 * INV-EVT-05: recurring occurrences are projected in memory — never written to log.
 * INV-EVT-03: referential integrity (accountId, categoryId) is validated at
 *   append time, not here; replay trusts the log is internally consistent.
 */
export async function replayFromInception(
  _events: FinancialEventRecord[],
  _masterKey: MasterKey
): Promise<FinancialStateSnapshot> {
  // TODO: implement full replay fold
  throw new Error("replayFromInception: not yet implemented");
}

/**
 * Apply a single new event to an existing snapshot (incremental update path).
 *
 * Used when a new event is appended and the cache is current (fast path).
 *
 * TODO (INV-EVT-02): implement incremental fold; if the event type cannot be
 * applied incrementally, fall back to replayFromInception.
 */
export async function applyEventToSnapshot(
  _current: FinancialStateSnapshot,
  _event: FinancialEventRecord,
  _masterKey: MasterKey
): Promise<FinancialStateSnapshot> {
  // TODO: implement incremental apply
  throw new Error("applyEventToSnapshot: not yet implemented");
}

/**
 * Check whether the cached snapshot is fresh relative to the event log tail.
 *
 * Returns true if asOfEventId matches the last event id in the log.
 * If false, the caller must trigger a full replay before serving reads (INV-EVT-02).
 *
 * DQ-01: individual projection stores have no equivalent guard — this is an open
 * implementation item that must be resolved before the engine is implemented.
 */
export async function isSnapshotFresh(
  _snapshot: FinancialStateSnapshot
): Promise<boolean> {
  // TODO: compare snapshot.asOfEventId against db.financialEvents.orderBy("timestamp").last()
  throw new Error("isSnapshotFresh: not yet implemented");
}

/**
 * Load the cached snapshot from IndexedDB, or trigger replay if stale/absent.
 *
 * This is the primary read path for UI surfaces (Dashboard).
 * Returns a fresh FinancialStateSnapshot in all cases.
 *
 * TODO (INV-EVT-02):
 * - Read financialStateSnapshot["current"].
 * - If absent or stale (isSnapshotFresh returns false), run replayFromInception.
 * - Persist the freshly-derived snapshot back to financialStateSnapshot.
 * - Return the snapshot.
 */
export async function getSnapshot(
  _masterKey: MasterKey
): Promise<FinancialStateSnapshot> {
  // TODO: implement cache-or-replay logic
  throw new Error("getSnapshot: not yet implemented");
}

/**
 * Persist a derived snapshot to the financialStateSnapshot store.
 *
 * TODO (INV-PERS-02): serialise the snapshot, seal it, write via db.financialStateSnapshot.put().
 */
export async function persistSnapshot(
  _snapshot: FinancialStateSnapshot,
  _masterKey: MasterKey
): Promise<void> {
  // TODO: implement
  throw new Error("persistSnapshot: not yet implemented");
}
