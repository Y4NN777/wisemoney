import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMasterKey } from "../lib/masterKeyContext.ts";
import { masterKeyScope } from "../hooks/useFinancialState.ts";
import { loadFirstSessionState, saveFirstSessionState, type FirstSessionState } from "./firstSession.ts";
import { setStoredBaseCurrency } from "../domain/currencyStore.ts";
import { archiveAccount, createAccount } from "../pillars/state/index.ts";
import type { FinancialStateSnapshot } from "../domain/financialState.ts";

const queryKey = (scope: string) => ["firstSession", scope] as const;

export function useFirstSessionState() {
  const masterKey = useMasterKey();
  return useQuery({ queryKey: queryKey(masterKeyScope(masterKey)), queryFn: () => loadFirstSessionState(masterKey) });
}

export function useSaveFirstSession() {
  const masterKey = useMasterKey();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (state: FirstSessionState) => saveFirstSessionState(state, masterKey),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKey(masterKeyScope(masterKey)) }),
  });
}

/**
 * Step 1 lets the user correct the guessed currency. While the space holds no movement, the
 * default account is swapped for one in the new currency (an account keeps its currency once it
 * has movements, as everywhere else in the app).
 */
export function useChangeStartingCurrency() {
  const masterKey = useMasterKey();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { currency: string; snapshot: FinancialStateSnapshot; hasMovement: boolean }) => {
      await setStoredBaseCurrency(input.currency, masterKey);
      const active = input.snapshot.accounts.filter((account) => account.isActive);
      if (!input.hasMovement && active.length === 1 && active[0]!.currency !== input.currency) {
        const previous = active[0]!;
        await archiveAccount({ accountId: previous.id, masterKey });
        await createAccount({ name: previous.name, type: previous.type, initialBalance: { minorUnits: 0, currency: input.currency }, masterKey });
      }
    },
    onSettled: () => Promise.all(["financialState", "transactions", "financialOperations", "currencyContext", "hasAnyMoneyMovement"].map((key) => queryClient.invalidateQueries({ queryKey: [key] }))),
  });
}
