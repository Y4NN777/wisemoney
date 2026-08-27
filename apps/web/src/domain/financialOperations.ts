import type { MasterKey } from "../crypto/envelope.ts";
import { open } from "../crypto/envelope.ts";
import { db } from "../db/schema.ts";
import type { FinancialEventType } from "./eventStore.ts";
import { compareFinancialEvents, isFinancialEventType } from "./eventStore.ts";
import { convertUsingContext, loadCurrencyContext } from "./currencyStore.ts";
import type { MoneyDTO } from "./financialState.ts";

export type FinancialOperationKind =
  | "income"
  | "expense"
  | "planned_expense"
  | "transfer"
  | "goal_contribution"
  | "recurring_realisation";

export type FinancialOperation = {
  id: string;
  timestamp: number;
  kind: FinancialOperationKind;
  direction: "income" | "expense" | null;
  amount: MoneyDTO | null;
  displayAmount: MoneyDTO | null;
  note: string;
  accountId: string | null;
  toAccountId: string | null;
  externalDestination: string | null;
  categoryId: string | null;
  goalId: string | null;
  recurringItemId: string | null;
};

export type DecodedFinancialEvent = {
  id: string;
  timestamp: number;
  type: FinancialEventType;
  payload: Record<string, unknown>;
};

function money(value: unknown): MoneyDTO | null {
  if (value == null || typeof value !== "object") return null;
  const candidate = value as Partial<MoneyDTO>;
  return Number.isSafeInteger(candidate.minorUnits) && typeof candidate.currency === "string"
    ? { minorUnits: Math.abs(candidate.minorUnits as number), currency: candidate.currency }
    : null;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function validTimestamp(value: unknown, fallback: number): number {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : fallback;
}

/**
 * Replays only the event shapes required by the activity view. This is a read
 * projection: the financial snapshot remains the authoritative state.
 */
export function projectFinancialOperations(events: readonly DecodedFinancialEvent[]): FinancialOperation[] {
  const transactions = new Map<string, FinancialOperation & { tags: string[] }>();
  const other = new Map<string, FinancialOperation>();
  const plannedTransactionIds = new Set<string>();
  const recurringRealisationIds = new Set<string>();
  const recurring = new Map<string, { categoryId: string | null; direction: "income" | "expense"; amount: MoneyDTO | null; label: string }>();

  for (const event of [...events].sort((left, right) => left.timestamp - right.timestamp || left.id.localeCompare(right.id))) {
    const payload = event.payload;
    switch (event.type) {
      case "transaction_created":
      case "transaction_updated": {
        const originalId = event.type === "transaction_updated" ? nullableString(payload.originalEventId) : event.id;
        if (originalId == null) break;
        const existing = transactions.get(originalId);
        if (event.type === "transaction_updated" && existing == null) break;
        const direction = payload.direction === "income" ? "income" : "expense";
        const amount = money(payload.amount);
        if (amount == null) break;
        const tags = Array.isArray(payload.tags) ? payload.tags.filter((tag): tag is string => typeof tag === "string") : [];
        transactions.set(originalId, {
          id: originalId,
          timestamp: existing?.timestamp ?? validTimestamp(payload.occurredAt, event.timestamp),
          kind: direction,
          direction,
          amount,
          displayAmount: null,
          note: text(payload.note),
          accountId: nullableString(payload.accountId),
          toAccountId: null,
          externalDestination: null,
          categoryId: nullableString(payload.categoryId),
          goalId: null,
          recurringItemId: null,
          tags,
        });
        break;
      }
      case "transaction_deleted": {
        const originalId = nullableString(payload.originalEventId);
        if (originalId != null) transactions.delete(originalId);
        break;
      }
      case "transfer_created": {
        const amount = money(payload.amount);
        if (amount == null) break;
        other.set(event.id, {
          id: event.id,
          timestamp: event.timestamp,
          kind: "transfer",
          direction: null,
          amount,
          displayAmount: null,
          note: text(payload.note),
          accountId: nullableString(payload.fromAccountId),
          toAccountId: nullableString(payload.toAccountId),
          externalDestination: nullableString(payload.externalDestination),
          categoryId: null,
          goalId: null,
          recurringItemId: null,
        });
        break;
      }
      case "goal_contribution": {
        const amount = money(payload.amount);
        if (amount == null) break;
        other.set(event.id, {
          id: event.id,
          timestamp: event.timestamp,
          kind: "goal_contribution",
          direction: null,
          amount,
          displayAmount: null,
          note: "",
          accountId: null,
          toAccountId: null,
          externalDestination: null,
          categoryId: null,
          goalId: nullableString(payload.goalId),
          recurringItemId: null,
        });
        break;
      }
      case "recurring_item_created": {
        const id = event.id;
        recurring.set(id, {
          categoryId: nullableString(payload.categoryId),
          direction: payload.direction === "income" ? "income" : "expense",
          amount: money(payload.amount),
          label: text(payload.label),
        });
        break;
      }
      case "recurring_item_realised": {
        const itemId = nullableString(payload.itemId);
        if (itemId == null) break;
        const definition = recurring.get(itemId);
        other.set(event.id, {
          id: event.id,
          timestamp: validTimestamp(payload.date, event.timestamp),
          kind: "recurring_realisation",
          direction: definition?.direction ?? null,
          amount: money(payload.amount) ?? definition?.amount ?? null,
          displayAmount: null,
          note: definition?.label ?? "",
          accountId: null,
          toAccountId: null,
          externalDestination: null,
          categoryId: definition?.categoryId ?? null,
          goalId: null,
          recurringItemId: itemId,
        });
        recurringRealisationIds.add(event.id);
        break;
      }
      case "planned_expense_completed": {
        const transactionId = nullableString(payload.transactionId);
        if (transactionId != null) plannedTransactionIds.add(transactionId);
        break;
      }
      default:
        break;
    }
  }

  const operationTransactions = [...transactions.values()].map(({ tags, ...operation }) => ({
    ...operation,
    kind: plannedTransactionIds.has(operation.id) || tags.includes("planned-expense")
      ? "planned_expense" as const
      : tags.includes("recurring")
        ? "recurring_realisation" as const
        : operation.kind,
  }));
  const unmatchedRecurringRealisations = new Set(recurringRealisationIds);
  for (const transaction of operationTransactions) {
    if (transaction.kind !== "recurring_realisation") continue;
    const match = [...unmatchedRecurringRealisations].find((id) => {
      const realisation = other.get(id);
      return realisation?.timestamp === transaction.timestamp &&
        realisation.amount?.minorUnits === transaction.amount?.minorUnits &&
        realisation.amount?.currency === transaction.amount?.currency;
    });
    if (match != null) unmatchedRecurringRealisations.delete(match);
  }
  const standaloneOther = [...other].filter(
    ([id]) => !recurringRealisationIds.has(id) || unmatchedRecurringRealisations.has(id),
  ).map(([, operation]) => operation);
  return [...operationTransactions, ...standaloneOther]
    .sort((left, right) => right.timestamp - left.timestamp || right.id.localeCompare(left.id));
}

export async function readFinancialOperationsInRange(
  start: number,
  end: number,
  masterKey: MasterKey,
): Promise<FinancialOperation[]> {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start) {
    throw new Error("operation date range is invalid");
  }
  const records = (await db.financialEvents.orderBy("timestamp").toArray()).sort(compareFinancialEvents);
  const decoder = new TextDecoder();
  const decoded: DecodedFinancialEvent[] = [];
  const batchSize = 32;
  for (let offset = 0; offset < records.length; offset += batchSize) {
    const batch = records.slice(offset, offset + batchSize);
    decoded.push(...await Promise.all(batch.map(async (event) => {
      if (!isFinancialEventType(event.type)) throw new Error(`unsupported financial event type: ${event.type}`);
      const plaintext = await open({ ciphertext: event.ciphertext, iv: event.iv }, masterKey);
      try {
        return {
          id: event.id,
          timestamp: event.timestamp,
          type: event.type,
          payload: JSON.parse(decoder.decode(plaintext)) as Record<string, unknown>,
        };
      } finally {
        plaintext.fill(0);
      }
    })));
  }

  const operations = projectFinancialOperations(decoded).filter(
    (operation) => operation.timestamp >= start && operation.timestamp <= end,
  );
  const context = await loadCurrencyContext(masterKey, "");
  const firstCurrency = operations.find((operation) => operation.amount != null)?.amount?.currency;
  const displayCurrency = context.baseCurrency !== "" ? context.baseCurrency : firstCurrency ?? "USD";
  return operations.map((operation) => ({
    ...operation,
    displayAmount: operation.amount == null ? null : convertUsingContext(operation.amount, displayCurrency, context),
  }));
}
