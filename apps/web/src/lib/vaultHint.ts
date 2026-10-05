/**
 * Whether this device already holds a private space, remembered so the landing page can show
 * the right button before the storage code has loaded. A convenience flag, not security state:
 * the vault flows read the real answer from IndexedDB and correct this value on every start.
 */
const STORAGE_KEY = "wisemoney.vault.present.v1";

export function readVaultHint(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeVaultHint(present: boolean): void {
  try {
    if (present) localStorage.setItem(STORAGE_KEY, "1");
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable: the landing page shows "Start" until the vault flows have loaded.
  }
}
