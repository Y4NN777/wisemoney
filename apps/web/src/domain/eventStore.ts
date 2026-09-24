import type { FinancialEventRecord } from "@/db/schema.ts";
import type { MasterKey } from "@/crypto/envelope.ts";
import { seal } from "@/crypto/envelope.ts";
import { db } from "@/db/schema.ts";
import Dexie from "dexie";
import { validateFinancialEventPayload } from "./eventPayload.ts";

const FINANCIAL_EVENT_TYPES = [
  "account_created",
  "account_updated",
  "account_archived",
  "transaction_created",
  "transaction_updated",
  "transaction_deleted",
  "category_created",
  "category_renamed",
  "category_archived",
  "budget_created",
  "budget_archived",
  "goal_created",
  "goal_contribution",
  "goal_archived",
  "recurring_item_created",
  "recurring_item_archived",
  "recurring_item_realised",
  "transfer_created",
  "debt_credit_created",
  "debt_credit_status_updated",
  "debt_credit_due_date_updated",
  "planned_expense_created",
  "planned_expense_updated",
  "planned_expense_cancelled",
  "planned_expense_completed",
] as const;

export type FinancialEventType = (typeof FINANCIAL_EVENT_TYPES)[number];

export function isFinancialEventType(value: unknown): value is FinancialEventType {
  return typeof value === "string" &&
    (FINANCIAL_EVENT_TYPES as readonly string[]).includes(value);
}

export type FinancialEventPayload = Record<string, unknown>;

