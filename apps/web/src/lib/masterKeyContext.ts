import { createContext, useContext } from "react";
import type { MasterKey } from "../crypto/envelope.ts";

export const MasterKeyContext = createContext<MasterKey | null>(null);

export function useMasterKey(): MasterKey {
  const mk = useContext(MasterKeyContext);
  if (mk == null) {
    throw new Error("MasterKeyContext not provided");
  }
  return mk;
}
