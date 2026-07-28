import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Dexie, { type ObservabilitySet } from "dexie";
import { useMasterKey } from "../lib/masterKeyContext.ts";
import { getSnapshot, replayUpTo, readTransactionsInRange } from "../domain/financialState.ts";
import type { TransactionDisplay } from "../domain/financialState.ts";
import { recordTransaction, updateTransaction, deleteTransaction, createAccount, updateAccount, archiveAccount, createCategory, renameCategory, archiveCategory, createGoal, recordGoalContribution, createBudget, archiveBudget, archiveGoal, createRecurringItem, archiveRecurringItem, realiseRecurringOccurrence, recordTransfer, createDebtCredit, updateDebtCreditStatus } from "../pillars/state/index.ts";
import type { RecordTransactionParams, UpdateTransactionParams, DeleteTransactionParams, CreateAccountParams, UpdateAccountParams, ArchiveAccountParams, CreateCategoryParams, RenameCategoryParams, ArchiveCategoryParams, CreateGoalParams, RecordGoalContributionParams, CreateBudgetParams, ArchiveBudgetParams, ArchiveGoalParams, CreateRecurringItemParams, ArchiveRecurringItemParams, RealiseRecurringOccurrenceParams, RecordTransferParams, CreateDebtCreditParams, UpdateDebtCreditStatusParams } from "../pillars/state/index.ts";
import type { FinancialStateSnapshot } from "../domain/financialState.ts";
import type { MasterKey } from "../crypto/envelope.ts";

const SNAPSHOT_KEY = ["financialState"] as const;
const TRANSACTIONS_KEY = ["transactions"] as const;
const masterKeyScopes = new WeakMap<MasterKey, string>();

function masterKeyScope(masterKey: MasterKey): string {
  const existing = masterKeyScopes.get(masterKey);
  if (existing != null) return existing;
  const scope = crypto.randomUUID();
  masterKeyScopes.set(masterKey, scope);
  return scope;
}

async function invalidateFinancialData(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: SNAPSHOT_KEY }),
    queryClient.invalidateQueries({ queryKey: TRANSACTIONS_KEY }),
  ]);
}

export function containsFinancialMutation(parts: ObservabilitySet): boolean {
  return Object.keys(parts).some((part) =>
    part.startsWith("idb://WiseMoney/financialEvents/") ||
    part.startsWith("idb://WiseMoney/fxRates/") ||
    part.startsWith("idb://WiseMoney/appSettings/")
  );
}

function useCrossTabFinancialInvalidation(): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    const onStorageMutated = (parts: ObservabilitySet) => {
      if (containsFinancialMutation(parts)) void invalidateFinancialData(queryClient);
    };
    Dexie.on.storagemutated.subscribe(onStorageMutated);
    return () => Dexie.on.storagemutated.unsubscribe(onStorageMutated);
  }, [queryClient]);
}

export function useFinancialState() {
  const masterKey = useMasterKey();
  const scope = masterKeyScope(masterKey);
  useCrossTabFinancialInvalidation();

  return useQuery<FinancialStateSnapshot>({
    queryKey: [...SNAPSHOT_KEY, scope],
    queryFn: () => getSnapshot(masterKey),
    staleTime: 30_000,
  });
}

export function useRecordTransaction() {
  const masterKey = useMasterKey();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: Omit<RecordTransactionParams, "masterKey">) =>
      recordTransaction({ ...params, masterKey }),
    onSettled: () => invalidateFinancialData(queryClient),
  });
}

export function useUpdateTransaction() {
  const masterKey = useMasterKey();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: Omit<UpdateTransactionParams, "masterKey">) =>
      updateTransaction({ ...params, masterKey }),
    onSettled: () => invalidateFinancialData(queryClient),
  });
}

export function useDeleteTransaction() {
  const masterKey = useMasterKey();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: Omit<DeleteTransactionParams, "masterKey">) =>
      deleteTransaction({ ...params, masterKey }),
    onSettled: () => invalidateFinancialData(queryClient),
  });
}

export function useCreateAccount() {
  const masterKey = useMasterKey();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: Omit<CreateAccountParams, "masterKey">) =>
      createAccount({ ...params, masterKey }),
    onSettled: () => invalidateFinancialData(queryClient),
  });
}

export function useUpdateAccount() {
  const masterKey = useMasterKey();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: Omit<UpdateAccountParams, "masterKey">) =>
      updateAccount({ ...params, masterKey }),
    onSettled: () => invalidateFinancialData(queryClient),
  });
}

