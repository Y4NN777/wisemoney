import type { MasterKey } from "@/crypto/envelope.ts";
import { open, seal } from "@/crypto/envelope.ts";
import type { FinancialEventRecord } from "@/db/schema.ts";
import { db } from "@/db/schema.ts";
import { compareFinancialEvents } from "./eventStore.ts";
import type { FinancialEventPayload, FinancialEventType } from "./eventStore.ts";
import type { CurrencyContext } from "./currencyStore.ts";
import { convertUsingContext, loadCurrencyContext } from "./currencyStore.ts";

export type MoneyDTO = {
  readonly minorUnits: number;
  readonly currency: string;
};

export type PlannedExpensePriority = "low" | "medium" | "high";
export type PlannedExpenseStatus = "pending" | "completed" | "cancelled";

export type PlannedExpenseState = {
  id: string;
  label: string;
  estimatedAmount: MoneyDTO;
  categoryId: string;
  priority: PlannedExpensePriority;
  dueDate: number | null;
  note: string;
  status: PlannedExpenseStatus;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
  cancelledAt: number | null;
  transactionId: string | null;
  completedAccountId: string | null;
  actualAmount: MoneyDTO | null;
};

type AccountState = {
  id: string;
  name: string;
  type: string;
  currency: string;
  isActive: boolean;
  balance: MoneyDTO;
  initialBalance: MoneyDTO;
};

type CategoryState = {
  id: string;
  name: string;
  parentId: string | null;
  isSystemDefault: boolean;
  isArchived: boolean;
};

type BudgetState = {
  id: string;
  name: string;
  categoryId: string;
  limit: MoneyDTO;
  periodMonth: string;
  isArchived: boolean;
  spent: MoneyDTO;
};

type GoalState = {
  id: string;
  name: string;
  targetAmount: MoneyDTO;
  targetDate: number | null;
  isArchived: boolean;
  accumulated: MoneyDTO;
};

type RecurringItemState = {
  id: string;
  categoryId: string;
  label: string;
  amount: MoneyDTO;
  direction: "income" | "expense";
  frequency: "weekly" | "monthly" | "yearly";
  startDate: number;
  lastRealised: number | null;
  isArchived: boolean;
};

export type DebtCreditStatus = "pending" | "partial" | "settled";

export type DebtCreditKind = "receivable" | "debt";

export type DebtCreditState = {
  id: string;
  kind: DebtCreditKind;
  partyName: string;
  motive: string;
  amount: MoneyDTO;
  date: number;
  status: DebtCreditStatus;
  dueDate: number | null;
};

type TransferState = {
  id: string;
  timestamp: number;
  fromAccountId: string;
  toAccountId: string | null;
  externalDestination: string | null;
  amount: MoneyDTO;
  note: string;
};

export type FinancialStateSnapshot = {
  version: 4;
  asOfEventId: string;
  asOfTimestamp: number;
  baseCurrency: string;
  currencyContextId: string;
  missingFxCurrencies: string[];

  accounts: AccountState[];
  categories: CategoryState[];
  budgets: BudgetState[];
  goals: GoalState[];
  recurringItems: RecurringItemState[];
  debtCredits: DebtCreditState[];
  transfers: TransferState[];
  plannedExpenses: PlannedExpenseState[];

  periodStart: number;
  periodEnd: number;

  totalBalance: MoneyDTO;
  periodIncome: MoneyDTO;
  periodExpenses: MoneyDTO;
  netCashFlow: MoneyDTO;

  categoryTotals: Record<string, MoneyDTO>;
  budgetProgress: Record<string, {
    limit: MoneyDTO;
    spent: MoneyDTO;
    percentage: number;
  }>;
  goalProgress: Record<string, {
    target: MoneyDTO;
    accumulated: MoneyDTO;
    percentage: number;
  }>;
  projectedRecurring: {
    label: string;
    amount: MoneyDTO;
    dueDate: number;
  }[];
};

function zeroMoney(currency: string): MoneyDTO {
  return { minorUnits: 0, currency };
}

function addMoney(a: MoneyDTO, b: MoneyDTO): MoneyDTO {
  if (a.currency !== b.currency) {
    return a;
  }
  const minorUnits = a.minorUnits + b.minorUnits;
  if (!Number.isSafeInteger(minorUnits)) throw new Error("Money addition exceeds the safe integer range");
  return { minorUnits, currency: a.currency };
}

function subMoney(a: MoneyDTO, b: MoneyDTO): MoneyDTO {
  if (a.currency !== b.currency) {
    return a;
  }
  const minorUnits = a.minorUnits - b.minorUnits;
  if (!Number.isSafeInteger(minorUnits)) throw new Error("Money subtraction exceeds the safe integer range");
  return { minorUnits, currency: a.currency };
}

function positiveMoney(amount: MoneyDTO): MoneyDTO {
  return { minorUnits: Math.abs(amount.minorUnits), currency: amount.currency };
}

function percentage(part: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((part / total) * 10000) / 100;
}

function getPeriodBounds(now: number): { start: number; end: number } {
  const d = new Date(now);
  const start = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
  return { start, end };
}

function getMonthBounds(periodMonth: string): { start: number; end: number } {
  const [yearText, monthText] = periodMonth.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  return {
    start: new Date(year, monthIndex, 1).getTime(),
    end: new Date(year, monthIndex + 1, 0, 23, 59, 59, 999).getTime(),
  };
}

