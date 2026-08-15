import type { MasterKey } from "@/crypto/envelope.ts";
import { open, seal } from "@/crypto/envelope.ts";
import { db } from "@/db/schema.ts";
import { getSnapshot, readTransactionsInRange } from "@/domain/financialState.ts";
import type { DebtCreditState, PlannedExpenseState } from "@/domain/financialState.ts";
import { compareFinancialEvents } from "@/domain/eventStore.ts";
import { formatMoney } from "@/types/money.ts";
import { exportJSON } from "./index.ts";

const CYCLE_HISTORY_SETTING_ID = "cycleHistory";
const MAX_CYCLE_HISTORY = 50;

export type CycleOverview = {
  eventCount: number;
  activityCount: number;
  startedAt: number | null;
  endedAt: number | null;
  lastEventId: string | null;
};

export type CycleArchiveReceipt = CycleOverview & {
  version: 1;
  id: string;
  label: string;
  archivedAt: number;
  backupSha256: string;
  backupFilename: string;
  reportFilename: string;
};

export type PreparedCycleArchive = CycleArchiveReceipt & {
  backup: Blob;
  report: Blob;
};

type CycleArchiveOptions = {
  now?: number;
  id?: string;
  locale?: string;
};

type ReportLabels = {
  summary: string;
  transactions: string;
  plannedExpenses: string;
  debtCredits: string;
  accounts: string;
  budgets: string;
  goals: string;
  budget: string;
  goal: string;
  field: string;
  value: string;
  archiveName: string;
  archiveId: string;
  generatedAt: string;
  cycleStart: string;
  cycleEnd: string;
  eventCount: string;
  checksum: string;
  baseCurrency: string;
  totalBalance: string;
  periodIncome: string;
  periodExpenses: string;
  netCashFlow: string;
  date: string;
  direction: string;
  income: string;
  expense: string;
  account: string;
  category: string;
  merchant: string;
  note: string;
  tags: string;
  amount: string;
  convertedAmount: string;
  currency: string;
  status: string;
  active: string;
  archived: string;
  type: string;
  initialBalance: string;
  currentBalance: string;
  period: string;
  limit: string;
  spent: string;
  target: string;
  accumulated: string;
  targetDate: string;
  label: string;
  priority: string;
  estimatedAmount: string;
  dueDate: string;
  actualAmount: string;
  completedAt: string;
  partyName: string;
  motive: string;
  receivable: string;
  debt: string;
  partial: string;
  settled: string;
  pending: string;
  completed: string;
  cancelled: string;
  low: string;
  medium: string;
  high: string;
};

