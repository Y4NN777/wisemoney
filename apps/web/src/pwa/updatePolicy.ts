export type PwaUpdateDisposition = "idle" | "defer" | "activate";

/**
 * A full page reload destroys the in-memory master key. Keep a waiting service
 * worker dormant while the vault is open, then activate it once the vault is
 * locked (or on the next launch). This preserves both continuity and the rule
 * that key material is never persisted for convenience.
 */
export function getPwaUpdateDisposition(
  needRefresh: boolean,
  vaultUnlocked: boolean,
): PwaUpdateDisposition {
  if (!needRefresh) return "idle";
  return vaultUnlocked ? "defer" : "activate";
}

export function shouldReloadAfterControllerChange(vaultUnlocked: boolean): boolean {
  return !vaultUnlocked;
}
