

import type { TransactionDisplay } from "../../domain/financialState.ts";
import type { } from "../../domain/financialOperations.ts";

import type { } from "../../pillars/intelligence/index.ts";

import { currencyFractionDigits } from "../../types/money.ts";

export type TransactionEdit = {
  transaction: TransactionDisplay;
  categoryId: string;
  direction: "income" | "expense";
  amount: string;
  note: string;
};

export function amountInput(transaction: TransactionDisplay): string {
  const digits = currencyFractionDigits(transaction.amount.currency);
  return digits === 0
    ? String(transaction.amount.minorUnits)
    : (transaction.amount.minorUnits / 10 ** digits).toFixed(digits);
}
