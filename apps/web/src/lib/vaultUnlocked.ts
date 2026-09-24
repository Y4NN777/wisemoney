import { createContext, useContext } from "react";
import type { MasterKey } from "../crypto/envelope.ts";

/**
 * Bridge so the vault gate (inside the router tree) can report unlock state to
 * the app shell (outside it) without prop drilling through the router.
 */
export const VaultUnlockedSetterContext = createContext<(unlocked: boolean) => void>(() => {});

export function useVaultUnlockedSetter(): (unlocked: boolean) => void {
  return useContext(VaultUnlockedSetterContext);
}

/**
 * Session-scoped master key cache. The vault gate unmounts while public pages
 * (/help, /updates) are open; this keeps an unlocked session unlocked across
 * such navigation without re-deriving the key. Memory only — never persisted,
 * cleared on lock, dies with the page (INV-AUTH-06/07, INV-KEY-03 unchanged).
 */
let cachedMasterKey: MasterKey | null = null;

export function getCachedMasterKey(): MasterKey | null {
  return cachedMasterKey;
}

export function setCachedMasterKey(masterKey: MasterKey): void {
  cachedMasterKey = masterKey;
}

export function clearCachedMasterKey(): void {
  cachedMasterKey = null;
}
