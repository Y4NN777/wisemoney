import type { MasterKey } from "@/crypto/envelope.ts";
import { appendEvent } from "@/domain/eventStore.ts";
import type { MoneyDTO } from "@/domain/financialState.ts";
import { db } from "@/db/schema.ts";

export type { MoneyDTO, AccountState, CategoryState, BudgetState, GoalState, RecurringItemState } from "@/domain/financialState.ts";

function uuid(): string {
  return crypto.randomUUID();
}

function nowMs(): number {
  return Date.now();
}

type ValidationErrorDetail = {
  field: string;
  message: string;
};

export class ValidationError extends Error {
  readonly details: ValidationErrorDetail[];

  constructor(details: ValidationErrorDetail[]) {
    super(
      `Validation failed: ${details.map((d) => `${d.field}: ${d.message}`).join("; ")}`
    );
    this.name = "ValidationError";
    this.details = details;
  }
}

// ---------------------------------------------------------------------------
// createAccount
// ---------------------------------------------------------------------------

export type CreateAccountParams = {
  name: string;
  type: string;
  initialBalance: MoneyDTO;
  masterKey: MasterKey;
};

export async function createAccount(params: CreateAccountParams): Promise<string> {
  const errors: ValidationErrorDetail[] = [];
  if (!params.name || params.name.trim().length === 0) {
    errors.push({ field: "name", message: "Account name is required" });
  }
  if (!params.type || params.type.trim().length === 0) {
    errors.push({ field: "type", message: "Account type is required" });
  }
  if (!Number.isSafeInteger(params.initialBalance.minorUnits)) {
    errors.push({ field: "initialBalance", message: "Must be a safe integer (INV-MON-01)" });
  }
  if (!/^[A-Z]{3}$/.test(params.initialBalance.currency)) {
    errors.push({ field: "initialBalance.currency", message: "Must be ISO-4217" });
  }
  if (errors.length > 0) {
    throw new ValidationError(errors);
  }

  const id = uuid();
  const now = nowMs();

  await appendEvent({
    id,
    timestamp: now,
    type: "account_created",
    entityId: id,
    payload: {
      name: params.name.trim(),
      type: params.type.trim(),
      initialBalance: {
        minorUnits: params.initialBalance.minorUnits,
        currency: params.initialBalance.currency,
      },
    },
    masterKey: params.masterKey,
  });

  return id;
}

// ---------------------------------------------------------------------------
// updateAccount
// ---------------------------------------------------------------------------

export type UpdateAccountParams = {
  accountId: string;
  name: string;
  type: string;
  masterKey: MasterKey;
};

export async function updateAccount(params: UpdateAccountParams): Promise<void> {
  const errors: ValidationErrorDetail[] = [];
  if (!params.accountId || params.accountId.trim().length === 0) {
    errors.push({ field: "accountId", message: "Account id is required" });
  }
  if (!params.name || params.name.trim().length === 0) {
    errors.push({ field: "name", message: "Account name is required" });
  }
  if (!params.type || params.type.trim().length === 0) {
    errors.push({ field: "type", message: "Account type is required" });
  }
  if (errors.length > 0) {
    throw new ValidationError(errors);
  }

  await appendEvent({
    id: uuid(),
    timestamp: nowMs(),
    type: "account_updated",
    entityId: params.accountId,
    payload: {
      accountId: params.accountId,
      name: params.name.trim(),
      type: params.type.trim(),
    },
    masterKey: params.masterKey,
  });
}

// ---------------------------------------------------------------------------
// archiveAccount
// ---------------------------------------------------------------------------

export type ArchiveAccountParams = {
  accountId: string;
  masterKey: MasterKey;
};

export async function archiveAccount(params: ArchiveAccountParams): Promise<void> {
  if (!params.accountId || params.accountId.trim().length === 0) {
    throw new ValidationError([{ field: "accountId", message: "Account id is required" }]);
  }

  await appendEvent({
    id: uuid(),
    timestamp: nowMs(),
    type: "account_archived",
    entityId: params.accountId,
    payload: { accountId: params.accountId },
    masterKey: params.masterKey,
  });
}

// ---------------------------------------------------------------------------
// recordTransaction
// ---------------------------------------------------------------------------

export type RecordTransactionParams = {
  accountId: string;
  categoryId: string;
  amount: MoneyDTO;
  direction: "income" | "expense";
  note?: string;
  tags?: string[];
  merchant?: string;
  masterKey: MasterKey;
};

