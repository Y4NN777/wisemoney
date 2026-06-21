import type { FinancialEventRecord } from "@/db/schema.ts";
import type { MasterKey } from "@/crypto/envelope.ts";
import { seal } from "@/crypto/envelope.ts";
import { db } from "@/db/schema.ts";
import Dexie from "dexie";

export type FinancialEventType =
  | "account_created"
  | "transaction_created"
  | "transaction_updated"
  | "transaction_deleted"
  | "category_created"
  | "category_renamed"
  | "budget_created"
  | "budget_archived"
  | "goal_created"
  | "goal_contribution"
  | "goal_archived"
  | "recurring_item_created"
  | "recurring_item_realised";

export type FinancialEventPayload = Record<string, unknown>;

export type AppendEventParams = {
  id: string;
  timestamp: number;
  type: FinancialEventType;
  entityId: string;
  payload: FinancialEventPayload;
  masterKey: MasterKey;
};

export class AppendEventError extends Error {
  readonly code: string;
  readonly eventId: string;

  constructor(code: string, eventId: string, message: string) {
    super(message);
    this.name = "AppendEventError";
    this.code = code;
    this.eventId = eventId;
  }
}

export async function appendEvent(params: AppendEventParams): Promise<void> {
  const plaintext = new TextEncoder().encode(JSON.stringify(params.payload));
  const { ciphertext, iv } = await seal(plaintext, params.masterKey);

  try {
    await db.financialEvents.add({
      id: params.id,
      timestamp: params.timestamp,
      type: params.type,
      entityId: params.entityId,
      ciphertext,
      iv,
    });
  } catch (err: unknown) {
    if (
      err instanceof Dexie.ConstraintError ||
      (err instanceof Error && err.name === "ConstraintError")
    ) {
      throw new AppendEventError(
        "DUPLICATE_ID",
        params.id,
        `Event with id ${params.id} already exists`
      );
    }
    throw new AppendEventError(
      "WRITE_FAILED",
      params.id,
      `Failed to append event: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

export async function readAllEvents(): Promise<FinancialEventRecord[]> {
  return db.financialEvents.orderBy("timestamp").toArray();
}

export async function readEventsSince(
  afterEventId: string
): Promise<FinancialEventRecord[]> {
  const after = await db.financialEvents.get(afterEventId);
  if (!after) {
    return db.financialEvents.orderBy("timestamp").toArray();
  }

  const events = await db.financialEvents
    .where("timestamp")
    .above(after.timestamp)
    .toArray();

  const sameMsEvents = await db.financialEvents
    .where("timestamp")
    .equals(after.timestamp)
    .toArray();

  const filtered = sameMsEvents.filter((e) => e.id !== afterEventId);
  filtered.sort((a, b) => a.id.localeCompare(b.id));

  return [...filtered, ...events];
}
