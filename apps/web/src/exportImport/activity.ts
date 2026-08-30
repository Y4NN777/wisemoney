import type { FinancialOperation, FinancialOperationKind } from "../domain/financialOperations.ts";
import { operationAmountForAccount, operationEffect } from "../analytics/operations.ts";
import { currencyFractionDigits } from "../types/money.ts";

export type ActivityExportLocale = "fr" | "en";

export type ActivityExportContext = {
  operations: readonly FinancialOperation[];
  start: number;
  end: number;
  accountId: string | null;
  locale: ActivityExportLocale;
  accounts: Readonly<Record<string, string>>;
  categories: Readonly<Record<string, string>>;
};

type ActivityRow = {
  date: string;
  type: string;
  source: string;
  destination: string;
  category: string;
  description: string;
  sourceAmount: number | null;
  sourceCurrency: string;
  destinationAmount: number | null;
  destinationCurrency: string;
  displayAmount: number | null;
  displayCurrency: string;
  effect: string;
};

const LABELS = {
  fr: {
    sheet: "Activité",
    headers: ["Date", "Type", "Compte source", "Destination", "Catégorie", "Description", "Montant source", "Devise source", "Montant destination", "Devise destination", "Montant affiché", "Devise affichée", "Effet"],
    kinds: { income: "Revenu", expense: "Dépense", planned_expense: "Dépense prévue réalisée", transfer: "Transfert interne", goal_contribution: "Contribution à un objectif", recurring_realisation: "Élément récurrent réalisé" } satisfies Record<FinancialOperationKind, string>,
    legacyExpense: "Dépense non classée",
    uncategorized: "Non classé",
    effects: { incoming: "entrée", outgoing: "sortie", neutral: "neutre" },
  },
  en: {
    sheet: "Activity",
    headers: ["Date", "Type", "Source account", "Destination", "Category", "Description", "Source amount", "Source currency", "Destination amount", "Destination currency", "Display amount", "Display currency", "Effect"],
    kinds: { income: "Income", expense: "Expense", planned_expense: "Completed planned expense", transfer: "Internal transfer", goal_contribution: "Goal contribution", recurring_realisation: "Completed recurring item" } satisfies Record<FinancialOperationKind, string>,
    legacyExpense: "Uncategorized expense",
    uncategorized: "Uncategorized",
    effects: { incoming: "incoming", outgoing: "outgoing", neutral: "neutral" },
  },
} as const;

function majorUnits(minorUnits: number, currency: string): number {
  return minorUnits / 10 ** currencyFractionDigits(currency);
}

function csvCell(value: unknown): string {
  const text = typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

function activityRows(context: ActivityExportContext): ActivityRow[] {
  const labels = LABELS[context.locale];
  return context.operations
    .filter((operation) => operation.timestamp >= context.start && operation.timestamp <= context.end)
    .filter((operation) => context.accountId == null || operation.accountId === context.accountId || operation.toAccountId === context.accountId)
    .map((operation) => {
      const effect = operationEffect(operation, context.accountId);
      const contextualAmount = operationAmountForAccount(operation, context.accountId);
      const sourceAmount = operation.amount;
      const destinationAmount = operation.destinationAmount;
      const description = operation.merchant ?? operation.note;
      return {
        date: new Date(operation.timestamp).toISOString(),
        type: operation.isLegacyExternal ? labels.legacyExpense : labels.kinds[operation.kind],
        source: operation.accountId == null ? "" : context.accounts[operation.accountId] ?? "",
        destination: operation.toAccountId == null
          ? operation.externalDestination ?? operation.merchant ?? ""
          : context.accounts[operation.toAccountId] ?? "",
        category: operation.categoryId == null ? (operation.cashFlowRole === "expense" ? labels.uncategorized : "") : context.categories[operation.categoryId] ?? labels.uncategorized,
        description,
        sourceAmount: sourceAmount == null ? null : majorUnits(sourceAmount.minorUnits, sourceAmount.currency),
        sourceCurrency: sourceAmount?.currency ?? "",
        destinationAmount: destinationAmount == null ? null : majorUnits(destinationAmount.minorUnits, destinationAmount.currency),
        destinationCurrency: destinationAmount?.currency ?? "",
        displayAmount: contextualAmount == null ? null : majorUnits(contextualAmount.minorUnits, contextualAmount.currency),
        displayCurrency: contextualAmount?.currency ?? "",
        effect: labels.effects[effect],
      };
    });
}

function rowValues(row: ActivityRow): Array<string | number | null> {
  return [
    row.date,
    row.type,
    row.source,
    row.destination,
    row.category,
    row.description,
    row.sourceAmount,
    row.sourceCurrency,
    row.destinationAmount,
    row.destinationCurrency,
    row.displayAmount,
    row.displayCurrency,
    row.effect,
  ];
}

export function exportActivityCSV(context: ActivityExportContext): Blob {
  const labels = LABELS[context.locale];
  const rows = activityRows(context).map((row) => rowValues(row).map(csvCell).join(","));
  return new Blob(["\uFEFF", labels.headers.map(csvCell).join(","), "\n", rows.join("\n")], { type: "text/csv;charset=utf-8" });
}

export async function exportActivityXLSX(context: ActivityExportContext): Promise<Blob> {
  const labels = LABELS[context.locale];
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const header = labels.headers.map((value) => ({ value, fontWeight: "bold" as const }));
  const rows = activityRows(context).map(rowValues);
  const workbook = writeXlsxFile([header, ...rows], {
    sheet: labels.sheet,
    columns: [
      { width: 25 }, { width: 28 }, { width: 24 }, { width: 24 }, { width: 22 }, { width: 38 },
      { width: 18 }, { width: 16 }, { width: 21 }, { width: 18 }, { width: 19 }, { width: 17 }, { width: 14 },
    ],
  });
  return workbook.toBlob();
}
