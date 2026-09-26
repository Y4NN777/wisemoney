import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMasterKey } from "../lib/masterKeyContext.ts";
import { masterKeyScope } from "../hooks/useFinancialState.ts";
import { loadFirstSessionState, saveFirstSessionState, type FirstSessionState } from "./firstSession.ts";

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