export function useArchiveAccount() {
  const masterKey = useMasterKey();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: Omit<ArchiveAccountParams, "masterKey">) =>
      archiveAccount({ ...params, masterKey }),
    onSettled: () => invalidateFinancialData(queryClient),
  });
}

export function useCreateCategory() {
  const masterKey = useMasterKey();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: Omit<CreateCategoryParams, "masterKey">) =>
      createCategory({ ...params, masterKey }),
    onSettled: () => invalidateFinancialData(queryClient),
  });
}

export function useRenameCategory() {
  const masterKey = useMasterKey();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: Omit<RenameCategoryParams, "masterKey">) =>
      renameCategory({ ...params, masterKey }),
    onSettled: () => invalidateFinancialData(queryClient),
  });
}

export function useArchiveCategory() {
  const masterKey = useMasterKey();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: Omit<ArchiveCategoryParams, "masterKey">) =>
      archiveCategory({ ...params, masterKey }),
    onSettled: () => invalidateFinancialData(queryClient),
  });
}

export function useCreateGoal() {
  const masterKey = useMasterKey();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: Omit<CreateGoalParams, "masterKey">) =>
      createGoal({ ...params, masterKey }),
    onSettled: () => invalidateFinancialData(queryClient),
  });
}

export function useRecordGoalContribution() {
  const masterKey = useMasterKey();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: Omit<RecordGoalContributionParams, "masterKey">) =>
      recordGoalContribution({ ...params, masterKey }),
    onSettled: () => invalidateFinancialData(queryClient),
  });
}

export function useCreateBudget() {
  const masterKey = useMasterKey();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: Omit<CreateBudgetParams, "masterKey">) =>
      createBudget({ ...params, masterKey }),
    onSettled: () => invalidateFinancialData(queryClient),
  });
}

export function useArchiveBudget() {
  const masterKey = useMasterKey();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: Omit<ArchiveBudgetParams, "masterKey">) =>
      archiveBudget({ ...params, masterKey }),
    onSettled: () => invalidateFinancialData(queryClient),
  });
}

export function useArchiveGoal() {
  const masterKey = useMasterKey();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: Omit<ArchiveGoalParams, "masterKey">) =>
      archiveGoal({ ...params, masterKey }),
    onSettled: () => invalidateFinancialData(queryClient),
  });
}

export function useCreateRecurringItem() {
  const masterKey = useMasterKey();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: Omit<CreateRecurringItemParams, "masterKey">) =>
      createRecurringItem({ ...params, masterKey }),
    onSettled: () => invalidateFinancialData(queryClient),
  });
}

export function useArchiveRecurringItem() {
  const masterKey = useMasterKey();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: Omit<ArchiveRecurringItemParams, "masterKey">) =>
      archiveRecurringItem({ ...params, masterKey }),
    onSettled: () => invalidateFinancialData(queryClient),
  });
}

export function useRealiseRecurringOccurrence() {
  const masterKey = useMasterKey();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: Omit<RealiseRecurringOccurrenceParams, "masterKey">) =>
      realiseRecurringOccurrence({ ...params, masterKey }),
    onSettled: () => invalidateFinancialData(queryClient),
  });
}

export function useRecordTransfer() {
  const masterKey = useMasterKey();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: Omit<RecordTransferParams, "masterKey">) =>
      recordTransfer({ ...params, masterKey }),
    onSettled: () => invalidateFinancialData(queryClient),
  });
}

export function useCreateDebtCredit() {
  const masterKey = useMasterKey();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: Omit<CreateDebtCreditParams, "masterKey">) =>
      createDebtCredit({ ...params, masterKey }),
    onSettled: () => invalidateFinancialData(queryClient),
  });
}

export function useUpdateDebtCreditStatus() {
  const masterKey = useMasterKey();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: Omit<UpdateDebtCreditStatusParams, "masterKey">) =>
      updateDebtCreditStatus({ ...params, masterKey }),
    onSettled: () => invalidateFinancialData(queryClient),
  });
}

export function useHistoricalState(year: number, month: number) {
  const masterKey = useMasterKey();
  const scope = masterKeyScope(masterKey);

  return useQuery<FinancialStateSnapshot>({
    queryKey: ["financialState", scope, "historical", year, month],
    queryFn: () => {
      const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999).getTime();
      return replayUpTo(endOfMonth, masterKey);
    },
    staleTime: 30_000,
  });
}

export function useTransactionsInRange(start: number, end: number) {
  const masterKey = useMasterKey();
  const scope = masterKeyScope(masterKey);

  return useQuery<TransactionDisplay[]>({
    queryKey: ["transactions", scope, start, end],
    queryFn: () => readTransactionsInRange(start, end, masterKey),
    staleTime: 30_000,
  });
}
