/**
 * Consent store — localStorage-backed per-feature consent state.
 *
 * NFR-MOD-03: this is the ONLY module that reads or writes consent state.
 * No other module may access localStorage consent directly.
 *
 * INV-EGR-02: consent is per-feature only. Granting for feature A does not extend
 * to feature B.
 *
 * localStorage consent is advisory UI context only — it is NOT the enforcement
 * mechanism in managed mode. The Go edge is the enforcement point (INV-EGR-03a).
 * In BYO-key mode this module is the maximum achievable enforcement (INV-EGR-03b).
 *
 * Absent/cleared state is always treated as not-granted (M-EGR-02 / state machine).
 */

/** Per-feature consent level. Redacted is the default and the fallback. */
type ConsentLevel = "NotPrompted" | "Redacted" | "FullGranted";

const STORAGE_KEY_PREFIX = "wisemoney:consent:";
const HELP_PROVIDER_CONSENT_KEY = "wisemoney.help.google-consent.v1";
const HELP_PROVIDER_CONSENT_VERSION = 1;

/**
 * Get the current consent level for a feature.
 *
 * Returns "NotPrompted" when no choice has been stored so the UI can obtain an
 * explicit first-use choice. Unknown values fall back to "Redacted".
 */
export function getConsentLevel(featureId: string): ConsentLevel {
  const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${featureId}`);
  if (raw === "FullGranted") return "FullGranted";
  if (raw === "NotPrompted") return "NotPrompted";
  if (raw === null) return "NotPrompted";
  return "Redacted";
}

/**
 * Set the consent level for a feature directly.
 *
 * Use this to record the user's intent (e.g. "Grant full access" button click).
 * FullGranted applies only to direct BYO-key transport. Managed mode remains
 * redacted-only.
 *
 * For Redacted, prefer revokeConsent().
 */
export function setConsentLevel(featureId: string, level: ConsentLevel): void {
  localStorage.setItem(`${STORAGE_KEY_PREFIX}${featureId}`, level);
}

/**
 * Revoke consent for a feature — transition FullGranted → Redacted.
 *
 * Also clears legacy assertion data left by earlier application versions.
 */
export function revokeConsent(featureId: string): void {
  localStorage.setItem(`${STORAGE_KEY_PREFIX}${featureId}`, "Redacted");
  localStorage.removeItem(`${STORAGE_KEY_PREFIX}${featureId}:assertion`);
}

/**
 * Clear all consent state (e.g. on sign-out or local data clear).
 *
 * After clearing, all features return to NotPrompted; egress remains redacted
 * until the user makes a choice.
 */
export function clearAllConsent(): void {
  const keys = Object.keys(localStorage).filter((k) =>
    k.startsWith(STORAGE_KEY_PREFIX)
  );
  for (const key of keys) {
    localStorage.removeItem(key);
  }
  localStorage.removeItem(HELP_PROVIDER_CONSENT_KEY);
}

/** Versioned disclosure acceptance for the public Google-powered help chat. */
export function hasHelpProviderConsent(storage: Pick<Storage, "getItem"> = localStorage): boolean {
  try {
    const raw = storage.getItem(HELP_PROVIDER_CONSENT_KEY);
    if (raw == null) return false;
    const parsed = JSON.parse(raw) as { version?: unknown; accepted?: unknown };
    return parsed.version === HELP_PROVIDER_CONSENT_VERSION && parsed.accepted === true;
  } catch {
    return false;
  }
}

export function grantHelpProviderConsent(storage: Pick<Storage, "setItem"> = localStorage): void {
  storage.setItem(HELP_PROVIDER_CONSENT_KEY, JSON.stringify({
    version: HELP_PROVIDER_CONSENT_VERSION,
    accepted: true,
  }));
}