type AppendEventParams = {
  id: string;
  timestamp: number;
  type: FinancialEventType;
  entityId: string;
  payload: FinancialEventPayload;
  masterKey: MasterKey;
  expectedLastEventId?: string;
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

async function assertExpectedLastEvent(expectedLastEventId?: string): Promise<void> {
  if (expectedLastEventId == null) return;
  const lastByTimestamp = await db.financialEvents.orderBy("timestamp").last();
  let actualLastEventId = "none";
  if (lastByTimestamp != null) {
    const events = await db.financialEvents
      .where("timestamp")
      .equals(lastByTimestamp.timestamp)
      .toArray();
    actualLastEventId = events.sort(compareFinancialEvents).at(-1)?.id ?? "none";
  }
  if (actualLastEventId !== expectedLastEventId) {
    throw new AppendEventError(
      "STALE_SNAPSHOT",
      expectedLastEventId,
      "Financial data changed while this action was being validated; retry the action"
    );
  }
}

/**
 * Shift each record forward until its timestamp is unique in the journal and within the batch.
 * One keys-only index read replaces a per-candidate `where("timestamp").equals()` query, which
 * made a restore or import cost one round-trip per event (N+1). Reading every occupied
 * timestamp from the earliest candidate onward is exact: a collision can only push a record
 * forward, so no timestamp below `minTimestamp` can ever be assigned.
 */
async function resolveFreeTimestamps<T extends { timestamp: number }>(records: readonly T[]): Promise<T[]> {
  const minTimestamp = Math.min(...records.map((record) => record.timestamp));
  const occupied = new Set<number>(
    (await db.financialEvents.where("timestamp").aboveOrEqual(minTimestamp).keys()) as number[],
  );
  return records.map((record) => {
    let timestamp = record.timestamp;
    while (occupied.has(timestamp)) timestamp++;
    occupied.add(timestamp);
    return { ...record, timestamp };
  });
}

export async function appendEvent(params: AppendEventParams): Promise<void> {
  validateFinancialEventPayload(params.type, params.payload);
  const plaintext = new TextEncoder().encode(JSON.stringify(params.payload));
  let ciphertext: Uint8Array;
  let iv: Uint8Array;
  try {
    ({ ciphertext, iv } = await seal(plaintext, params.masterKey));
  } finally {
    plaintext.fill(0);
  }

  try {
    await db.transaction("rw", db.financialEvents, async () => {
      await assertExpectedLastEvent(params.expectedLastEventId);
      const [record] = await resolveFreeTimestamps([{
        id: params.id,
        timestamp: params.timestamp,
        type: params.type,
        entityId: params.entityId,
        ciphertext,
        iv,
      }]);
      await db.financialEvents.add(record!);
    });
  } catch (err: unknown) {
    if (err instanceof AppendEventError) throw err;
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

export async function appendEvents(params: readonly AppendEventParams[]): Promise<void> {
  if (params.length === 0) return;

  for (const event of params) validateFinancialEventPayload(event.type, event.payload);

  const sealed = await Promise.all(params.map(async (event) => {
    const plaintext = new TextEncoder().encode(JSON.stringify(event.payload));
    try {
      const { ciphertext, iv } = await seal(plaintext, event.masterKey);
      return {
        id: event.id,
        timestamp: event.timestamp,
        type: event.type,
        entityId: event.entityId,
        ciphertext,
        iv,
      };
    } finally {
      plaintext.fill(0);
    }
  }));

  try {
    await db.transaction("rw", db.financialEvents, async () => {
      const expectedIds = new Set(params.map((event) => event.expectedLastEventId ?? null));
      if (expectedIds.size > 1) {
        throw new AppendEventError("STALE_SNAPSHOT", params[0]!.id, "Events do not share the same validated snapshot");
      }
      await assertExpectedLastEvent(expectedIds.values().next().value ?? undefined);
      await db.financialEvents.bulkAdd(await resolveFreeTimestamps(sealed));
    });
  } catch (err: unknown) {
    if (err instanceof AppendEventError) throw err;
    const isConstraintFailure =
      err instanceof Dexie.ConstraintError ||
      (err instanceof Error && (err.name === "ConstraintError" || err.name === "BulkError"));
    throw new AppendEventError(
      isConstraintFailure ? "DUPLICATE_ID" : "WRITE_FAILED",
      params[0]!.id,
      isConstraintFailure
        ? "One or more event ids already exist"
        : `Failed to append events: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

type ReplacementFxRate = {
  id: string;
  baseCurrency: string;
  quoteCurrency: string;
  rate: string;
  lastUpdated: number;
  masterKey: MasterKey;
};

type ReplacementAppSetting = {
  id: string;
  value: string;
  masterKey: MasterKey;
};

export async function replaceAllEvents(
  params: readonly AppendEventParams[],
  fxRates?: readonly ReplacementFxRate[],
  appSetting?: ReplacementAppSetting,
): Promise<void> {
  for (const event of params) validateFinancialEventPayload(event.type, event.payload);
  const records = await Promise.all(params.map(async (event) => {
    const plaintext = new TextEncoder().encode(JSON.stringify(event.payload));
    try {
      const { ciphertext, iv } = await seal(plaintext, event.masterKey);
      return {
        id: event.id,
        timestamp: event.timestamp,
        type: event.type,
        entityId: event.entityId,
        ciphertext,
        iv,
      };
    } finally {
      plaintext.fill(0);
    }
  }));
  const rateRecords = fxRates == null ? null : await Promise.all(fxRates.map(async (rate) => {
    const plaintext = new TextEncoder().encode(rate.rate);
    try {
      const { ciphertext, iv } = await seal(plaintext, rate.masterKey);
      return {
        id: rate.id,
        baseCurrency: rate.baseCurrency,
        quoteCurrency: rate.quoteCurrency,
        lastUpdated: rate.lastUpdated,
        ciphertext,
        iv,
      };
    } finally {
      plaintext.fill(0);
    }
  }));
  let settingRecord: { id: string; ciphertext: Uint8Array; iv: Uint8Array } | null = null;
  if (appSetting != null) {
    const plaintext = new TextEncoder().encode(appSetting.value);
    try {
      const { ciphertext, iv } = await seal(plaintext, appSetting.masterKey);
      settingRecord = { id: appSetting.id, ciphertext, iv };
    } finally {
      plaintext.fill(0);
    }
  }
  const dataTables = [
    db.financialEvents,
    db.financialStateSnapshot,
    ...(rateRecords == null ? [] : [db.fxRates]),
    ...(settingRecord == null ? [] : [db.appSettings]),
  ];

  await db.transaction("rw", dataTables, async () => {
    await db.financialEvents.clear();
    await db.financialStateSnapshot.clear();
    if (rateRecords != null) await db.fxRates.clear();
    if (settingRecord != null) await db.appSettings.clear();
    if (records.length > 0) await db.financialEvents.bulkAdd(records);
    if (rateRecords != null && rateRecords.length > 0) await db.fxRates.bulkAdd(rateRecords);
    if (settingRecord != null) await db.appSettings.add(settingRecord);
  });
}

export async function readAllEvents(): Promise<FinancialEventRecord[]> {
  const events = await db.financialEvents.orderBy("timestamp").toArray();
  return events.sort(compareFinancialEvents);
}

export function compareFinancialEvents(
  a: Pick<FinancialEventRecord, "id" | "timestamp">,
  b: Pick<FinancialEventRecord, "id" | "timestamp">
): number {
  return a.timestamp - b.timestamp || a.id.localeCompare(b.id);
}

export async function readEventsSince(
  afterEventId: string
): Promise<FinancialEventRecord[]> {
  const after = await db.financialEvents.get(afterEventId);
  if (!after) {
    return readAllEvents();
  }

  const events = await db.financialEvents
    .where("timestamp")
    .above(after.timestamp)
    .toArray();

  const sameMsEvents = await db.financialEvents
    .where("timestamp")
    .equals(after.timestamp)
    .toArray();

  const filtered = sameMsEvents.filter((event) => event.id.localeCompare(afterEventId) > 0);

  return [...filtered, ...events].sort(compareFinancialEvents);
}