function toPeriodMonth(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

type AccountFold = {
  id: string;
  name: string;
  type: string;
  currency: string;
  isActive: boolean;
  balance: MoneyDTO;
  initialBalance: MoneyDTO;
};

type TransactionFold = {
  id: string;
  timestamp: number;
  accountId: string;
  categoryId: string;
  amount: MoneyDTO;
  direction: "income" | "expense";
};

type Accumulator = {
  accounts: Map<string, AccountFold>;
  categories: Map<string, {
    id: string;
    name: string;
    parentId: string | null;
    isSystemDefault: boolean;
    isArchived: boolean;
  }>;
  transactions: Map<string, TransactionFold>;
  budgets: Map<string, {
    id: string;
    name: string;
    categoryId: string;
    limit: MoneyDTO;
    periodMonth: string;
    isArchived: boolean;
  }>;
  goals: Map<string, {
    id: string;
    name: string;
    targetAmount: MoneyDTO;
    targetDate: number | null;
    isArchived: boolean;
    accumulated: MoneyDTO;
  }>;
  recurringItems: Map<string, RecurringItemState>;
  debtCredits: Map<string, DebtCreditState>;
  plannedExpenses: Map<string, PlannedExpenseState>;
  /** Transfers: debit fromAccount, credit toAccount (internal) or external */
  transfers: TransferState[];
};

function createEmptyAccumulator(): Accumulator {
  return {
    accounts: new Map(),
    categories: new Map(),
    transactions: new Map(),
    budgets: new Map(),
    goals: new Map(),
    recurringItems: new Map(),
    debtCredits: new Map(),
    plannedExpenses: new Map(),
    transfers: [],
  };
}

function applyPayload(
  acc: Accumulator,
  type: FinancialEventType,
  payload: FinancialEventPayload,
  eventId: string,
  timestamp: number
): void {
  const missing = (entity: string, id: string): never => {
    throw new Error(`event ${eventId}: missing ${entity} ${id}`);
  };
  const required = <T>(value: T | undefined, entity: string, id: string): T =>
    value ?? missing(entity, id);
  switch (type) {
    case "account_created": {
      const p = payload as unknown as {
        name: string;
        type: string;
        initialBalance: { minorUnits: number; currency: string };
      };
      const initial = { minorUnits: p.initialBalance.minorUnits, currency: p.initialBalance.currency };
      acc.accounts.set(eventId, {
        id: eventId,
        name: p.name,
        type: p.type,
        currency: p.initialBalance.currency,
        isActive: true,
        balance: { ...initial },
        initialBalance: { ...initial },
      });
      break;
    }
    case "account_updated": {
      const p = payload as unknown as { accountId: string; name: string; type: string };
      const account = required(acc.accounts.get(p.accountId), "account", p.accountId);
      if (!account.isActive) throw new Error(`event ${eventId}: account ${p.accountId} is archived`);
      account.name = p.name;
      account.type = p.type;
      break;
    }
    case "account_archived": {
      const p = payload as unknown as { accountId: string };
      const account = required(acc.accounts.get(p.accountId), "account", p.accountId);
      // Older clients allowed this event for non-zero accounts. Keep those
      // accounts visible so their balance can be corrected and archived again.
      if (account.balance.minorUnits !== 0) break;
      account.isActive = false;
      break;
    }
    case "transaction_created": {
      const p = payload as unknown as {
        accountId: string;
        categoryId: string;
        amount: { minorUnits: number; currency: string };
        direction: "income" | "expense";
        occurredAt?: number;
      };
      const amount = positiveMoney({ minorUnits: p.amount.minorUnits, currency: p.amount.currency });
      const account = required(acc.accounts.get(p.accountId), "account", p.accountId);
      const category = required(acc.categories.get(p.categoryId), "category", p.categoryId);
      if (!account.isActive) throw new Error(`event ${eventId}: account ${p.accountId} is archived`);
      if (category.isArchived) throw new Error(`event ${eventId}: category ${p.categoryId} is archived`);
      if (account.currency !== amount.currency) throw new Error(`event ${eventId}: transaction currency mismatch`);
      if (p.direction === "income") {
        account.balance = addMoney(account.balance, amount);
      } else {
        account.balance = subMoney(account.balance, amount);
      }
      acc.transactions.set(eventId, {
        id: eventId,
        timestamp: p.occurredAt ?? timestamp,
        accountId: p.accountId,
        categoryId: p.categoryId,
        amount,
        direction: p.direction,
      });
      break;
    }
    case "transaction_updated": {
      const p = payload as unknown as {
        originalEventId: string;
        accountId: string;
        categoryId: string;
        amount: { minorUnits: number; currency: string };
        direction: "income" | "expense";
      };
      const oldTx = required(
        acc.transactions.get(p.originalEventId),
        "transaction",
        p.originalEventId,
      );
      {
        const oldAccount = acc.accounts.get(oldTx.accountId);
        if (oldAccount) {
          if (oldTx.direction === "income") {
            oldAccount.balance = subMoney(oldAccount.balance, oldTx.amount);
          } else {
            oldAccount.balance = addMoney(oldAccount.balance, oldTx.amount);
          }
        }
        oldTx.accountId = p.accountId;
        oldTx.categoryId = p.categoryId;
        oldTx.amount = positiveMoney({ minorUnits: p.amount.minorUnits, currency: p.amount.currency });
        oldTx.direction = p.direction;
        const newAccount = required(acc.accounts.get(p.accountId), "account", p.accountId);
        const category = required(acc.categories.get(p.categoryId), "category", p.categoryId);
        if (!newAccount.isActive) throw new Error(`event ${eventId}: account ${p.accountId} is archived`);
        if (category.isArchived) throw new Error(`event ${eventId}: category ${p.categoryId} is archived`);
        if (newAccount.currency !== oldTx.amount.currency) throw new Error(`event ${eventId}: transaction currency mismatch`);
        if (p.direction === "income") {
          newAccount.balance = addMoney(newAccount.balance, oldTx.amount);
        } else {
          newAccount.balance = subMoney(newAccount.balance, oldTx.amount);
        }
      }
      break;
    }
    case "transaction_deleted": {
      const p = payload as unknown as { originalEventId: string };
      const tx = required(acc.transactions.get(p.originalEventId), "transaction", p.originalEventId);
      {
        const account = acc.accounts.get(tx.accountId);
        if (account) {
          if (tx.direction === "income") {
            account.balance = subMoney(account.balance, tx.amount);
          } else {
            account.balance = addMoney(account.balance, tx.amount);
          }
        }
        acc.transactions.delete(p.originalEventId);
      }
      break;
    }
    case "category_created": {
      const p = payload as unknown as { name: string; parentId?: string; isSystemDefault?: boolean };
      if (p.parentId != null) {
        const parent = required(acc.categories.get(p.parentId), "parent category", p.parentId);
        if (parent.isArchived) throw new Error(`event ${eventId}: parent category ${p.parentId} is archived`);
      }
      acc.categories.set(eventId, {
        id: eventId,
        name: p.name,
        parentId: p.parentId ?? null,
        isSystemDefault: p.isSystemDefault ?? false,
        isArchived: false,
      });
      break;
    }
    case "category_renamed": {
      const p = payload as unknown as { categoryId: string; newName: string };
      const cat = required(acc.categories.get(p.categoryId), "category", p.categoryId);
      if (cat.isArchived) throw new Error(`event ${eventId}: category ${p.categoryId} is archived`);
      cat.name = p.newName;
      break;
    }
    case "category_archived": {
      const p = payload as unknown as { categoryId: string };
      const category = required(acc.categories.get(p.categoryId), "category", p.categoryId);
      // Preserve access to legacy categories archived before dependency guards
      // existed. A later valid archive event can apply after dependencies end.
      const hasActiveDependency =
        [...acc.categories.values()].some((item) => item.parentId === p.categoryId && !item.isArchived) ||
        [...acc.budgets.values()].some((item) => item.categoryId === p.categoryId && !item.isArchived) ||
        [...acc.recurringItems.values()].some((item) => item.categoryId === p.categoryId && !item.isArchived) ||
        [...acc.plannedExpenses.values()].some(
          (item) => item.categoryId === p.categoryId && item.status === "pending"
        );
      if (hasActiveDependency) break;
      category.isArchived = true;
      break;
    }
    case "budget_created": {
      const p = payload as unknown as {
        name: string;
        categoryId: string;
        limit: { minorUnits: number; currency: string };
        periodMonth: string;
      };
      const category = required(acc.categories.get(p.categoryId), "category", p.categoryId);
      if (category.isArchived) throw new Error(`event ${eventId}: category ${p.categoryId} is archived`);
      acc.budgets.set(eventId, {
        id: eventId,
        name: p.name,
        categoryId: p.categoryId,
        limit: { minorUnits: p.limit.minorUnits, currency: p.limit.currency },
        periodMonth: p.periodMonth,
        isArchived: false,
      });
      break;
    }
    case "budget_archived": {
      const p = payload as unknown as { budgetId: string };
      const budget = required(acc.budgets.get(p.budgetId), "budget", p.budgetId);
      budget.isArchived = true;
      break;
    }
    case "goal_created": {
      const p = payload as unknown as {
        name: string;
        targetAmount: { minorUnits: number; currency: string };
        targetDate?: number;
      };
      acc.goals.set(eventId, {
        id: eventId,
        name: p.name,
        targetAmount: { minorUnits: p.targetAmount.minorUnits, currency: p.targetAmount.currency },
        targetDate: p.targetDate ?? null,
        isArchived: false,
        accumulated: zeroMoney(p.targetAmount.currency),
      });
      break;
    }
    case "goal_contribution": {
      const p = payload as unknown as {
        goalId: string;
        amount: { minorUnits: number; currency: string };
      };
      const goal = required(acc.goals.get(p.goalId), "goal", p.goalId);
      if (goal.isArchived) throw new Error(`event ${eventId}: goal ${p.goalId} is archived`);
      if (goal.targetAmount.currency !== p.amount.currency) {
        throw new Error(`event ${eventId}: goal contribution currency mismatch`);
      }
      goal.accumulated = addMoney(goal.accumulated, {
        minorUnits: Math.abs(p.amount.minorUnits),
        currency: p.amount.currency,
      });
      break;
    }
    case "goal_archived": {
      const p = payload as unknown as { goalId: string };
      const goal = required(acc.goals.get(p.goalId), "goal", p.goalId);
      goal.isArchived = true;
      break;
    }
    case "recurring_item_created": {
      const p = payload as unknown as {
        categoryId: string;
        label: string;
        amount: { minorUnits: number; currency: string };
        direction: "income" | "expense";
        frequency: "weekly" | "monthly" | "yearly";
        startDate: number;
      };
      const category = required(acc.categories.get(p.categoryId), "category", p.categoryId);
      if (category.isArchived) throw new Error(`event ${eventId}: category ${p.categoryId} is archived`);
      acc.recurringItems.set(eventId, {
        id: eventId,
        categoryId: p.categoryId,
        label: p.label,
        amount: positiveMoney({ minorUnits: p.amount.minorUnits, currency: p.amount.currency }),
        direction: p.direction,
        frequency: p.frequency,
        startDate: p.startDate,
        lastRealised: null,
        isArchived: false,
      });
      break;
    }
    case "recurring_item_archived": {
      const p = payload as unknown as { itemId: string };
      const item = required(acc.recurringItems.get(p.itemId), "recurring item", p.itemId);
      if (item.isArchived) throw new Error(`event ${eventId}: recurring item ${p.itemId} is already archived`);
      item.isArchived = true;
      break;
    }
    case "recurring_item_realised": {
      const p = payload as unknown as { itemId: string; amount?: { minorUnits: number; currency: string }; date: number };
      const item = required(acc.recurringItems.get(p.itemId), "recurring item", p.itemId);
      if (item.isArchived) throw new Error(`event ${eventId}: recurring item ${p.itemId} is archived`);
      item.lastRealised = p.date;
      if (p.amount) {
        item.amount = positiveMoney({ minorUnits: p.amount.minorUnits, currency: p.amount.currency });
      }
      break;
    }
    case "transfer_created": {
      const p = payload as unknown as {
        fromAccountId: string;
        toAccountId: string | null;
        externalDestination: string | null;
        amount: { minorUnits: number; currency: string };
        note?: string | null;
      };
      const amount = positiveMoney({ minorUnits: p.amount.minorUnits, currency: p.amount.currency });
      const from = required(acc.accounts.get(p.fromAccountId), "account", p.fromAccountId);
      if (!from.isActive) throw new Error(`event ${eventId}: account ${p.fromAccountId} is archived`);
      if (from.currency !== amount.currency) throw new Error(`event ${eventId}: transfer currency mismatch`);
      from.balance = subMoney(from.balance, amount);
      if (p.toAccountId != null) {
        const to = required(acc.accounts.get(p.toAccountId), "account", p.toAccountId);
        if (!to.isActive) throw new Error(`event ${eventId}: account ${p.toAccountId} is archived`);
        if (to.currency !== amount.currency) throw new Error(`event ${eventId}: transfer currency mismatch`);
        to.balance = addMoney(to.balance, amount);
      }
      acc.transfers.push({
        id: eventId,
        timestamp,
        fromAccountId: p.fromAccountId,
        toAccountId: p.toAccountId,
        externalDestination: p.externalDestination,
        amount,
        note: p.note ?? "",
      });
      break;
    }
    case "debt_credit_created": {
      const p = payload as unknown as {
        kind: DebtCreditKind;
        partyName: string;
        motive: string;
        amount: { minorUnits: number; currency: string };
        date: number;
        status: DebtCreditStatus;
        dueDate?: number | null;
      };
      acc.debtCredits.set(eventId, {
        id: eventId,
        kind: p.kind,
        partyName: p.partyName,
        motive: p.motive,
        amount: positiveMoney({ minorUnits: p.amount.minorUnits, currency: p.amount.currency }),
        date: p.date,
        status: p.status,
        dueDate: p.dueDate ?? null,
      });
      break;
    }
    case "debt_credit_status_updated": {
      const p = payload as unknown as {
        debtCreditId: string;
        status: DebtCreditStatus;
      };
      const item = required(acc.debtCredits.get(p.debtCreditId), "debt or receivable", p.debtCreditId);
      item.status = p.status;
      break;
    }
    case "debt_credit_due_date_updated": {
      const p = payload as unknown as {
        debtCreditId: string;
        dueDate: number | null;
      };
      const item = required(acc.debtCredits.get(p.debtCreditId), "debt or receivable", p.debtCreditId);
      item.dueDate = p.dueDate;
      break;
    }
    case "planned_expense_created": {
      const p = payload as unknown as {
        label: string;
        estimatedAmount: MoneyDTO;
        categoryId: string;
        priority: PlannedExpensePriority;
        dueDate: number | null;
        note: string;
      };
      const category = required(acc.categories.get(p.categoryId), "category", p.categoryId);
      if (category.isArchived) throw new Error(`event ${eventId}: category ${p.categoryId} is archived`);
      acc.plannedExpenses.set(eventId, {
        id: eventId,
        label: p.label,
        estimatedAmount: { ...p.estimatedAmount },
        categoryId: p.categoryId,
        priority: p.priority,
        dueDate: p.dueDate,
        note: p.note,
        status: "pending",
        createdAt: timestamp,
        updatedAt: timestamp,
        completedAt: null,
        cancelledAt: null,
        transactionId: null,
        completedAccountId: null,
        actualAmount: null,
      });
      break;
    }
    case "planned_expense_updated": {
      const p = payload as unknown as {
        plannedExpenseId: string;
        label: string;
        estimatedAmount: MoneyDTO;
        categoryId: string;
        priority: PlannedExpensePriority;
        dueDate: number | null;
        note: string;
      };
      const planned = required(
        acc.plannedExpenses.get(p.plannedExpenseId),
        "planned expense",
        p.plannedExpenseId,
      );
      if (planned.status !== "pending") {
        throw new Error(`event ${eventId}: planned expense ${p.plannedExpenseId} is not pending`);
      }
      const category = required(acc.categories.get(p.categoryId), "category", p.categoryId);
      if (category.isArchived) throw new Error(`event ${eventId}: category ${p.categoryId} is archived`);
      planned.label = p.label;
      planned.estimatedAmount = { ...p.estimatedAmount };
      planned.categoryId = p.categoryId;
      planned.priority = p.priority;
      planned.dueDate = p.dueDate;
      planned.note = p.note;
      planned.updatedAt = timestamp;
      break;
    }
    case "planned_expense_cancelled": {
      const p = payload as unknown as { plannedExpenseId: string };
      const planned = required(
        acc.plannedExpenses.get(p.plannedExpenseId),
        "planned expense",
        p.plannedExpenseId,
      );
      if (planned.status !== "pending") {
        throw new Error(`event ${eventId}: planned expense ${p.plannedExpenseId} is not pending`);
      }
      planned.status = "cancelled";
      planned.updatedAt = timestamp;
      planned.cancelledAt = timestamp;
      break;
    }
    case "planned_expense_completed": {
      const p = payload as unknown as {
        plannedExpenseId: string;
        transactionId: string;
        accountId: string;
        actualAmount: MoneyDTO;
        occurredAt: number;
      };
      const planned = required(
        acc.plannedExpenses.get(p.plannedExpenseId),
        "planned expense",
        p.plannedExpenseId,
      );
      if (planned.status !== "pending") {
        throw new Error(`event ${eventId}: planned expense ${p.plannedExpenseId} is not pending`);
      }
      const account = required(acc.accounts.get(p.accountId), "account", p.accountId);
      const category = required(acc.categories.get(planned.categoryId), "category", planned.categoryId);
      if (!account.isActive) throw new Error(`event ${eventId}: account ${p.accountId} is archived`);
      if (category.isArchived) throw new Error(`event ${eventId}: category ${planned.categoryId} is archived`);
      if (account.currency !== p.actualAmount.currency) {
        throw new Error(`event ${eventId}: planned expense currency mismatch`);
      }
      const transaction = required(acc.transactions.get(p.transactionId), "transaction", p.transactionId);
      if (
        transaction.accountId !== p.accountId ||
        transaction.categoryId !== planned.categoryId ||
        transaction.direction !== "expense" ||
        transaction.timestamp !== p.occurredAt ||
        transaction.amount.minorUnits !== p.actualAmount.minorUnits ||
        transaction.amount.currency !== p.actualAmount.currency
      ) {
        throw new Error(`event ${eventId}: completed transaction does not match planned expense`);
      }
      planned.status = "completed";
      planned.updatedAt = timestamp;
      planned.completedAt = p.occurredAt;
      planned.transactionId = p.transactionId;
      planned.completedAccountId = p.accountId;
      planned.actualAmount = { ...p.actualAmount };
      break;
    }
  }
}

export function validateDecryptedEventSequence(events: ReadonlyArray<{
  id: string;
  timestamp: number;
  type: FinancialEventType;
  payload: FinancialEventPayload;
}>): void {
  const accumulator = createEmptyAccumulator();
  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
  for (const event of sorted) {
    applyPayload(accumulator, event.type, event.payload, event.id, event.timestamp);
  }
}

function computeSnapshot(
  acc: Accumulator,
  asOfEventId: string,
  asOfTimestamp: number,
  currencyContext?: CurrencyContext
): FinancialStateSnapshot {
  const { start, end } = getPeriodBounds(asOfTimestamp);

  const accounts: AccountState[] = [];
  const categories: CategoryState[] = [];
  const budgetsList: BudgetState[] = [];
  const goalsList: GoalState[] = [];
  const recurringList: RecurringItemState[] = [];
  const debtCreditList: DebtCreditState[] = [];
  const plannedExpenseList: PlannedExpenseState[] = [];
  const transactionsList = [...acc.transactions.values()];
  const transactionsByCategory = new Map<string, TransactionFold[]>();
  for (const transaction of transactionsList) {
    const categoryTransactions = transactionsByCategory.get(transaction.categoryId);
    if (categoryTransactions == null) {
      transactionsByCategory.set(transaction.categoryId, [transaction]);
    } else {
      categoryTransactions.push(transaction);
    }
  }

  let inferredCurrency: string | null = null;

  for (const a of acc.accounts.values()) {
    accounts.push({ ...a });
    if (inferredCurrency == null && a.isActive) inferredCurrency = a.currency;
  }

  for (const c of acc.categories.values()) {
    categories.push({ ...c });
  }

  const contextBaseCurrency = currencyContext?.baseCurrency;
  const baseCurrency = contextBaseCurrency != null && contextBaseCurrency !== ""
    ? contextBaseCurrency
    : inferredCurrency ?? accounts[0]?.currency ?? "XOF";
  const effectiveCurrencyContext: CurrencyContext = currencyContext ?? {
    baseCurrency,
    rates: new Map(),
    fingerprint: baseCurrency,
  };
  const rateFingerprintIndex = currencyContext?.fingerprint.indexOf("|") ?? -1;
  const rateFingerprint = rateFingerprintIndex >= 0
    ? currencyContext?.fingerprint.slice(rateFingerprintIndex) ?? ""
    : "";
  const currencyContextId = `${baseCurrency}${rateFingerprint}`;
  const missingFxCurrencies = new Set<string>();
  const convertForAggregate = (amount: MoneyDTO, targetCurrency: string): MoneyDTO | null => {
    const converted = convertUsingContext(amount, targetCurrency, effectiveCurrencyContext);
    if (converted == null) missingFxCurrencies.add(amount.currency);
    return converted;
  };

  for (const b of acc.budgets.values()) {
    const budgetPeriod = getMonthBounds(b.periodMonth);
    const periodTxs = (transactionsByCategory.get(b.categoryId) ?? []).filter(
      (t) =>
        t.categoryId === b.categoryId &&
        t.timestamp >= budgetPeriod.start &&
        t.timestamp <= budgetPeriod.end
    );
    let spent = zeroMoney(b.limit.currency);
    for (const transaction of periodTxs) {
      if (transaction.direction !== "expense") continue;
      const converted = convertForAggregate(transaction.amount, b.limit.currency);
      if (converted != null) spent = addMoney(spent, converted);
    }
    budgetsList.push({
      ...b,
      spent,
    });
  }

  for (const g of acc.goals.values()) {
    goalsList.push({ ...g });
  }

  for (const r of acc.recurringItems.values()) {
    recurringList.push({ ...r });
  }

  for (const item of acc.debtCredits.values()) {
    debtCreditList.push({ ...item, amount: { ...item.amount } });
  }

  for (const item of acc.plannedExpenses.values()) {
    plannedExpenseList.push({
      ...item,
      estimatedAmount: { ...item.estimatedAmount },
      actualAmount: item.actualAmount == null ? null : { ...item.actualAmount },
    });
  }

  const periodTxs = transactionsList.filter(
    (t) => t.timestamp >= start && t.timestamp <= end
  );

  let totalBalance = zeroMoney(baseCurrency);
  for (const account of accounts) {
    if (!account.isActive) continue;
    const converted = convertForAggregate(account.balance, baseCurrency);
    if (converted != null) totalBalance = addMoney(totalBalance, converted);
  }

  let periodIncome = zeroMoney(baseCurrency);
  let periodExpenses = zeroMoney(baseCurrency);
  for (const transaction of periodTxs) {
    const converted = convertForAggregate(transaction.amount, baseCurrency);
    if (converted == null) continue;
    if (transaction.direction === "income") {
      periodIncome = addMoney(periodIncome, converted);
    } else {
      periodExpenses = addMoney(periodExpenses, converted);
    }
  }

  const netCashFlow = subMoney(periodIncome, periodExpenses);

  const categoryTotals: Record<string, MoneyDTO> = {};
  for (const t of periodTxs) {
    if (t.direction !== "expense") continue;
    const converted = convertForAggregate(t.amount, baseCurrency);
    if (converted == null) continue;
    const existing = categoryTotals[t.categoryId];
    categoryTotals[t.categoryId] = existing
      ? addMoney(existing, converted)
      : converted;
  }

  const budgetProgress: Record<string, {
    limit: MoneyDTO;
    spent: MoneyDTO;
    percentage: number;
  }> = {};
  for (const b of budgetsList) {
    if (!b.isArchived && b.periodMonth === toPeriodMonth(asOfTimestamp)) {
      budgetProgress[b.id] = {
        limit: b.limit,
        spent: b.spent,
        percentage: percentage(b.spent.minorUnits, b.limit.minorUnits),
      };
    }
  }

  const goalProgress: Record<string, {
    target: MoneyDTO;
    accumulated: MoneyDTO;
    percentage: number;
  }> = {};
  for (const g of goalsList) {
    if (!g.isArchived) {
      goalProgress[g.id] = {
        target: g.targetAmount,
        accumulated: g.accumulated,
        percentage: percentage(g.accumulated.minorUnits, g.targetAmount.minorUnits),
      };
    }
  }

  const projectedRecurring: {
    label: string;
    amount: MoneyDTO;
    dueDate: number;
  }[] = [];
  for (const r of recurringList) {
    if (r.isArchived) continue;
    const after = Math.max(asOfTimestamp, r.lastRealised ?? Number.MIN_SAFE_INTEGER);
    const nextDates = computeNextDueDates(r.frequency, r.startDate, after, 3);
    for (const d of nextDates) {
      projectedRecurring.push({
        label: r.label,
        amount: r.amount,
        dueDate: d,
      });
    }
  }

  return {
    version: 4,
    asOfEventId,
    asOfTimestamp,
    baseCurrency,
    currencyContextId,
    missingFxCurrencies: [...missingFxCurrencies].sort(),

    accounts,
    categories,
    budgets: budgetsList,
    goals: goalsList,
    recurringItems: recurringList,
    debtCredits: debtCreditList,
    transfers: [...acc.transfers].sort((a, b) => b.timestamp - a.timestamp || b.id.localeCompare(a.id)),
    plannedExpenses: plannedExpenseList,

    periodStart: start,
    periodEnd: end,

    totalBalance,
    periodIncome,
    periodExpenses,
    netCashFlow,

    categoryTotals,
    budgetProgress,
    goalProgress,
    projectedRecurring,
  };
}

function computeNextDueDates(
  frequency: "weekly" | "monthly" | "yearly",
  scheduleStart: number,
  after: number,
  count: number
): number[] {
  const results: number[] = [];
  let cursor = scheduleStart;
  const anchorDay = new Date(scheduleStart).getDate();

  while (cursor <= after) {
    cursor = advanceDueDate(frequency, cursor, anchorDay);
  }
  while (results.length < count) {
    results.push(cursor);
    cursor = advanceDueDate(frequency, cursor, anchorDay);
  }

  return results;
}

function advanceDueDate(
  frequency: "weekly" | "monthly" | "yearly",
  timestamp: number,
  anchorDay: number
): number {
  const date = new Date(timestamp);
  if (frequency === "weekly") {
    date.setDate(date.getDate() + 7);
    return date.getTime();
  }

  date.setDate(1);
  if (frequency === "monthly") {
    date.setMonth(date.getMonth() + 1);
  } else {
    date.setFullYear(date.getFullYear() + 1);
  }
  const lastDayOfTargetMonth = new Date(
    date.getFullYear(),
    date.getMonth() + 1,
    0
  ).getDate();
  date.setDate(Math.min(anchorDay, lastDayOfTargetMonth));
  return date.getTime();
}

export async function replayFromInception(
  events: FinancialEventRecord[],
  masterKey: MasterKey,
  asOfTimestamp?: number,
  currencyContext?: CurrencyContext
): Promise<FinancialStateSnapshot> {
  const acc = createEmptyAccumulator();
  const sortedEvents = [...events].sort(compareFinancialEvents);

  for (const event of sortedEvents) {
    const plaintext = await open(
      { ciphertext: event.ciphertext, iv: event.iv },
      masterKey
    );
    let payload: FinancialEventPayload;
    try {
      payload = JSON.parse(new TextDecoder().decode(plaintext)) as FinancialEventPayload;
    } finally {
      plaintext.fill(0);
    }

    applyPayload(acc, event.type as FinancialEventType, payload, event.id, event.timestamp);
  }

  const lastEvent = sortedEvents[sortedEvents.length - 1];

  return computeSnapshot(
    acc,
    lastEvent?.id ?? "none",
    asOfTimestamp ?? lastEvent?.timestamp ?? Date.now(),
    currencyContext
  );
}

export async function replayUpTo(
  targetTimestamp: number,
  masterKey: MasterKey
): Promise<FinancialStateSnapshot> {
  const events = await db.financialEvents
    .where("timestamp")
    .belowOrEqual(targetTimestamp)
    .sortBy("timestamp");
  const currencyContext = await loadCurrencyContext(masterKey, "");
  return replayFromInception(events, masterKey, targetTimestamp, currencyContext);
}

export type TransactionDisplay = {
  id: string;
  timestamp: number;
  accountId: string;
  categoryId: string;
  amount: MoneyDTO;
  displayAmount: MoneyDTO | null;
  direction: "income" | "expense";
  note: string;
  tags: string[];
  merchant: string;
};

export async function readTransactionsInRange(
  start: number,
  end: number,
  masterKey: MasterKey
): Promise<TransactionDisplay[]> {
  const transactionTypes = [
    "transaction_created",
    "transaction_updated",
    "transaction_deleted",
  ] as const;
  const eventGroups = await Promise.all(
    transactionTypes.map((type) =>
      db.financialEvents
        .where("[type+timestamp]")
        .between([type, 0], [type, Number.MAX_SAFE_INTEGER], true, true)
        .toArray()
    )
  );
  const events = eventGroups.flat().sort(compareFinancialEvents);
  const transactions = new Map<string, TransactionDisplay>();

  const decryptBatchSize = 32;
  const decoder = new TextDecoder();
  for (let offset = 0; offset < events.length; offset += decryptBatchSize) {
    const batch = events.slice(offset, offset + decryptBatchSize);
    const decodedBatch = await Promise.all(batch.map(async (event) => {
      const plaintext = await open(
        { ciphertext: event.ciphertext, iv: event.iv },
        masterKey
      );
      try {
        return {
          event,
          payload: JSON.parse(decoder.decode(plaintext)) as FinancialEventPayload,
        };
      } finally {
        plaintext.fill(0);
      }
    }));
    for (const { event, payload } of decodedBatch) {
      if (event.type === "transaction_deleted") {
        const deleted = payload as { originalEventId: string };
        transactions.delete(deleted.originalEventId);
        continue;
      }

      const transaction = payload as {
        originalEventId?: string;
        accountId: string;
        categoryId: string;
        amount: MoneyDTO;
        direction: "income" | "expense";
        note?: string | null;
        tags?: string[];
        merchant?: string | null;
        occurredAt?: number;
      };
      const originalEventId = transaction.originalEventId ?? event.id;
      const existing = transactions.get(originalEventId);
      if (event.type === "transaction_updated" && existing == null) continue;

      transactions.set(originalEventId, {
        id: originalEventId,
        timestamp: existing?.timestamp ?? transaction.occurredAt ?? event.timestamp,
        accountId: transaction.accountId,
        categoryId: transaction.categoryId,
        amount: positiveMoney(transaction.amount),
        displayAmount: null,
        direction: transaction.direction,
        note: transaction.note ?? "",
        tags: transaction.tags ?? [],
        merchant: transaction.merchant ?? "",
      });
    }
  }

  const results = [...transactions.values()].filter(
    (transaction) => transaction.timestamp >= start && transaction.timestamp <= end
  );
  const currencyContext = await loadCurrencyContext(masterKey, "");
  const displayCurrency = currencyContext.baseCurrency !== ""
    ? currencyContext.baseCurrency
    : results[0]?.amount.currency ?? "USD";
  for (const transaction of results) {
    transaction.displayAmount = convertUsingContext(
      transaction.amount,
      displayCurrency,
      currencyContext
    );
  }
  results.sort((a, b) => b.timestamp - a.timestamp || b.id.localeCompare(a.id));
  return results;
}

export async function isSnapshotFresh(
  snapshot: FinancialStateSnapshot,
  expectedCurrencyContextId?: string
): Promise<boolean> {
  if (snapshot.version !== 4) return false;
  const lastByTimestamp = await db.financialEvents
    .orderBy("timestamp")
    .last();

  const now = Date.now();
  if (!lastByTimestamp) {
    return (
      snapshot.asOfEventId === "none" &&
      (expectedCurrencyContextId == null || snapshot.currencyContextId === expectedCurrencyContextId) &&
      now >= snapshot.periodStart &&
      now <= snapshot.periodEnd
    );
  }

  const sameTimestampEvents = await db.financialEvents
    .where("timestamp")
    .equals(lastByTimestamp.timestamp)
    .toArray();
  const lastEvent = sameTimestampEvents.sort(compareFinancialEvents).at(-1);

  return (
    snapshot.asOfEventId === lastEvent?.id &&
    (expectedCurrencyContextId == null || snapshot.currencyContextId === expectedCurrencyContextId) &&
    now >= snapshot.periodStart &&
    now <= snapshot.periodEnd
  );
}

export async function getSnapshot(
  masterKey: MasterKey
): Promise<FinancialStateSnapshot> {
  const currencyContext = await loadCurrencyContext(masterKey, "");
  const cached = await db.financialStateSnapshot.get("current");

  if (cached) {
    let parsedSnapshot: unknown = null;
    try {
      const snapshotPlaintext = await open(
        { ciphertext: cached.ciphertext, iv: cached.iv },
        masterKey
      );
      try {
        try {
          parsedSnapshot = JSON.parse(new TextDecoder().decode(snapshotPlaintext)) as unknown;
        } catch (error) {
          if (!(error instanceof SyntaxError)) throw error;
        }
      } finally {
        snapshotPlaintext.fill(0);
      }
    } catch {
      // The snapshot is a disposable projection. A truncated or stale encrypted
      // cache must never prevent replaying the healthy encrypted event journal.
      parsedSnapshot = null;
    }

    if (
      parsedSnapshot != null &&
      typeof parsedSnapshot === "object" &&
      (parsedSnapshot as { version?: unknown }).version === 4
    ) {
      const snapshot = parsedSnapshot as FinancialStateSnapshot;
      const cachedBaseCurrency = snapshot.baseCurrency ?? snapshot.totalBalance.currency;
      const rateFingerprintIndex = currencyContext.fingerprint.indexOf("|");
      const rateFingerprint = rateFingerprintIndex >= 0
        ? currencyContext.fingerprint.slice(rateFingerprintIndex)
        : "";
      const expectedCurrencyContextId = currencyContext.baseCurrency
        ? currencyContext.fingerprint
        : `${cachedBaseCurrency}${rateFingerprint}`;
      const fresh = await isSnapshotFresh(snapshot, expectedCurrencyContextId);
      if (fresh) {
        return snapshot;
      }
    }
  }

  const events = await db.financialEvents.orderBy("timestamp").toArray();
  const snapshot = await replayFromInception(events, masterKey, Date.now(), currencyContext);
  await persistSnapshot(snapshot, masterKey);

  return snapshot;
}

export async function persistSnapshot(
  snapshot: FinancialStateSnapshot,
  masterKey: MasterKey
): Promise<void> {
  const plaintext = new TextEncoder().encode(JSON.stringify(snapshot));
  let ciphertext: Uint8Array;
  let iv: Uint8Array;
  try {
    ({ ciphertext, iv } = await seal(plaintext, masterKey));
  } finally {
    plaintext.fill(0);
  }

  await db.financialStateSnapshot.put({
    id: "current",
    asOfEventId: snapshot.asOfEventId,
    asOfTimestamp: snapshot.asOfTimestamp,
    ciphertext,
    iv,
  });
}

export function computeProjectedOccurrences(
  recurringItems: RecurringItemState[],
  asOfTimestamp: number
): {
  label: string;
  amount: MoneyDTO;
  dueDate: number;
}[] {
  const results: {
    label: string;
    amount: MoneyDTO;
    dueDate: number;
  }[] = [];

  for (const item of recurringItems) {
    if (item.isArchived) continue;
    const after = Math.max(asOfTimestamp, item.lastRealised ?? Number.MIN_SAFE_INTEGER);
    const dates = computeNextDueDates(item.frequency, item.startDate, after, 5);
    for (const d of dates) {
      results.push({
        label: item.label,
        amount: item.amount,
        dueDate: d,
      });
    }
  }

  results.sort((a, b) => a.dueDate - b.dueDate);
  return results;
}
