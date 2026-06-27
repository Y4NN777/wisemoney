import type { MasterKey } from "@/crypto/envelope.ts";
import { appendEvent } from "@/domain/eventStore.ts";
import type { MoneyDTO } from "@/domain/financialState.ts";
import { getSnapshot } from "@/domain/financialState.ts";

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

function validateCurrency(field: string, currency: string, errors: ValidationErrorDetail[]): void {
  if (!/^[A-Z]{3}$/.test(currency)) {
    errors.push({ field, message: "Must be ISO-4217" });
  }
}

function validateMoney(
  field: string,
  amount: MoneyDTO,
  errors: ValidationErrorDetail[],
  options: { positive?: boolean } = {}
): void {
  if (!Number.isSafeInteger(amount.minorUnits)) {
    errors.push({ field, message: "Must be a safe integer (INV-MON-01)" });
  }
  if (options.positive === true && amount.minorUnits <= 0) {
    errors.push({ field, message: "Amount must be greater than zero" });
  }
  validateCurrency(`${field}.currency`, amount.currency, errors);
}

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
  validateMoney("initialBalance", params.initialBalance, errors);
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
  const snapshot = await getSnapshot(params.masterKey);
  const account = snapshot.accounts.find((a) => a.id === params.accountId);

  if (!params.accountId || params.accountId.trim().length === 0) {
    errors.push({ field: "accountId", message: "Account id is required" });
  } else if (account == null || !account.isActive) {
    errors.push({ field: "accountId", message: "Account not found (INV-EVT-03)" });
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
  const snapshot = await getSnapshot(params.masterKey);
  const account = snapshot.accounts.find((a) => a.id === params.accountId);

  if (!params.accountId || params.accountId.trim().length === 0) {
    throw new ValidationError([{ field: "accountId", message: "Account id is required" }]);
  }
  if (account == null || !account.isActive) {
    throw new ValidationError([{ field: "accountId", message: "Account not found (INV-EVT-03)" }]);
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
  const snapshot = await getSnapshot(params.masterKey);

  const account = snapshot.accounts.find((a) => a.id === params.accountId && a.isActive);
  if (!params.accountId || account == null) {
    errors.push({ field: "accountId", message: "Account not found (INV-EVT-03)" });
  }
  const category = snapshot.categories.find((c) => c.id === params.categoryId);
  if (!params.categoryId || category == null) {
    errors.push({ field: "categoryId", message: "Category not found (INV-EVT-03)" });
  }
  validateMoney("amount", params.amount, errors, { positive: true });
  if (account != null && params.amount.currency !== account.currency) {
    errors.push({ field: "amount.currency", message: "Must match account currency" });
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
  const snapshot = await getSnapshot(params.masterKey);

  if (!params.name || params.name.trim().length === 0) {
    errors.push({ field: "name", message: "Category name is required" });
  }
  if (params.parentId != null) {
    const parent = snapshot.categories.find((c) => c.id === params.parentId);
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
  const errors: ValidationErrorDetail[] = [];
  const snapshot = await getSnapshot(params.masterKey);
  if (!params.categoryId || snapshot.categories.find((c) => c.id === params.categoryId) == null) {
    errors.push({ field: "categoryId", message: "Category not found (INV-EVT-03)" });
  }
  if (!params.newName || params.newName.trim().length === 0) {
    errors.push({ field: "newName", message: "New name is required" });
  }
  if (errors.length > 0) {
    throw new ValidationError(errors);
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
  const snapshot = await getSnapshot(params.masterKey);

  if (!params.categoryId || params.categoryId.trim().length === 0) {
    throw new ValidationError([{ field: "categoryId", message: "Category id is required" }]);
  }
  if (snapshot.categories.find((c) => c.id === params.categoryId) == null) {
    throw new ValidationError([{ field: "categoryId", message: "Category not found (INV-EVT-03)" }]);
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
  const snapshot = await getSnapshot(params.masterKey);

  if (!params.name || params.name.trim().length === 0) {
    errors.push({ field: "name", message: "Budget name is required" });
  }
  const category = snapshot.categories.find((c) => c.id === params.categoryId);
  if (!category) {
    errors.push({ field: "categoryId", message: "Category not found (INV-EVT-03)" });
  }
  validateMoney("limit", params.limit, errors, { positive: true });
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
  const snapshot = await getSnapshot(params.masterKey);
  const budget = snapshot.budgets.find((b) => b.id === params.budgetId);
  if (!params.budgetId || params.budgetId.trim().length === 0) {
    throw new ValidationError([{ field: "budgetId", message: "Budget id is required" }]);
  }
  if (budget == null || budget.isArchived) {
    throw new ValidationError([{ field: "budgetId", message: "Budget not found (INV-EVT-03)" }]);
  }

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
  validateMoney("targetAmount", params.targetAmount, errors, { positive: true });
  if (params.targetDate != null && !Number.isSafeInteger(params.targetDate)) {
    errors.push({ field: "targetDate", message: "Must be a Unix timestamp in milliseconds" });
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
  const snapshot = await getSnapshot(params.masterKey);

  const goal = snapshot.goals.find((g) => g.id === params.goalId && !g.isArchived);
  if (!goal) {
    errors.push({ field: "goalId", message: "Goal not found (INV-EVT-03)" });
  }
  validateMoney("amount", params.amount, errors, { positive: true });
  if (goal != null && params.amount.currency !== goal.targetAmount.currency) {
    errors.push({ field: "amount.currency", message: "Must match goal currency" });
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
  const snapshot = await getSnapshot(params.masterKey);
  const goal = snapshot.goals.find((g) => g.id === params.goalId);
  if (!params.goalId || params.goalId.trim().length === 0) {
    throw new ValidationError([{ field: "goalId", message: "Goal id is required" }]);
  }
  if (goal == null || goal.isArchived) {
    throw new ValidationError([{ field: "goalId", message: "Goal not found (INV-EVT-03)" }]);
  }

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
  const snapshot = await getSnapshot(params.masterKey);

  const category = snapshot.categories.find((c) => c.id === params.categoryId);
  if (!category) {
    errors.push({ field: "categoryId", message: "Category not found (INV-EVT-03)" });
  }
  if (!params.label || params.label.trim().length === 0) {
    errors.push({ field: "label", message: "Label is required" });
  }
  validateMoney("amount", params.amount, errors, { positive: true });
  if (params.direction !== "income" && params.direction !== "expense") {
    errors.push({ field: "direction", message: "Must be 'income' or 'expense'" });
  }
  if (!["weekly", "monthly", "yearly"].includes(params.frequency)) {
    errors.push({ field: "frequency", message: "Must be weekly, monthly, or yearly" });
  }
  if (!Number.isSafeInteger(params.startDate)) {
    errors.push({ field: "startDate", message: "Must be a Unix timestamp in milliseconds" });
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
  const errors: ValidationErrorDetail[] = [];
  const snapshot = await getSnapshot(params.masterKey);
  const item = snapshot.recurringItems.find((r) => r.id === params.itemId);
  const account = snapshot.accounts.find((a) => a.id === params.accountId && a.isActive);
  const category = snapshot.categories.find((c) => c.id === params.categoryId);

  if (item == null) {
    errors.push({ field: "itemId", message: "Recurring item not found (INV-EVT-03)" });
  }
  if (account == null) {
    errors.push({ field: "accountId", message: "Account not found (INV-EVT-03)" });
  }
  if (category == null) {
    errors.push({ field: "categoryId", message: "Category not found (INV-EVT-03)" });
  }
  validateMoney("amount", params.amount, errors, { positive: true });
  if (account != null && params.amount.currency !== account.currency) {
    errors.push({ field: "amount.currency", message: "Must match account currency" });
  }
  if (item != null && params.categoryId !== item.categoryId) {
    errors.push({ field: "categoryId", message: "Must match recurring item category" });
  }
  if (item != null && params.direction !== item.direction) {
    errors.push({ field: "direction", message: "Must match recurring item direction" });
  }
  if (params.direction !== "income" && params.direction !== "expense") {
    errors.push({ field: "direction", message: "Must be 'income' or 'expense'" });
  }
  if (params.date != null && !Number.isSafeInteger(params.date)) {
    errors.push({ field: "date", message: "Must be a Unix timestamp in milliseconds" });
  }
  if (errors.length > 0) {
    throw new ValidationError(errors);
  }

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
  const snapshot = await getSnapshot(params.masterKey);

  const fromAccount = snapshot.accounts.find((a) => a.id === params.fromAccountId && a.isActive);
  if (!fromAccount) {
    errors.push({ field: "fromAccountId", message: "Source account not found (INV-EVT-03)" });
  }
  if (params.toAccountId != null) {
    const toAccount = snapshot.accounts.find((a) => a.id === params.toAccountId && a.isActive);
    if (!toAccount) {
      errors.push({ field: "toAccountId", message: "Destination account not found (INV-EVT-03)" });
    }
    if (params.toAccountId === params.fromAccountId) {
      errors.push({ field: "toAccountId", message: "Source and destination must differ" });
    }
    if (fromAccount != null && toAccount != null && fromAccount.currency !== toAccount.currency) {
      errors.push({ field: "toAccountId", message: "Destination account currency must match source account currency" });
    }
  }
  if (params.toAccountId == null && (params.externalDestination == null || params.externalDestination.trim().length === 0)) {
    errors.push({ field: "externalDestination", message: "External destination is required when no internal account selected" });
  }
  validateMoney("amount", params.amount, errors, { positive: true });
  if (fromAccount != null && params.amount.currency !== fromAccount.currency) {
    errors.push({ field: "amount.currency", message: "Must match source account currency" });
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
  const errors: ValidationErrorDetail[] = [];
  const snapshot = await getSnapshot(params.masterKey);
  const account = snapshot.accounts.find((a) => a.id === params.accountId && a.isActive);
  const category = snapshot.categories.find((c) => c.id === params.categoryId);

  if (!params.originalEventId || params.originalEventId.trim().length === 0) {
    errors.push({ field: "originalEventId", message: "Transaction id is required" });
  }
  if (account == null) {
    errors.push({ field: "accountId", message: "Account not found (INV-EVT-03)" });
  }
  if (category == null) {
    errors.push({ field: "categoryId", message: "Category not found (INV-EVT-03)" });
  }
  validateMoney("amount", params.amount, errors, { positive: true });
  if (account != null && params.amount.currency !== account.currency) {
    errors.push({ field: "amount.currency", message: "Must match account currency" });
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
  if (!params.originalEventId || params.originalEventId.trim().length === 0) {
    throw new ValidationError([{ field: "originalEventId", message: "Transaction id is required" }]);
  }

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
  const snapshot = await getSnapshot(masterKey);
  const existingDefaults = new Set(
    snapshot.categories
      .filter((category) => category.isSystemDefault)
      .map((category) => category.name)
  );

  for (const cat of DEFAULT_CATEGORIES) {
    if (existingDefaults.has(cat.name)) continue;

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
