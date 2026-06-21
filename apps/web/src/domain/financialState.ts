import type { MasterKey } from "@/crypto/envelope.ts";
import { open, seal } from "@/crypto/envelope.ts";
import type { FinancialEventRecord } from "@/db/schema.ts";
import { db } from "@/db/schema.ts";
import type { FinancialEventPayload, FinancialEventType } from "./eventStore.ts";

export type MoneyDTO = {
  readonly minorUnits: number;
  readonly currency: string;
};

export type AccountState = {
  id: string;
  name: string;
  type: string;
  currency: string;
  isActive: boolean;
  balance: MoneyDTO;
  initialBalance: MoneyDTO;
};

export type CategoryState = {
  id: string;
  name: string;
  parentId: string | null;
  isSystemDefault: boolean;
};

export type BudgetState = {
  id: string;
  categoryId: string;
  limit: MoneyDTO;
  periodMonth: string;
  isArchived: boolean;
  spent: MoneyDTO;
};

export type GoalState = {
  id: string;
  name: string;
  targetAmount: MoneyDTO;
  targetDate: number | null;
  isArchived: boolean;
  accumulated: MoneyDTO;
};

export type RecurringItemState = {
  id: string;
  categoryId: string;
  label: string;
  amount: MoneyDTO;
  direction: "income" | "expense";
  frequency: "weekly" | "monthly" | "yearly";
  startDate: number;
  lastRealised: number | null;
};

export type FinancialStateSnapshot = {
  asOfEventId: string;
  asOfTimestamp: number;

  accounts: AccountState[];
  categories: CategoryState[];
  budgets: BudgetState[];
  goals: GoalState[];
  recurringItems: RecurringItemState[];

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
  return { minorUnits: a.minorUnits + b.minorUnits, currency: a.currency };
}