function labelsFor(locale: string): ReportLabels {
  if (locale.toLowerCase().startsWith("fr")) {
    return {
      summary: "Synthèse", transactions: "Transactions", plannedExpenses: "Dépenses prévues", debtCredits: "Dettes & Créances", accounts: "Comptes", budgets: "Budgets", goals: "Objectifs",
      budget: "Budget", goal: "Objectif",
      field: "Champ", value: "Valeur", archiveName: "Nom du cycle", archiveId: "Identifiant de l’archive",
      generatedAt: "Archive générée le", cycleStart: "Début du cycle", cycleEnd: "Fin du cycle",
      eventCount: "Événements du journal", checksum: "Empreinte SHA-256 du backup", baseCurrency: "Devise principale",
      totalBalance: "Solde total", periodIncome: "Entrées de la période", periodExpenses: "Dépenses de la période",
      netCashFlow: "Flux net", date: "Date", direction: "Sens", income: "Entrée", expense: "Dépense",
      account: "Compte", category: "Catégorie", merchant: "Marchand", note: "Note", tags: "Étiquettes",
      amount: "Montant", convertedAmount: "Montant en devise principale", currency: "Devise", status: "Statut",
      active: "Actif", archived: "Archivé", type: "Type", initialBalance: "Solde initial", currentBalance: "Solde actuel",
      period: "Période", limit: "Limite", spent: "Dépensé", target: "Cible", accumulated: "Accumulation",
      targetDate: "Date cible", label: "Libellé", priority: "Priorité", estimatedAmount: "Montant estimé",
      dueDate: "Échéance", actualAmount: "Montant réel", completedAt: "Date de réalisation",
      partyName: "Personne", motive: "Motif", receivable: "Créance", debt: "Dette", partial: "Partiellement payé", settled: "Soldé",
      pending: "En attente", completed: "Réalisée", cancelled: "Annulée",
      low: "Faible", medium: "Moyenne", high: "Haute",
    };
  }
  return {
    summary: "Summary", transactions: "Transactions", plannedExpenses: "Planned expenses", debtCredits: "Debts & Receivables", accounts: "Accounts", budgets: "Budgets", goals: "Goals",
    budget: "Budget", goal: "Goal",
    field: "Field", value: "Value", archiveName: "Cycle name", archiveId: "Archive ID", generatedAt: "Archive generated at",
    cycleStart: "Cycle start", cycleEnd: "Cycle end", eventCount: "Journal events", checksum: "Backup SHA-256",
    baseCurrency: "Base currency", totalBalance: "Total balance", periodIncome: "Period income",
    periodExpenses: "Period expenses", netCashFlow: "Net cash flow", date: "Date", direction: "Direction",
    income: "Income", expense: "Expense", account: "Account", category: "Category", merchant: "Merchant", note: "Note",
    tags: "Tags", amount: "Amount", convertedAmount: "Amount in base currency", currency: "Currency", status: "Status",
    active: "Active", archived: "Archived", type: "Type", initialBalance: "Initial balance", currentBalance: "Current balance",
    period: "Period", limit: "Limit", spent: "Spent", target: "Target", accumulated: "Accumulated", targetDate: "Target date",
    label: "Label", priority: "Priority", estimatedAmount: "Estimated amount", dueDate: "Due date",
    actualAmount: "Actual amount", completedAt: "Completion date", pending: "Pending", completed: "Completed",
    partyName: "Person", motive: "Motive", receivable: "Receivable", debt: "Debt", partial: "Partially paid", settled: "Settled",
    cancelled: "Cancelled", low: "Low", medium: "Medium", high: "High",
  };
}

function headerRow(values: string[]) {
  return values.map((value) => ({
    value,
    fontWeight: "bold" as const,
    textColor: "#FFFFFF",
    backgroundColor: "#002FA7",
  }));
}

function valueRows(rows: Array<Array<string | number>>) {
  return rows.map((row) => row.map((value) => ({ value })));
}

function formatDate(timestamp: number | null, locale: string): string {
  if (timestamp == null) return "—";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(timestamp);
}

function formatCalendarDate(timestamp: number | null, locale: string): string {
  if (timestamp == null) return "—";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(timestamp);
}

export function createPlannedExpenseReportSheet(
  plannedExpenses: readonly PlannedExpenseState[],
  locale: string,
) {
  const labels = labelsFor(locale);
  const rows = plannedExpenses.map((plannedExpense) => [
    plannedExpense.label,
    labels[plannedExpense.priority],
    formatMoney(plannedExpense.estimatedAmount, locale),
    formatDate(plannedExpense.dueDate, locale),
    labels[plannedExpense.status],
    plannedExpense.actualAmount == null ? "—" : formatMoney(plannedExpense.actualAmount, locale),
    formatDate(plannedExpense.completedAt, locale),
  ]);

  return {
    sheet: labels.plannedExpenses,
    data: [
      headerRow([
        labels.label,
        labels.priority,
        labels.estimatedAmount,
        labels.dueDate,
        labels.status,
        labels.actualAmount,
        labels.completedAt,
      ]),
      ...valueRows(rows),
    ],
    columns: [
      { width: 34 },
      { width: 14 },
      { width: 22 },
      { width: 22 },
      { width: 16 },
      { width: 22 },
      { width: 22 },
    ],
    showGridLines: false,
  };
}

