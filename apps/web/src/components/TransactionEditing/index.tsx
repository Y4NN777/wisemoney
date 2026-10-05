import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { FinancialStateSnapshot, TransactionDisplay } from "../../domain/financialState.ts";
import { useDeleteTransaction, useUpdateTransaction } from "../../hooks/useFinancialState.ts";
import { categoryDisplayName } from "../../lib/categoryName.ts";
import { currencyFractionDigits, currencyLabel, parseMajorUnits } from "../../types/money.ts";
import { Button } from "../ui/button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog.tsx";
import { Input } from "../ui/input.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select.tsx";

type TransactionEdit = {
  transaction: TransactionDisplay;
  categoryId: string;
  direction: "income" | "expense";
  amount: string;
  note: string;
};

/** The amount as the user would type it: no decimals for a currency that has none. */
export function amountInput(transaction: TransactionDisplay): string {
  const digits = currencyFractionDigits(transaction.amount.currency);
  return digits === 0
    ? String(transaction.amount.minorUnits)
    : (transaction.amount.minorUnits / 10 ** digits).toFixed(digits);
}

/**
 * Correcting or deleting an income or expense. One implementation for every place that lists
 * movements (Home's recent movements, the Activity detail sheet): the state lives in this hook and
 * the two dialogs render from it. The account and the original date are never changed.
 */
export function useTransactionEditing() {
  const { t } = useTranslation();
  const [transactionEdit, setTransactionEdit] = useState<TransactionEdit | null>(null);
  const [transactionToDelete, setTransactionToDelete] = useState<TransactionDisplay | null>(null);
  const updateTransaction = useUpdateTransaction();
  const deleteTransaction = useDeleteTransaction();

  const startEdit = (transaction: TransactionDisplay) => setTransactionEdit({
    transaction,
    categoryId: transaction.categoryId,
    direction: transaction.direction,
    amount: amountInput(transaction),
    note: transaction.note,
  });

  const saveTransaction = async () => {
    if (transactionEdit == null) return;
    const minorUnits = parseMajorUnits(transactionEdit.amount, transactionEdit.transaction.amount.currency);
    if (minorUnits == null || minorUnits <= 0) {
      toast.error(t("dashboard.transactionActions.invalidAmount"));
      return;
    }
    try {
      await updateTransaction.mutateAsync({
        originalEventId: transactionEdit.transaction.id,
        accountId: transactionEdit.transaction.accountId,
        categoryId: transactionEdit.categoryId,
        amount: { minorUnits, currency: transactionEdit.transaction.amount.currency },
        direction: transactionEdit.direction,
        note: transactionEdit.note,
        tags: transactionEdit.transaction.tags,
        merchant: transactionEdit.transaction.merchant,
      });
      setTransactionEdit(null);
      toast.success(t("dashboard.transactionActions.updated"));
    } catch {
      toast.error(t("dashboard.transactionActions.updateFailed"));
    }
  };

  const confirmDeleteTransaction = async () => {
    if (transactionToDelete == null) return;
    try {
      await deleteTransaction.mutateAsync({ originalEventId: transactionToDelete.id });
      setTransactionToDelete(null);
      toast.success(t("dashboard.transactionActions.deleted"));
    } catch {
      toast.error(t("dashboard.transactionActions.deleteFailed"));
    }
  };

  return {
    transactionEdit,
    setTransactionEdit,
    transactionToDelete,
    setTransactionToDelete,
    startEdit,
    startDelete: setTransactionToDelete,
    saveTransaction,
    confirmDeleteTransaction,
    saving: updateTransaction.isPending,
    deleting: deleteTransaction.isPending,
  };
}

export function TransactionEditDialogs({ editing, categories }: {
  editing: ReturnType<typeof useTransactionEditing>;
  categories: FinancialStateSnapshot["categories"];
}) {
  const { t } = useTranslation();
  const { transactionEdit, setTransactionEdit, transactionToDelete, setTransactionToDelete, saveTransaction, confirmDeleteTransaction } = editing;
  return (
    <>
      <Dialog open={transactionEdit != null} onOpenChange={(open) => { if (!open) setTransactionEdit(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("dashboard.transactionActions.editTitle")}</DialogTitle>
            <DialogDescription>{t("dashboard.transactionActions.editDescription")}</DialogDescription>
          </DialogHeader>
          {transactionEdit != null && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="edit-transaction-category" className="text-sm font-medium">{t("dashboard.transactionActions.category")}</label>
                <Select value={transactionEdit.categoryId} onValueChange={(categoryId) => setTransactionEdit((value) => value == null ? null : { ...value, categoryId })}>
                  <SelectTrigger id="edit-transaction-category"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {categories.filter((category) => !category.isArchived).map((category) => (
                      <SelectItem key={category.id} value={category.id}>{categoryDisplayName(category, t)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label htmlFor="edit-transaction-direction" className="text-sm font-medium">{t("dashboard.transactionActions.type")}</label>
                <Select value={transactionEdit.direction} onValueChange={(direction) => setTransactionEdit((value) => value == null ? null : { ...value, direction: direction as "income" | "expense" })}>
                  <SelectTrigger id="edit-transaction-direction"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="expense">{t("dashboard.transactionActions.expense")}</SelectItem>
                    <SelectItem value="income">{t("dashboard.transactionActions.income")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label htmlFor="edit-transaction-amount" className="text-sm font-medium">{t("dashboard.transactionActions.amount", { currency: currencyLabel(transactionEdit.transaction.amount.currency) })}</label>
                <Input id="edit-transaction-amount" inputMode="decimal" value={transactionEdit.amount} onChange={(event) => setTransactionEdit((value) => value == null ? null : { ...value, amount: event.target.value })} />
              </div>
              <div className="space-y-2">
                <label htmlFor="edit-transaction-note" className="text-sm font-medium">{t("dashboard.transactionActions.note")}</label>
                <Input id="edit-transaction-note" value={transactionEdit.note} onChange={(event) => setTransactionEdit((value) => value == null ? null : { ...value, note: event.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransactionEdit(null)}>{t("dashboard.transactionActions.cancel")}</Button>
            <Button onClick={() => { void saveTransaction(); }} disabled={editing.saving}>{t("dashboard.transactionActions.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={transactionToDelete != null} onOpenChange={(open) => { if (!open) setTransactionToDelete(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("dashboard.transactionActions.deleteTitle")}</DialogTitle>
            <DialogDescription>{t("dashboard.transactionActions.deleteDescription")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransactionToDelete(null)}>{t("dashboard.transactionActions.cancel")}</Button>
            <Button variant="destructive" onClick={() => { void confirmDeleteTransaction(); }} disabled={editing.deleting}>{t("dashboard.transactionActions.confirmDelete")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
