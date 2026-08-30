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

export function shouldReloadAfterControllerChange(
  vaultUnlocked: boolean,
  updateApproved = false,
): boolean {
  return updateApproved || !vaultUnlocked;
}

const UPDATE_RELOAD_MARKER = "wisemoney:pwa-update-reload";

type SessionStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

function resolveSessionStorage(storage?: SessionStorage): SessionStorage | null {
  if (storage != null) return storage;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function markPwaUpdateReload(storage?: SessionStorage): boolean {
  const target = resolveSessionStorage(storage);
  if (target == null) return false;
  try {
    target.setItem(UPDATE_RELOAD_MARKER, "1");
    return true;
  } catch {
    return false;
  }
}

export function clearPwaUpdateReload(storage?: SessionStorage): void {
  const target = resolveSessionStorage(storage);
  if (target == null) return;
  try {
    target.removeItem(UPDATE_RELOAD_MARKER);
  } catch {
    // The update remains functional when session storage is unavailable.
  }
}

export function hasPwaUpdateReload(storage?: SessionStorage): boolean {
  const target = resolveSessionStorage(storage);
  if (target == null) return false;
  try {
    return target.getItem(UPDATE_RELOAD_MARKER) === "1";
  } catch {
    return false;
  }
}