export function createDebtCreditReportSheet(
  debtCredits: readonly DebtCreditState[],
  locale: string,
) {
  const labels = labelsFor(locale);
  const rows = debtCredits.map((item) => [
    labels[item.kind],
    item.partyName,
    item.motive,
    formatMoney(item.amount, locale),
    formatCalendarDate(item.date, locale),
    formatCalendarDate(item.dueDate, locale),
    labels[item.status],
  ]);

  return {
    sheet: labels.debtCredits,
    data: [
      headerRow([
        labels.type,
        labels.partyName,
        labels.motive,
        labels.amount,
        labels.date,
        labels.dueDate,
        labels.status,
      ]),
      ...valueRows(rows),
    ],
    columns: [
      { width: 18 },
      { width: 28 },
      { width: 36 },
      { width: 22 },
      { width: 22 },
      { width: 22 },
      { width: 20 },
    ],
    showGridLines: false,
  };
}

function slugify(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "cycle";
}

function isCycleReceipt(value: unknown): value is CycleArchiveReceipt {
  if (value == null || typeof value !== "object") return false;
  const item = value as Partial<CycleArchiveReceipt>;
  return item.version === 1 && typeof item.id === "string" && item.id.length > 0 &&
    typeof item.label === "string" && item.label.length > 0 && Number.isSafeInteger(item.archivedAt) &&
    Number.isSafeInteger(item.eventCount) && item.eventCount! > 0 &&
    Number.isSafeInteger(item.activityCount) && item.activityCount! > 0 && item.activityCount! <= item.eventCount! &&
    (item.startedAt == null || Number.isSafeInteger(item.startedAt)) &&
    (item.endedAt == null || Number.isSafeInteger(item.endedAt)) &&
    typeof item.lastEventId === "string" && item.lastEventId.length > 0 &&
    typeof item.backupSha256 === "string" && /^[a-f0-9]{64}$/.test(item.backupSha256) &&
    typeof item.backupFilename === "string" && item.backupFilename.endsWith(".wmexport") &&
    typeof item.reportFilename === "string" && item.reportFilename.endsWith(".xlsx");
}