export async function recordTransaction(
  params: RecordTransactionParams
): Promise<string> {
  const errors: ValidationErrorDetail[] = [];

  const account = await db.accounts.get(params.accountId);
  if (!account) {
    errors.push({ field: "accountId", message: "Account not found (INV-EVT-03)" });
  }
  const category = await db.categories.get(params.categoryId);
  if (!category) {
    errors.push({ field: "categoryId", message: "Category not found (INV-EVT-03)" });
  }
  if (!Number.isSafeInteger(params.amount.minorUnits)) {
    errors.push({ field: "amount", message: "Must be a safe integer (INV-MON-01)" });
  }
  if (!/^[A-Z]{3}$/.test(params.amount.currency)) {
    errors.push({ field: "amount.currency", message: "Must be ISO-4217" });
  }
  if (params.direction !== "income" && params.direction !== "expense") {
    errors.push({ field: "direction", message: "Must be 'income' or 'expense'" });
  }
  if (errors.length > 0) {
    throw new ValidationError(errors);
  }

  const id = uuid();
  const now = nowMs();

  await appendEvent({
    id,
    timestamp: now,
    type: "transaction_created",
    entityId: params.accountId,
    payload: {
      accountId: params.accountId,
      categoryId: params.categoryId,
      amount: params.amount,
      direction: params.direction,
      note: params.note ?? null,
      tags: params.tags ?? [],
      merchant: params.merchant ?? null,
    },
    masterKey: params.masterKey,
  });

  return id;
}

// ---------------------------------------------------------------------------
// createCategory
// ---------------------------------------------------------------------------

export type CreateCategoryParams = {
  name: string;
  parentId?: string;
  isSystemDefault?: boolean;
  masterKey: MasterKey;
};

export async function createCategory(
  params: CreateCategoryParams
): Promise<string> {
  const errors: ValidationErrorDetail[] = [];
  if (!params.name || params.name.trim().length === 0) {
    errors.push({ field: "name", message: "Category name is required" });
  }
  if (params.parentId != null) {
    const parent = await db.categories.get(params.parentId);
    if (parent == null) {
      errors.push({ field: "parentId", message: "Parent category not found" });
    }
  }
  if (errors.length > 0) {
    throw new ValidationError(errors);
  }

  const id = uuid();
  const now = nowMs();

  await appendEvent({
    id,
    timestamp: now,
    type: "category_created",
    entityId: id,
    payload: {
      name: params.name.trim(),
      parentId: params.parentId ?? null,
      isSystemDefault: params.isSystemDefault ?? false,
    },
    masterKey: params.masterKey,
  });

  return id;
}

// ---------------------------------------------------------------------------
// renameCategory
// ---------------------------------------------------------------------------

export type RenameCategoryParams = {
  categoryId: string;
  newName: string;
  masterKey: MasterKey;
};

export async function renameCategory(
  params: RenameCategoryParams
): Promise<void> {
  if (!params.newName || params.newName.trim().length === 0) {
    throw new ValidationError([{ field: "newName", message: "New name is required" }]);
  }

  const id = uuid();
  const now = nowMs();

  await appendEvent({
    id,
    timestamp: now,
    type: "category_renamed",
    entityId: params.categoryId,
    payload: {
      categoryId: params.categoryId,
      newName: params.newName.trim(),
    },
    masterKey: params.masterKey,
  });
}

// ---------------------------------------------------------------------------
// archiveCategory
// ---------------------------------------------------------------------------

export type ArchiveCategoryParams = {
  categoryId: string;
  masterKey: MasterKey;
};

export async function archiveCategory(params: ArchiveCategoryParams): Promise<void> {
  if (!params.categoryId || params.categoryId.trim().length === 0) {
    throw new ValidationError([{ field: "categoryId", message: "Category id is required" }]);
  }

  await appendEvent({
    id: uuid(),
    timestamp: nowMs(),
    type: "category_archived",
    entityId: params.categoryId,
    payload: { categoryId: params.categoryId },
    masterKey: params.masterKey,
  });
}

// ---------------------------------------------------------------------------
// createBudget
// ---------------------------------------------------------------------------

export type CreateBudgetParams = {
  name: string;
  categoryId: string;
  limit: MoneyDTO;
  periodMonth: string;
  masterKey: MasterKey;
};