function subMoney(a: MoneyDTO, b: MoneyDTO): MoneyDTO {
  if (a.currency !== b.currency) {
    return a;
  }
  return { minorUnits: a.minorUnits - b.minorUnits, currency: a.currency };
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

type AccountFold = {
  id: string;
  name: string;
  type: string;
  currency: string;
  isActive: boolean;
  balance: MoneyDTO;
  initialBalance: MoneyDTO;
};

type Accumulator = {
  accounts: Map<string, AccountFold>;
  categories: Map<string, {
    id: string;
    name: string;
    parentId: string | null;
    isSystemDefault: boolean;
  }>;
  transactions: Array<{
    id: string;
    timestamp: number;
    accountId: string;
    categoryId: string;
    amount: MoneyDTO;
    direction: "income" | "expense";
  }>;
  budgets: Map<string, {
    id: string;
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
  recurringItems: Map<string, {
    id: string;
    categoryId: string;
    label: string;
    amount: MoneyDTO;
    direction: "income" | "expense";
    frequency: "weekly" | "monthly" | "yearly";
    startDate: number;
    lastRealised: number | null;
  }>;
};

function createEmptyAccumulator(): Accumulator {
  return {
    accounts: new Map(),
    categories: new Map(),
    transactions: [],
    budgets: new Map(),
    goals: new Map(),
    recurringItems: new Map(),
  };
}

function applyPayload(
  acc: Accumulator,
  type: FinancialEventType,
  payload: FinancialEventPayload,
  eventId: string,
  timestamp: number
): void {
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
    case "transaction_created": {
      const p = payload as unknown as {
        accountId: string;
        categoryId: string;
        amount: { minorUnits: number; currency: string };
        direction: "income" | "expense";
      };
      const amount: MoneyDTO = { minorUnits: p.amount.minorUnits, currency: p.amount.currency };
      const account = acc.accounts.get(p.accountId);
      if (account) {
        if (p.direction === "income") {
          account.balance = addMoney(account.balance, amount);
        } else {
          account.balance = subMoney(account.balance, amount);
        }
      }
      acc.transactions.push({
        id: eventId,
        timestamp,
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
      const oldTx = acc.transactions.find((t) => t.id === p.originalEventId);
      if (oldTx) {
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
        oldTx.amount = { minorUnits: p.amount.minorUnits, currency: p.amount.currency };
        oldTx.direction = p.direction;
        const newAccount = acc.accounts.get(p.accountId);
        if (newAccount) {
          if (p.direction === "income") {
            newAccount.balance = addMoney(newAccount.balance, oldTx.amount);
          } else {
            newAccount.balance = subMoney(newAccount.balance, oldTx.amount);
          }
        }
      }
      break;
    }
    case "transaction_deleted": {
      const p = payload as unknown as { originalEventId: string };
      const idx = acc.transactions.findIndex((t) => t.id === p.originalEventId);
      if (idx !== -1) {
        const tx = acc.transactions[idx]!;
        const account = acc.accounts.get(tx.accountId);
        if (account) {
          if (tx.direction === "income") {
            account.balance = subMoney(account.balance, tx.amount);
          } else {
            account.balance = addMoney(account.balance, tx.amount);
          }
        }
        acc.transactions.splice(idx, 1);
      }
      break;
    }
    case "category_created": {
      const p = payload as unknown as { name: string; parentId?: string; isSystemDefault?: boolean };
      acc.categories.set(eventId, {
        id: eventId,
        name: p.name,
        parentId: p.parentId ?? null,
        isSystemDefault: p.isSystemDefault ?? false,
      });
      break;
    }
    case "category_renamed": {
      const p = payload as unknown as { categoryId: string; newName: string };
      const cat = acc.categories.get(p.categoryId);
      if (cat) {
        cat.name = p.newName;
      }
      break;
    }
    case "budget_created": {
      const p = payload as unknown as {
        categoryId: string;
        limit: { minorUnits: number; currency: string };
        periodMonth: string;
      };
      acc.budgets.set(eventId, {
        id: eventId,
        categoryId: p.categoryId,
        limit: { minorUnits: p.limit.minorUnits, currency: p.limit.currency },
        periodMonth: p.periodMonth,
        isArchived: false,
      });
      break;
    }
    case "budget_archived": {
      const p = payload as unknown as { budgetId: string };
      const budget = acc.budgets.get(p.budgetId);
      if (budget) {
        budget.isArchived = true;
      }
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
      const goal = acc.goals.get(p.goalId);
      if (goal) {
        goal.accumulated = addMoney(goal.accumulated, {
          minorUnits: p.amount.minorUnits,
          currency: p.amount.currency,
        });
      }
      break;
    }
    case "goal_archived": {
      const p = payload as unknown as { goalId: string };
      const goal = acc.goals.get(p.goalId);
      if (goal) {
        goal.isArchived = true;
      }
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
      acc.recurringItems.set(eventId, {
        id: eventId,
        categoryId: p.categoryId,
        label: p.label,
        amount: { minorUnits: p.amount.minorUnits, currency: p.amount.currency },
        direction: p.direction,
        frequency: p.frequency,
        startDate: p.startDate,
        lastRealised: null,
      });
      break;
    }
    case "recurring_item_realised": {
      const p = payload as unknown as { itemId: string; amount?: { minorUnits: number; currency: string }; date: number };
      const item = acc.recurringItems.get(p.itemId);
      if (item) {
        item.lastRealised = p.date;
        if (p.amount) {
          item.amount = { minorUnits: p.amount.minorUnits, currency: p.amount.currency };
        }
      }
      break;
    }
  }
}

function computeSnapshot(acc: Accumulator, asOfEventId: string, asOfTimestamp: number): FinancialStateSnapshot {
  const { start, end } = getPeriodBounds(asOfTimestamp);

  const accounts: AccountState[] = [];
  const categories: CategoryState[] = [];
  const budgetsList: BudgetState[] = [];
  const goalsList: GoalState[] = [];
  const recurringList: RecurringItemState[] = [];

  let defaultCurrency = "USD";

  for (const a of acc.accounts.values()) {
    accounts.push({ ...a });
    defaultCurrency = a.currency;
  }

  for (const c of acc.categories.values()) {
    categories.push({ ...c });
  }

  for (const b of acc.budgets.values()) {
    const periodTxs = acc.transactions.filter(
      (t) =>
        t.categoryId === b.categoryId &&
        t.timestamp >= start &&
        t.timestamp <= end
    );
    const spent = periodTxs.reduce(
      (sum, t) =>
        t.direction === "expense"
          ? addMoney(sum, t.amount)
          : sum,
      zeroMoney(b.limit.currency)
    );
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

  const periodTxs = acc.transactions.filter(
    (t) => t.timestamp >= start && t.timestamp <= end
  );

  const totalBalance = accounts.reduce(
    (sum, a) => addMoney(sum, a.balance),
    zeroMoney(defaultCurrency)
  );

  const periodIncome = periodTxs
    .filter((t) => t.direction === "income")
    .reduce((sum, t) => addMoney(sum, t.amount), zeroMoney(defaultCurrency));

  const periodExpenses = periodTxs
    .filter((t) => t.direction === "expense")
    .reduce((sum, t) => addMoney(sum, t.amount), zeroMoney(defaultCurrency));

  const netCashFlow = subMoney(periodIncome, periodExpenses);

  const categoryTotals: Record<string, MoneyDTO> = {};
  for (const t of periodTxs) {
    const existing = categoryTotals[t.categoryId];
    categoryTotals[t.categoryId] = existing
      ? addMoney(existing, t.amount)
      : { ...t.amount };
  }

  const budgetProgress: Record<string, {
    limit: MoneyDTO;
    spent: MoneyDTO;
    percentage: number;
  }> = {};
  for (const b of budgetsList) {
    if (!b.isArchived) {
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
    const last = r.lastRealised ?? r.startDate;
    const nextDates = computeNextDueDates(r.frequency, last, asOfTimestamp, 3);
    for (const d of nextDates) {
      projectedRecurring.push({
        label: r.label,
        amount: r.amount,
        dueDate: d,
      });
    }
  }

  return {
    asOfEventId,
    asOfTimestamp,

    accounts,
    categories,
    budgets: budgetsList,
    goals: goalsList,
    recurringItems: recurringList,

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
  since: number,
  now: number,
  count: number
): number[] {
  const results: number[] = [];
  let cursor = since;

  for (let i = 0; i < count; i++) {
    const d = new Date(cursor);
    switch (frequency) {
      case "weekly":
        d.setDate(d.getDate() + 7);
        break;
      case "monthly":
        d.setMonth(d.getMonth() + 1);
        break;
      case "yearly":
        d.setFullYear(d.getFullYear() + 1);
        break;
    }
    cursor = d.getTime();
    if (cursor > now) {
      results.push(cursor);
    }
  }

  return results;
}

export async function replayFromInception(
  events: FinancialEventRecord[],
  masterKey: MasterKey
): Promise<FinancialStateSnapshot> {
  const acc = createEmptyAccumulator();

  for (const event of events) {
    const plaintext = await open(
      { ciphertext: event.ciphertext, iv: event.iv },
      masterKey
    );
    const payload = JSON.parse(
      new TextDecoder().decode(plaintext)
    ) as FinancialEventPayload;

    applyPayload(acc, event.type as FinancialEventType, payload, event.id, event.timestamp);
  }

  const sortedEvents = [...events].sort((a, b) => {
    if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
    return a.id.localeCompare(b.id);
  });
  const lastEvent = sortedEvents[sortedEvents.length - 1];

  return computeSnapshot(
    acc,
    lastEvent?.id ?? "none",
    lastEvent?.timestamp ?? Date.now()
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
  return replayFromInception(events, masterKey);
}

export type TransactionDisplay = {
  id: string;
  timestamp: number;
  accountId: string;
  categoryId: string;
  amount: MoneyDTO;
  direction: "income" | "expense";
};

export async function readTransactionsInRange(
  start: number,
  end: number,
  masterKey: MasterKey
): Promise<TransactionDisplay[]> {
  const events = await db.financialEvents
    .where("[type+timestamp]")
    .between(["transaction_created", start], ["transaction_created", end])
    .toArray();

  const results: TransactionDisplay[] = [];
  for (const event of events) {
    const plaintext = await open(
      { ciphertext: event.ciphertext, iv: event.iv },
      masterKey
    );
    const payload = JSON.parse(
      new TextDecoder().decode(plaintext)
    ) as {
      accountId: string;
      categoryId: string;
      amount: { minorUnits: number; currency: string };
      direction: "income" | "expense";
    };
    results.push({
      id: event.id,
      timestamp: event.timestamp,
      accountId: payload.accountId,
      categoryId: payload.categoryId,
      amount: payload.amount,
      direction: payload.direction,
    });
  }

  results.sort((a, b) => b.timestamp - a.timestamp);
  return results;
}

export async function applyEventToSnapshot(
  current: FinancialStateSnapshot,
  event: FinancialEventRecord,
  masterKey: MasterKey
): Promise<FinancialStateSnapshot> {
  const plaintext = await open(
    { ciphertext: event.ciphertext, iv: event.iv },
    masterKey
  );
  const payload = JSON.parse(
      new TextDecoder().decode(plaintext)
    ) as FinancialEventPayload;

  const acc = createEmptyAccumulator();

  for (const a of current.accounts) {
    acc.accounts.set(a.id, { ...a });
  }
  for (const c of current.categories) {
    acc.categories.set(c.id, { ...c });
  }
  for (const b of current.budgets) {
    acc.budgets.set(b.id, { ...b });
  }
  for (const g of current.goals) {
    acc.goals.set(g.id, { ...g });
  }
  for (const r of current.recurringItems) {
    acc.recurringItems.set(r.id, { ...r });
  }

  applyPayload(acc, event.type as FinancialEventType, payload, event.id, event.timestamp);

  return computeSnapshot(acc, event.id, event.timestamp);
}

export async function isSnapshotFresh(
  snapshot: FinancialStateSnapshot
): Promise<boolean> {
  const lastEvent = await db.financialEvents
    .orderBy("timestamp")
    .last();

  if (!lastEvent) {
    return snapshot.asOfEventId === "none";
  }

  return snapshot.asOfEventId === lastEvent.id;
}

export async function getSnapshot(
  masterKey: MasterKey
): Promise<FinancialStateSnapshot> {
  const cached = await db.financialStateSnapshot.get("current");

  if (cached) {
    const snapshotPlaintext = await open(
      { ciphertext: cached.ciphertext, iv: cached.iv },
      masterKey
    );
    const snapshot = JSON.parse(
      new TextDecoder().decode(snapshotPlaintext)
    ) as FinancialStateSnapshot;

    const fresh = await isSnapshotFresh(snapshot);
    if (fresh) {
      return snapshot;
    }
  }

  const events = await db.financialEvents.orderBy("timestamp").toArray();
  const snapshot = await replayFromInception(events, masterKey);
  await persistSnapshot(snapshot, masterKey);

  return snapshot;
}

export async function persistSnapshot(
  snapshot: FinancialStateSnapshot,
  masterKey: MasterKey
): Promise<void> {
  const plaintext = new TextEncoder().encode(JSON.stringify(snapshot));
  const { ciphertext, iv } = await seal(plaintext, masterKey);

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
    const last = item.lastRealised ?? item.startDate;
    const dates = computeNextDueDates(item.frequency, last, asOfTimestamp, 5);
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