async function sha256(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function getCycleOverview(): Promise<CycleOverview> {
  const events = (await db.financialEvents.toArray()).sort(compareFinancialEvents);
  const activityEvents = events.filter((event) => !event.type.startsWith("category_"));
  const firstActivity = activityEvents[0];
  const lastActivity = activityEvents.at(-1);
  const lastEvent = events.at(-1);
  return {
    eventCount: events.length,
    activityCount: activityEvents.length,
    startedAt: firstActivity?.timestamp ?? null,
    endedAt: lastActivity?.timestamp ?? null,
    lastEventId: lastEvent?.id ?? null,
  };
}

export async function readCycleHistory(masterKey: MasterKey): Promise<CycleArchiveReceipt[]> {
  const record = await db.appSettings.get(CYCLE_HISTORY_SETTING_ID);
  if (record == null) return [];
  const plaintext = await open({ ciphertext: record.ciphertext, iv: record.iv }, masterKey);
  try {
    const parsed = JSON.parse(new TextDecoder().decode(plaintext)) as unknown;
    if (!Array.isArray(parsed) || !parsed.every(isCycleReceipt)) {
      throw new Error("cycleHistory: invalid stored history");
    }
    return parsed;
  } finally {
    plaintext.fill(0);
  }
}

async function createCycleReport(
  masterKey: MasterKey,
  receipt: CycleArchiveReceipt,
  locale: string,
): Promise<Blob> {
  const labels = labelsFor(locale);
  const [snapshot, transactions] = await Promise.all([
    getSnapshot(masterKey),
    readTransactionsInRange(0, receipt.archivedAt, masterKey),
  ]);
  const accountNames = new Map(snapshot.accounts.map((account) => [account.id, account.name]));
  const categoryNames = new Map(snapshot.categories.map((category) => [category.id, category.name]));

  const summaryRows: Array<Array<string | number>> = [
    [labels.archiveName, receipt.label],
    [labels.archiveId, receipt.id],
    [labels.generatedAt, formatDate(receipt.archivedAt, locale)],
    [labels.cycleStart, formatDate(receipt.startedAt, locale)],
    [labels.cycleEnd, formatDate(receipt.endedAt, locale)],
    [labels.eventCount, receipt.eventCount],
    [labels.checksum, receipt.backupSha256],
    [labels.baseCurrency, snapshot.baseCurrency],
    [labels.totalBalance, formatMoney(snapshot.totalBalance, locale)],
    [labels.periodIncome, formatMoney(snapshot.periodIncome, locale)],
    [labels.periodExpenses, formatMoney(snapshot.periodExpenses, locale)],
    [labels.netCashFlow, formatMoney(snapshot.netCashFlow, locale)],
  ];
  const transactionRows = transactions
    .sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id))
    .map((transaction) => [
      formatDate(transaction.timestamp, locale),
      transaction.direction === "income" ? labels.income : labels.expense,
      accountNames.get(transaction.accountId) ?? transaction.accountId,
      categoryNames.get(transaction.categoryId) ?? transaction.categoryId,
      transaction.merchant,
      transaction.note,
      transaction.tags.join(", "),
      formatMoney(transaction.amount, locale),
      transaction.displayAmount == null ? "—" : formatMoney(transaction.displayAmount, locale),
      transaction.id,
    ]);
  const accountRows = snapshot.accounts.map((account) => [
    account.name,
    account.type,
    account.currency,
    formatMoney(account.initialBalance, locale),
    formatMoney(account.balance, locale),
    account.isActive ? labels.active : labels.archived,
  ]);
  const budgetRows = snapshot.budgets.map((budget) => [
    budget.name,
    categoryNames.get(budget.categoryId) ?? budget.categoryId,
    budget.periodMonth,
    formatMoney(budget.limit, locale),
    formatMoney(budget.spent, locale),
    budget.isArchived ? labels.archived : labels.active,
  ]);
  const goalRows = snapshot.goals.map((goal) => [
    goal.name,
    formatMoney(goal.targetAmount, locale),
    formatMoney(goal.accumulated, locale),
    goal.targetDate == null ? "—" : formatDate(goal.targetDate, locale),
    goal.isArchived ? labels.archived : labels.active,
  ]);

  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const workbook = writeXlsxFile([
    {
      sheet: labels.summary,
      data: [headerRow([labels.field, labels.value]), ...valueRows(summaryRows)],
      columns: [{ width: 34 }, { width: 72 }],
      showGridLines: false,
    },
    {
      sheet: labels.transactions,
      data: [
        headerRow([labels.date, labels.direction, labels.account, labels.category, labels.merchant, labels.note, labels.tags, labels.amount, labels.convertedAmount, "ID"]),
        ...valueRows(transactionRows),
      ],
      columns: [{ width: 22 }, { width: 12 }, { width: 24 }, { width: 24 }, { width: 22 }, { width: 36 }, { width: 24 }, { width: 20 }, { width: 26 }, { width: 38 }],
      showGridLines: false,
    },
    createPlannedExpenseReportSheet(snapshot.plannedExpenses, locale),
    createDebtCreditReportSheet(snapshot.debtCredits, locale),
    {
      sheet: labels.accounts,
      data: [headerRow([labels.account, labels.type, labels.currency, labels.initialBalance, labels.currentBalance, labels.status]), ...valueRows(accountRows)],
      columns: [{ width: 28 }, { width: 20 }, { width: 12 }, { width: 20 }, { width: 20 }, { width: 14 }],
      showGridLines: false,
    },
    {
      sheet: labels.budgets,
      data: [headerRow([labels.budget, labels.category, labels.period, labels.limit, labels.spent, labels.status]), ...valueRows(budgetRows)],
      columns: [{ width: 28 }, { width: 24 }, { width: 14 }, { width: 20 }, { width: 20 }, { width: 14 }],
      showGridLines: false,
    },
    {
      sheet: labels.goals,
      data: [headerRow([labels.goal, labels.target, labels.accumulated, labels.targetDate, labels.status]), ...valueRows(goalRows)],
      columns: [{ width: 30 }, { width: 20 }, { width: 20 }, { width: 22 }, { width: 14 }],
      showGridLines: false,
    },
  ]);
  return workbook.toBlob();
}