export async function createBudget(
  params: CreateBudgetParams
): Promise<string> {
  const errors: ValidationErrorDetail[] = [];

  if (!params.name || params.name.trim().length === 0) {
    errors.push({ field: "name", message: "Budget name is required" });
  }
  const category = await db.categories.get(params.categoryId);
  if (!category) {
    errors.push({ field: "categoryId", message: "Category not found (INV-EVT-03)" });
  }
  if (!Number.isSafeInteger(params.limit.minorUnits)) {
    errors.push({ field: "limit", message: "Must be a safe integer (INV-MON-01)" });
  }
  if (!/^[A-Z]{3}$/.test(params.limit.currency)) {
    errors.push({ field: "limit.currency", message: "Must be ISO-4217" });
  }
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(params.periodMonth)) {
    errors.push({ field: "periodMonth", message: "Must be YYYY-MM format" });
  }
  if (errors.length > 0) {
    throw new ValidationError(errors);
  }

  const id = uuid();
  const now = nowMs();

  await appendEvent({
    id,
    timestamp: now,
    type: "budget_created",
    entityId: params.categoryId,
    payload: {
      name: params.name.trim(),
      categoryId: params.categoryId,
      limit: params.limit,
      periodMonth: params.periodMonth,
    },
    masterKey: params.masterKey,
  });

  return id;
}

// ---------------------------------------------------------------------------
// archiveBudget
// ---------------------------------------------------------------------------

export type ArchiveBudgetParams = {
  budgetId: string;
  masterKey: MasterKey;
};

export async function archiveBudget(
  params: ArchiveBudgetParams
): Promise<void> {
  const id = uuid();
  const now = nowMs();

  await appendEvent({
    id,
    timestamp: now,
    type: "budget_archived",
    entityId: params.budgetId,
    payload: { budgetId: params.budgetId },
    masterKey: params.masterKey,
  });
}

// ---------------------------------------------------------------------------
// createGoal
// ---------------------------------------------------------------------------

export type CreateGoalParams = {
  name: string;
  targetAmount: MoneyDTO;
  targetDate?: number;
  masterKey: MasterKey;
};

export async function createGoal(
  params: CreateGoalParams
): Promise<string> {
  const errors: ValidationErrorDetail[] = [];
  if (!params.name || params.name.trim().length === 0) {
    errors.push({ field: "name", message: "Goal name is required" });
  }
  if (!Number.isSafeInteger(params.targetAmount.minorUnits)) {
    errors.push({ field: "targetAmount", message: "Must be a safe integer (INV-MON-01)" });
  }
  if (!/^[A-Z]{3}$/.test(params.targetAmount.currency)) {
    errors.push({ field: "targetAmount.currency", message: "Must be ISO-4217" });
  }
  if (errors.length > 0) {
    throw new ValidationError(errors);
  }

  const id = uuid();
  const now = nowMs();

  await appendEvent({
    id,
    timestamp: now,
    type: "goal_created",
    entityId: id,
    payload: {
      name: params.name.trim(),
      targetAmount: params.targetAmount,
      targetDate: params.targetDate ?? null,
    },
    masterKey: params.masterKey,
  });

  return id;
}

// ---------------------------------------------------------------------------
// recordGoalContribution
// ---------------------------------------------------------------------------

export type RecordGoalContributionParams = {
  goalId: string;
  amount: MoneyDTO;
  masterKey: MasterKey;
};

export async function recordGoalContribution(
  params: RecordGoalContributionParams
): Promise<string> {
  const errors: ValidationErrorDetail[] = [];

  const goal = await db.goals.get(params.goalId);
  if (!goal) {
    errors.push({ field: "goalId", message: "Goal not found" });
  }
  if (!Number.isSafeInteger(params.amount.minorUnits)) {
    errors.push({ field: "amount", message: "Must be a safe integer (INV-MON-01)" });
  }
  if (!/^[A-Z]{3}$/.test(params.amount.currency)) {
    errors.push({ field: "amount.currency", message: "Must be ISO-4217" });
  }
  if (errors.length > 0) {
    throw new ValidationError(errors);
  }

  const id = uuid();
  const now = nowMs();

  await appendEvent({
    id,
    timestamp: now,
    type: "goal_contribution",
    entityId: params.goalId,
    payload: {
      goalId: params.goalId,
      amount: params.amount,
    },
    masterKey: params.masterKey,
  });

  return id;
}

