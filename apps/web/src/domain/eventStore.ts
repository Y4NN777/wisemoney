/**
 * Event Store — append-only FinancialEvent log.
 *
 * INV-EVT-01: events are append-only and immutable once written.
 * No update or delete path exists on this store.
 *
 * INV-MON-01: Money amounts (minorUnits + currency) live inside the encrypted
 * ciphertext payload — never in plaintext structural fields.
 *
 * INV-EVT-03: entityId is validated at append time against the projection stores.
 * This validation is the caller's responsibility (FinancialStateModule); the
 * EventStore only writes — it does not re-validate.
 *
 * data-model.md §A.2 financialEvents.
 */

import type { FinancialEventRecord } from "@/db/schema.ts";
import type { MasterKey } from "@/crypto/envelope.ts";

/** Discriminated union of all event types — expand as FR-FS evolves. */
export type FinancialEventType =
  | "account_created"
  | "transaction_created"
  | "transaction_updated"  // edits are new events (INV-EVT-01)
  | "transaction_deleted"  // deletes are new events (INV-EVT-01)
  | "category_created"
  | "category_renamed"
  | "budget_created"
  | "budget_archived"
  | "goal_created"
  | "goal_contribution"    // sole driver of accumulated amount (INV-EVT-04)
  | "goal_archived"
  | "recurring_item_created"
  | "recurring_item_realised"; // user explicitly realises an occurrence (INV-EVT-05)

/**
 * The payload carried inside the AES-GCM ciphertext for each event.
 *
 * TODO (FR-FS): define precise payload shapes per event type.
 * All Money fields must be { minorUnits: integer, currency: string } (INV-MON-01).
 */
export type FinancialEventPayload = Record<string, unknown>;

/** Parameters for appending a new event. */
export type AppendEventParams = {
  id: string;               // caller-generated UUID
  timestamp: number;        // Unix ms UTC
  type: FinancialEventType;
  entityId: string;         // primary referenced entity (account, category, goal, …)
  payload: FinancialEventPayload;
  masterKey: MasterKey;
};

/**
 * Append a single FinancialEvent to the store.
 *
 * This is the ONLY write path on financialEvents. No update or delete path
 * exists anywhere in the codebase (INV-EVT-01).
 *
 * TODO (INV-EVT-01, INV-PERS-02):
 * - Serialise payload to UTF-8 JSON.
 * - Call seal(plaintext, masterKey) to produce { ciphertext, iv }.
 * - Write the record to db.financialEvents via Dexie.add() (not put/update).
 * - Throw AppendEventError if Dexie reports a constraint violation (duplicate id).
 */
export function appendEvent(_params: AppendEventParams): Promise<void> {
  // TODO: implement sealed append
  return Promise.reject(new Error("appendEvent: not yet implemented"));
}

/**
 * Read all events in timestamp-ascending order.
 *
 * This is the replay path (INV-EVT-02). Decryption happens in the FinancialState
 * Engine — the store layer returns raw encrypted records.
 *
 * TODO: return db.financialEvents.orderBy("timestamp").toArray()
 */
export function readAllEvents(): Promise<FinancialEventRecord[]> {
  // TODO: implement
  return Promise.reject(new Error("readAllEvents: not yet implemented"));
}

/**
 * Read all events after (exclusive) a given eventId.
 *
 * Used for incremental snapshot updates after a known replay point.
 *
 * TODO (INV-EVT-02): query by timestamp > snapshot.asOfTimestamp, then filter
 * to events with id !== asOfEventId (in case of same-ms events).
 */
export function readEventsSince(
  _afterEventId: string
): Promise<FinancialEventRecord[]> {
  // TODO: implement
  return Promise.reject(new Error("readEventsSince: not yet implemented"));
}
