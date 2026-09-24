/**
 * Decides when Home offers device unlock to a passphrase-only vault.
 *
 * The offer appears from the second passphrase unlock onward and stays away once
 * dismissed. The counter and the dismissal are conveniences, not security state,
 * so they live in localStorage like the consent flags (ADR-0008); losing them
 * only means the offer may show again.
 */
const STORAGE_KEY = "wisemoney.deviceUnlockOffer.v1";
const OFFER_FROM_PASSPHRASE_UNLOCK = 2;

type OfferState = { passphraseUnlocks: number; dismissed: boolean };

function readState(): OfferState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null) return { passphraseUnlocks: 0, dismissed: false };
    const parsed = JSON.parse(raw) as Partial<OfferState>;
    return {
      passphraseUnlocks: typeof parsed.passphraseUnlocks === "number" ? parsed.passphraseUnlocks : 0,
      dismissed: parsed.dismissed === true,
    };
  } catch {
    return { passphraseUnlocks: 0, dismissed: false };
  }
}

function writeState(state: OfferState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable (private mode, quota): the offer simply falls back to its default.
  }
}

export function recordPassphraseUnlock(): void {
  const state = readState();
  writeState({ ...state, passphraseUnlocks: state.passphraseUnlocks + 1 });
}

export function dismissDeviceUnlockOffer(): void {
  writeState({ ...readState(), dismissed: true });
}

export function shouldOfferDeviceUnlock(options: { webAuthnAvailable: boolean; hasDeviceUnlock: boolean }): boolean {
  if (!options.webAuthnAvailable || options.hasDeviceUnlock) return false;
  const state = readState();
  return !state.dismissed && state.passphraseUnlocks >= OFFER_FROM_PASSPHRASE_UNLOCK;
}