// ---------------------------------------------------------------------------
// archiveGoal
// ---------------------------------------------------------------------------

export type ArchiveGoalParams = {
  goalId: string;
  masterKey: MasterKey;
};

export async function archiveGoal(
  params: ArchiveGoalParams
): Promise<void> {
  const id = uuid();
  const now = nowMs();

  await appendEvent({
    id,
    timestamp: now,
    type: "goal_archived",
    entityId: params.goalId,
    payload: { goalId: params.goalId },
    masterKey: params.masterKey,
  });
}

// ---------------------------------------------------------------------------
// createRecurringItem
// ---------------------------------------------------------------------------

export type CreateRecurringItemParams = {
  categoryId: string;
  label: string;
  amount: MoneyDTO;
  direction: "income" | "expense";
  frequency: "weekly" | "monthly" | "yearly";
  startDate: number;
  masterKey: MasterKey;
};

export async function createRecurringItem(
  params: CreateRecurringItemParams
): Promise<string> {
  const errors: ValidationErrorDetail[] = [];

  const category = await db.categories.get(params.categoryId);
  if (!category) {
    errors.push({ field: "categoryId", message: "Category not found (INV-EVT-03)" });
  }
  if (!params.label || params.label.trim().length === 0) {
    errors.push({ field: "label", message: "Label is required" });
  }
  if (!Number.isSafeInteger(params.amount.minorUnits)) {
    errors.push({ field: "amount", message: "Must be a safe integer (INV-MON-01)" });
  }
  if (errors.length > 0) {
    throw new ValidationError(errors);
  }

  const id = uuid();
  const now = nowMs();

  await appendEvent({
    id,
    timestamp: now,
    type: "recurring_item_created",
    entityId: id,
    payload: {
      categoryId: params.categoryId,
      label: params.label.trim(),
      amount: params.amount,
      direction: params.direction,
      frequency: params.frequency,
      startDate: params.startDate,
    },
    masterKey: params.masterKey,
  });

  return id;
}

// ---------------------------------------------------------------------------
// realiseRecurringOccurrence
// ---------------------------------------------------------------------------

export type RealiseRecurringOccurrenceParams = {
  itemId: string;
  accountId: string;
  categoryId: string;
  amount: MoneyDTO;
  direction: "income" | "expense";
  label?: string;
  date?: number;
  masterKey: MasterKey;
};

export async function realiseRecurringOccurrence(
  params: RealiseRecurringOccurrenceParams
): Promise<string> {
  const realiseId = uuid();
  const txId = uuid();
  const now = params.date ?? nowMs();

  await appendEvent({
    id: realiseId,
    timestamp: now,
    type: "recurring_item_realised",
    entityId: params.itemId,
    payload: {
      itemId: params.itemId,
      amount: params.amount,
      date: now,
    },
    masterKey: params.masterKey,
  });

  await appendEvent({
    id: txId,
    timestamp: now,
    type: "transaction_created",
    entityId: params.accountId,
    payload: {
      accountId: params.accountId,
      categoryId: params.categoryId,
      amount: params.amount,
      direction: params.direction,
      note: params.label != null && params.label !== "" ? `Recurring: ${params.label}` : "Recurring",
      tags: ["recurring"],
      merchant: null,
    },
    masterKey: params.masterKey,
  });

  return txId;
}

// ---------------------------------------------------------------------------
// recordTransfer
// ---------------------------------------------------------------------------

export type RecordTransferParams = {
  fromAccountId: string;
  toAccountId?: string;
  externalDestination?: string;
  amount: MoneyDTO;
  note?: string;
  masterKey: MasterKey;
};