export async function prepareCycleArchive(
  masterKey: MasterKey,
  label: string,
  passphrase: string,
  options: CycleArchiveOptions = {},
): Promise<PreparedCycleArchive> {
  const normalizedLabel = label.trim();
  if (normalizedLabel.length === 0 || normalizedLabel.length > 80) {
    throw new Error("cycleArchive: label must contain between 1 and 80 characters");
  }
  if (passphrase.length < 8) {
    throw new Error("cycleArchive: passphrase must contain at least 8 characters");
  }
  const overview = await getCycleOverview();
  if (overview.activityCount === 0 || overview.lastEventId == null) {
    throw new Error("cycleArchive: no financial data to archive");
  }
  const archivedAt = options.now ?? Date.now();
  const id = options.id ?? crypto.randomUUID();
  const date = new Date(archivedAt).toISOString().slice(0, 10);
  const stem = `wisemoney-${slugify(normalizedLabel)}-${date}`;
  const backup = await exportJSON(masterKey, true, passphrase);
  if (backup.size === 0) throw new Error("cycleArchive: empty backup");
  const receipt: CycleArchiveReceipt = {
    version: 1,
    id,
    label: normalizedLabel,
    archivedAt,
    ...overview,
    backupSha256: await sha256(backup),
    backupFilename: `${stem}.wmexport`,
    reportFilename: `${stem}.xlsx`,
  };
  const report = await createCycleReport(masterKey, receipt, options.locale ?? "en");
  const signature = new Uint8Array(await report.slice(0, 4).arrayBuffer());
  if (String.fromCharCode(...signature) !== "PK\u0003\u0004") {
    throw new Error("cycleArchive: invalid XLSX report");
  }
  return { ...receipt, backup, report };
}

export async function closeFinancialCycle(
  masterKey: MasterKey,
  receipt: PreparedCycleArchive,
): Promise<void> {
  if (!isCycleReceipt(receipt)) throw new Error("cycleArchive: invalid receipt");
  if (!(receipt.backup instanceof Blob) || receipt.backup.size === 0 ||
      await sha256(receipt.backup) !== receipt.backupSha256) {
    throw new Error("cycleArchive: invalid backup");
  }
  if (!(receipt.report instanceof Blob) || receipt.report.size === 0) {
    throw new Error("cycleArchive: invalid XLSX report");
  }
  const reportSignature = new Uint8Array(await receipt.report.slice(0, 4).arrayBuffer());
  if (String.fromCharCode(...reportSignature) !== "PK\u0003\u0004") {
    throw new Error("cycleArchive: invalid XLSX report");
  }
  const storedReceipt: CycleArchiveReceipt = {
    version: receipt.version,
    id: receipt.id,
    label: receipt.label,
    archivedAt: receipt.archivedAt,
    eventCount: receipt.eventCount,
    activityCount: receipt.activityCount,
    startedAt: receipt.startedAt,
    endedAt: receipt.endedAt,
    lastEventId: receipt.lastEventId,
    backupSha256: receipt.backupSha256,
    backupFilename: receipt.backupFilename,
    reportFilename: receipt.reportFilename,
  };
  const history = await readCycleHistory(masterKey);
  const nextHistory = [storedReceipt, ...history.filter((item) => item.id !== receipt.id)].slice(0, MAX_CYCLE_HISTORY);
  const plaintext = new TextEncoder().encode(JSON.stringify(nextHistory));
  let encryptedHistory: Awaited<ReturnType<typeof seal>>;
  try {
    encryptedHistory = await seal(plaintext, masterKey);
  } finally {
    plaintext.fill(0);
  }

  await db.transaction("rw", [db.financialEvents, db.financialStateSnapshot, db.appSettings], async () => {
    const currentEvents = (await db.financialEvents.toArray()).sort(compareFinancialEvents);
    const currentLastEvent = currentEvents.at(-1);
    if (currentEvents.length !== receipt.eventCount || currentLastEvent?.id !== receipt.lastEventId) {
      throw new Error("cycleArchive: financial data changed after archive generation");
    }
    await db.financialEvents.clear();
    await db.financialStateSnapshot.clear();
    await db.appSettings.put({
      id: CYCLE_HISTORY_SETTING_ID,
      ciphertext: encryptedHistory.ciphertext,
      iv: encryptedHistory.iv,
    });
  });
}
