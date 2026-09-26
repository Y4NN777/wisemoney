/**
 * The three intro screens show once per device — to a new space and to an existing one alike
 * (Y4NN, 2026-09-26: no "how it works" link; the walkthrough should simply happen once).
 * A convenience flag, not security state, so localStorage is fine; if it is lost the intro
 * shows again, which is harmless.
 */
const STORAGE_KEY = "wisemoney.intro.v1";

export function hasSeenIntro(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "seen";
  } catch {
    return false;
  }
}

export function markIntroSeen(): void {
  try {
    localStorage.setItem(STORAGE_KEY, "seen");
  } catch {
    // Storage unavailable: the intro shows again next time.
  }
}
