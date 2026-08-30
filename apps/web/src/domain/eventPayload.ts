import type { FinancialEventPayload, FinancialEventType } from "./eventStore.ts";

const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function object(value: unknown): Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("payload must be an object");
  }
  return value as Record<string, unknown>;
}

function shape(payload: FinancialEventPayload, required: string[], optional: string[] = []): void {
  const allowed = new Set([...required, ...optional]);
  if (required.some((key) => !(key in payload)) || Object.keys(payload).some((key) => !allowed.has(key))) {
    throw new Error("payload fields do not match the event schema");
  }
}

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${field} must be a non-empty string`);
  return value;
}

function nullableText(value: unknown, field: string): void {
  if (value !== null && typeof value !== "string") throw new Error(`${field} must be a string or null`);
}

function timestamp(value: unknown, field: string): void {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(`${field} must be a valid timestamp`);
}

function money(value: unknown, field: string, positive = true): void {
  const candidate = object(value);
  if (
    !Number.isSafeInteger(candidate.minorUnits) ||
    (positive && (candidate.minorUnits as number) <= 0) ||
    typeof candidate.currency !== "string" ||
    !CURRENCY_PATTERN.test(candidate.currency) ||
    Object.keys(candidate).some((key) => key !== "minorUnits" && key !== "currency")
  ) {
    throw new Error(`${field} must be valid money`);
  }
}

function transactionMoney(value: unknown): void {
  money(value, "amount", false);
  if ((value as { minorUnits: number }).minorUnits === 0) throw new Error("amount must be non-zero");
}

function direction(value: unknown): void {
  if (value !== "income" && value !== "expense") throw new Error("direction is invalid");
}

export function validateFinancialEventPayload(type: FinancialEventType, payload: FinancialEventPayload): void {
  switch (type) {
    case "account_created":
      shape(payload, ["name", "type", "initialBalance"]);
      text(payload.name, "name"); text(payload.type, "type"); money(payload.initialBalance, "initialBalance", false);
      return;
    case "account_updated":
      shape(payload, ["accountId", "name", "type"]);
      text(payload.accountId, "accountId"); text(payload.name, "name"); text(payload.type, "type");
      return;
    case "account_archived":
      shape(payload, ["accountId"]); text(payload.accountId, "accountId"); return;
    case "transaction_created":
    case "transaction_updated": {
      const required = type === "transaction_updated"
        ? ["originalEventId", "accountId", "categoryId", "amount", "direction"]
        : ["accountId", "categoryId", "amount", "direction"];
      shape(payload, required, type === "transaction_created"
        ? ["note", "tags", "merchant", "occurredAt"]
        : ["note", "tags", "merchant"]);
      if (type === "transaction_updated") text(payload.originalEventId, "originalEventId");
      text(payload.accountId, "accountId"); text(payload.categoryId, "categoryId");
      transactionMoney(payload.amount); direction(payload.direction);
      if ("note" in payload) nullableText(payload.note, "note");
      if ("merchant" in payload) nullableText(payload.merchant, "merchant");
      if ("tags" in payload && (!Array.isArray(payload.tags) || payload.tags.some((tag) => typeof tag !== "string"))) throw new Error("tags must be strings");
      if ("occurredAt" in payload) timestamp(payload.occurredAt, "occurredAt");
      return;
    }
    case "transaction_deleted":
      shape(payload, ["originalEventId"]); text(payload.originalEventId, "originalEventId"); return;
    case "category_created":
      shape(payload, ["name"], ["parentId", "isSystemDefault"]);
      text(payload.name, "name");
      if ("parentId" in payload) nullableText(payload.parentId, "parentId");
      if ("isSystemDefault" in payload && typeof payload.isSystemDefault !== "boolean") throw new Error("isSystemDefault must be boolean");
      return;
    case "category_renamed":
      shape(payload, ["categoryId", "newName"]); text(payload.categoryId, "categoryId"); text(payload.newName, "newName"); return;
    case "category_archived":
      shape(payload, ["categoryId"]); text(payload.categoryId, "categoryId"); return;
    case "budget_created":
      shape(payload, ["name", "categoryId", "limit", "periodMonth"]);
      text(payload.name, "name"); text(payload.categoryId, "categoryId"); money(payload.limit, "limit");
      if (typeof payload.periodMonth !== "string" || !PERIOD_PATTERN.test(payload.periodMonth)) throw new Error("periodMonth is invalid");
      return;
    case "budget_archived":
      shape(payload, ["budgetId"]); text(payload.budgetId, "budgetId"); return;
    case "goal_created":
      shape(payload, ["name", "targetAmount"], ["targetDate"]);
      text(payload.name, "name"); money(payload.targetAmount, "targetAmount");
      if (payload.targetDate !== undefined && payload.targetDate !== null) timestamp(payload.targetDate, "targetDate");
      return;
    case "goal_contribution":
      shape(payload, ["goalId", "amount"]); text(payload.goalId, "goalId"); money(payload.amount, "amount"); return;
    case "goal_archived":
      shape(payload, ["goalId"]); text(payload.goalId, "goalId"); return;
    case "recurring_item_created":
      shape(payload, ["categoryId", "label", "amount", "direction", "frequency", "startDate"]);
      text(payload.categoryId, "categoryId"); text(payload.label, "label"); money(payload.amount, "amount"); direction(payload.direction);
      if (payload.frequency !== "weekly" && payload.frequency !== "monthly" && payload.frequency !== "yearly") throw new Error("frequency is invalid");
      timestamp(payload.startDate, "startDate"); return;
    case "recurring_item_archived":
      shape(payload, ["itemId"]); text(payload.itemId, "itemId"); return;
    case "recurring_item_realised":
      shape(payload, ["itemId", "date"], ["amount"]);
      text(payload.itemId, "itemId");
      if (payload.amount !== undefined) money(payload.amount, "amount");
      timestamp(payload.date, "date"); return;
    case "transfer_created": {
      shape(payload, ["fromAccountId", "toAccountId", "externalDestination", "amount"], ["note", "destinationAmount"]);
      text(payload.fromAccountId, "fromAccountId"); nullableText(payload.toAccountId, "toAccountId");
      nullableText(payload.externalDestination, "externalDestination");
      if ("note" in payload) nullableText(payload.note, "note");
      money(payload.amount, "amount");
      if (payload.destinationAmount !== undefined) money(payload.destinationAmount, "destinationAmount");
      const hasAccount = typeof payload.toAccountId === "string" && payload.toAccountId !== "";
      const hasExternal = typeof payload.externalDestination === "string" && payload.externalDestination.trim() !== "";
      if (hasAccount === hasExternal || payload.toAccountId === payload.fromAccountId) throw new Error("transfer destination is invalid");
      if (hasExternal && payload.destinationAmount !== undefined) throw new Error("external transfer cannot have a destination amount");
      return;
    }
    case "debt_credit_created":
      shape(payload, ["kind", "partyName", "motive", "amount", "date", "status"], ["dueDate"]);
      if (payload.kind !== "debt" && payload.kind !== "receivable") throw new Error("kind is invalid");
      text(payload.partyName, "partyName"); text(payload.motive, "motive"); money(payload.amount, "amount"); timestamp(payload.date, "date");
      if (payload.status !== "pending" && payload.status !== "partial" && payload.status !== "settled") throw new Error("status is invalid");
      if (payload.dueDate !== undefined && payload.dueDate !== null) timestamp(payload.dueDate, "dueDate");
      return;
    case "debt_credit_status_updated":
      shape(payload, ["debtCreditId", "status"]); text(payload.debtCreditId, "debtCreditId");
      if (payload.status !== "pending" && payload.status !== "partial" && payload.status !== "settled") throw new Error("status is invalid");
      return;
    case "debt_credit_due_date_updated":
      shape(payload, ["debtCreditId", "dueDate"]); text(payload.debtCreditId, "debtCreditId");
      if (payload.dueDate !== null) timestamp(payload.dueDate, "dueDate");
      return;
    case "planned_expense_created":
      shape(payload, ["label", "estimatedAmount", "categoryId", "priority", "dueDate", "note"]);
      text(payload.label, "label"); money(payload.estimatedAmount, "estimatedAmount"); text(payload.categoryId, "categoryId");
      if (payload.priority !== "low" && payload.priority !== "medium" && payload.priority !== "high") throw new Error("priority is invalid");
      if (payload.dueDate !== null) timestamp(payload.dueDate, "dueDate");
      if (typeof payload.note !== "string") throw new Error("note must be a string");
      return;
    case "planned_expense_updated":
      shape(payload, ["plannedExpenseId", "label", "estimatedAmount", "categoryId", "priority", "dueDate", "note"]);
      text(payload.plannedExpenseId, "plannedExpenseId"); text(payload.label, "label");
      money(payload.estimatedAmount, "estimatedAmount"); text(payload.categoryId, "categoryId");
      if (payload.priority !== "low" && payload.priority !== "medium" && payload.priority !== "high") throw new Error("priority is invalid");
      if (payload.dueDate !== null) timestamp(payload.dueDate, "dueDate");
      if (typeof payload.note !== "string") throw new Error("note must be a string");
      return;
    case "planned_expense_cancelled":
      shape(payload, ["plannedExpenseId"]); text(payload.plannedExpenseId, "plannedExpenseId"); return;
    case "planned_expense_completed":
      shape(payload, ["plannedExpenseId", "transactionId", "accountId", "actualAmount", "occurredAt"]);
      text(payload.plannedExpenseId, "plannedExpenseId"); text(payload.transactionId, "transactionId");
      text(payload.accountId, "accountId"); money(payload.actualAmount, "actualAmount");
      timestamp(payload.occurredAt, "occurredAt"); return;
  }
}
