let interacted = false;

/** Records the first tap or key press; from then on the page belongs to the user and is not reloaded. */
export function watchFirstInteraction(target: Pick<Window, "addEventListener"> = window): void {
  const mark = () => { interacted = true; };
  for (const type of ["pointerdown", "touchstart", "keydown"]) {
    target.addEventListener(type, mark, { capture: true, once: true, passive: true });
  }
}

export function hasInteracted(): boolean {
  return interacted;
}

/**
 * A version that was already waiting when WiseMoney opened (downloaded in an earlier session) is
 * installed at once, before the user touches anything; one that arrives later waits for the next
 * opening. iOS keeps the page alive or restores it after the app is closed, so the browser's own
 * rule (activate once every window is closed) never fires there (Y4NN's iPhone stayed on 1.1.0,
 * 2026-10-08).
 */
export function shouldActivateAtStartup(waitingAtOpen: boolean, userInteracted: boolean, vaultUnlocked: boolean): boolean {
  return waitingAtOpen && !userInteracted && !vaultUnlocked;
}