export async function recordTransfer(
  params: RecordTransferParams
): Promise<string> {
  const errors: ValidationErrorDetail[] = [];

  const fromAccount = await db.accounts.get(params.fromAccountId);
  if (!fromAccount) {
    errors.push({ field: "fromAccountId", message: "Source account not found (INV-EVT-03)" });
  }
  if (params.toAccountId != null) {
    const toAccount = await db.accounts.get(params.toAccountId);
    if (!toAccount) {
      errors.push({ field: "toAccountId", message: "Destination account not found (INV-EVT-03)" });
    }
    if (params.toAccountId === params.fromAccountId) {
      errors.push({ field: "toAccountId", message: "Source and destination must differ" });
    }
  }
  if (params.toAccountId == null && (params.externalDestination == null || params.externalDestination.trim().length === 0)) {
    errors.push({ field: "externalDestination", message: "External destination is required when no internal account selected" });
  }
  if (!Number.isSafeInteger(params.amount.minorUnits)) {
    errors.push({ field: "amount", message: "Must be a safe integer (INV-MON-01)" });
  }
  if (!/^[A-Z]{3}$/.test(params.amount.currency)) {
    errors.push({ field: "amount.currency", message: "Must be ISO-4217" });
  }
  if (errors.length > 0) {
    throw new ValidationError(errors);
  }

  const id = uuid();
  const now = nowMs();

  await appendEvent({
    id,
    timestamp: now,
    type: "transfer_created",
    entityId: params.fromAccountId,
    payload: {
      fromAccountId: params.fromAccountId,
      toAccountId: params.toAccountId ?? null,
      externalDestination: params.externalDestination ?? null,
      amount: params.amount,
      note: params.note ?? null,
    },
    masterKey: params.masterKey,
  });

  return id;
}

// ---------------------------------------------------------------------------
// updateTransaction
// ---------------------------------------------------------------------------

export type UpdateTransactionParams = {
  originalEventId: string;
  accountId: string;
  categoryId: string;
  amount: MoneyDTO;
  direction: "income" | "expense";
  note?: string;
  tags?: string[];
  merchant?: string;
  masterKey: MasterKey;
};

export async function updateTransaction(
  params: UpdateTransactionParams
): Promise<string> {
  const id = uuid();
  const now = nowMs();

  await appendEvent({
    id,
    timestamp: now,
    type: "transaction_updated",
    entityId: params.accountId,
    payload: {
      originalEventId: params.originalEventId,
      accountId: params.accountId,
      categoryId: params.categoryId,
      amount: params.amount,
      direction: params.direction,
      note: params.note ?? null,
      tags: params.tags ?? [],
      merchant: params.merchant ?? null,
    },
    masterKey: params.masterKey,
  });

  return id;
}

// ---------------------------------------------------------------------------
// deleteTransaction
// ---------------------------------------------------------------------------

export type DeleteTransactionParams = {
  originalEventId: string;
  masterKey: MasterKey;
};

export async function deleteTransaction(
  params: DeleteTransactionParams
): Promise<void> {
  const id = uuid();
  const now = nowMs();

  await appendEvent({
    id,
    timestamp: now,
    type: "transaction_deleted",
    entityId: params.originalEventId,
    payload: {
      originalEventId: params.originalEventId,
    },
    masterKey: params.masterKey,
  });
}

// ---------------------------------------------------------------------------
// seedDefaultCategories
// ---------------------------------------------------------------------------

const DEFAULT_EXPENSE_CATEGORIES = [
  "Food & Dining",
  "Transport",
  "Housing",
  "Utilities",
  "Entertainment",
  "Healthcare",
  "Education",
  "Shopping",
  "Personal Care",
  "Insurance",
  "Subscriptions",
  "Gifts & Donations",
  "Travel",
];

const DEFAULT_INCOME_CATEGORIES = [
  "Salary",
  "Freelance",
  "Investments",
  "Refunds",
  "Other Income",
];

const DEFAULT_CATEGORIES = [
  ...DEFAULT_INCOME_CATEGORIES.map((name) => ({ name, parentId: undefined })),
  ...DEFAULT_EXPENSE_CATEGORIES.map((name) => ({ name, parentId: undefined })),
];

/**
 * Seed the default category set on first run.
 * Checks if any `isSystemDefault` categories already exist; if not, creates
 * the full set of income and expense defaults.
 *
 * Idempotent — safe to call on every app mount.
 */
export async function seedDefaultCategories(
  masterKey: MasterKey,
): Promise<void> {
  const existing = await db.categories
    .where("isSystemDefault")
    .equals(1)
    .count();

  if (existing > 0) return;

  for (const cat of DEFAULT_CATEGORIES) {
    const args: { name: string; parentId?: string; isSystemDefault: true; masterKey: MasterKey } = {
      name: cat.name,
      isSystemDefault: true,
      masterKey,
    };
    if (cat.parentId != null) {
      args.parentId = cat.parentId;
    }
    await createCategory(args);
  }
}
