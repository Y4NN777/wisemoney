import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMasterKey } from "../lib/masterKeyContext.ts";
import { getSnapshot, replayUpTo, readTransactionsInRange } from "../domain/financialState.ts";
import type { TransactionDisplay } from "../domain/financialState.ts";
import { recordTransaction, createAccount, updateAccount, archiveAccount, createCategory, renameCategory, archiveCategory, createGoal, recordGoalContribution, createBudget, archiveBudget, archiveGoal, createRecurringItem, realiseRecurringOccurrence, recordTransfer } from "../pillars/state/index.ts";
import type { RecordTransactionParams, CreateAccountParams, UpdateAccountParams, ArchiveAccountParams, CreateCategoryParams, RenameCategoryParams, ArchiveCategoryParams, CreateGoalParams, RecordGoalContributionParams, CreateBudgetParams, ArchiveBudgetParams, ArchiveGoalParams, CreateRecurringItemParams, RealiseRecurringOccurrenceParams, RecordTransferParams } from "../pillars/state/index.ts";
import type { FinancialStateSnapshot } from "../domain/financialState.ts";

const SNAPSHOT_KEY = ["financialState"] as const;

export function useFinancialState() {
  const masterKey = useMasterKey();

  return useQuery<FinancialStateSnapshot>({
    queryKey: SNAPSHOT_KEY,
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
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SNAPSHOT_KEY });
    },
  });
}

export function useCreateAccount() {
  const masterKey = useMasterKey();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: Omit<CreateAccountParams, "masterKey">) =>
      createAccount({ ...params, masterKey }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SNAPSHOT_KEY });
    },
  });
}

export function useUpdateAccount() {
  const masterKey = useMasterKey();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: Omit<UpdateAccountParams, "masterKey">) =>
      updateAccount({ ...params, masterKey }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SNAPSHOT_KEY });
    },
  });
}

export function useArchiveAccount() {
  const masterKey = useMasterKey();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: Omit<ArchiveAccountParams, "masterKey">) =>
      archiveAccount({ ...params, masterKey }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SNAPSHOT_KEY });
    },
  });
}

export function useCreateCategory() {
  const masterKey = useMasterKey();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: Omit<CreateCategoryParams, "masterKey">) =>
      createCategory({ ...params, masterKey }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SNAPSHOT_KEY });
    },
  });
}

export function useRenameCategory() {
  const masterKey = useMasterKey();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: Omit<RenameCategoryParams, "masterKey">) =>
      renameCategory({ ...params, masterKey }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SNAPSHOT_KEY });
    },
  });
}

export function useArchiveCategory() {
  const masterKey = useMasterKey();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: Omit<ArchiveCategoryParams, "masterKey">) =>
      archiveCategory({ ...params, masterKey }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SNAPSHOT_KEY });
    },
  });
}

export function useCreateGoal() {
  const masterKey = useMasterKey();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: Omit<CreateGoalParams, "masterKey">) =>
      createGoal({ ...params, masterKey }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SNAPSHOT_KEY });
    },
  });
}

export function useRecordGoalContribution() {
  const masterKey = useMasterKey();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: Omit<RecordGoalContributionParams, "masterKey">) =>
      recordGoalContribution({ ...params, masterKey }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SNAPSHOT_KEY });
    },
  });
}

export function useCreateBudget() {
  const masterKey = useMasterKey();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: Omit<CreateBudgetParams, "masterKey">) =>
      createBudget({ ...params, masterKey }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SNAPSHOT_KEY });
    },
  });
}

export function useArchiveBudget() {
  const masterKey = useMasterKey();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: Omit<ArchiveBudgetParams, "masterKey">) =>
      archiveBudget({ ...params, masterKey }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SNAPSHOT_KEY });
    },
  });
}

export function useArchiveGoal() {
  const masterKey = useMasterKey();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: Omit<ArchiveGoalParams, "masterKey">) =>
      archiveGoal({ ...params, masterKey }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SNAPSHOT_KEY });
    },
  });
}

export function useCreateRecurringItem() {
  const masterKey = useMasterKey();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: Omit<CreateRecurringItemParams, "masterKey">) =>
      createRecurringItem({ ...params, masterKey }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SNAPSHOT_KEY });
    },
  });
}

export function useRealiseRecurringOccurrence() {
  const masterKey = useMasterKey();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: Omit<RealiseRecurringOccurrenceParams, "masterKey">) =>
      realiseRecurringOccurrence({ ...params, masterKey }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SNAPSHOT_KEY });
    },
  });
}

export function useRecordTransfer() {
  const masterKey = useMasterKey();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: Omit<RecordTransferParams, "masterKey">) =>
      recordTransfer({ ...params, masterKey }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SNAPSHOT_KEY });
    },
  });
}

export function useHistoricalState(year: number, month: number) {
  const masterKey = useMasterKey();

  return useQuery<FinancialStateSnapshot>({
    queryKey: ["financialState", "historical", year, month],
    queryFn: () => {
      const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999).getTime();
      return replayUpTo(endOfMonth, masterKey);
    },
    staleTime: 30_000,
  });
}

export function useTransactionsInRange(start: number, end: number) {
  const masterKey = useMasterKey();

  return useQuery<TransactionDisplay[]>({
    queryKey: ["transactions", start, end],
    queryFn: () => readTransactionsInRange(start, end, masterKey),
    staleTime: 30_000,
  });
}
