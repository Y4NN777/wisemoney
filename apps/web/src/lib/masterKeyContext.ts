import { createContext, useContext } from "react";
import type { MasterKey } from "../crypto/envelope.ts";

export const MasterKeyContext = createContext<MasterKey | null>(null);
export const VaultActionsContext = createContext<{ lockVault: () => void } | null>(null);

export function useMasterKey(): MasterKey {
  const mk = useContext(MasterKeyContext);
  if (mk == null) {
    throw new Error("MasterKeyContext not provided");
  }
  return mk;
}

export function useVaultActions(): { lockVault: () => void } {
  const actions = useContext(VaultActionsContext);
  if (actions == null) throw new Error("VaultActionsContext not provided");
  return actions;
}
