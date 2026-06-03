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
export type ConsentLevel = "NotPrompted" | "Redacted" | "FullGranted";

const STORAGE_KEY_PREFIX = "wisemoney:consent:";

/**
 * Get the current consent level for a feature.
 *
 * Returns "Redacted" for any absent, unknown, or ambiguous state (safe fallback,
 * INV-EGR-01; state machine: absent → Redacted).
 */
export function getConsentLevel(featureId: string): ConsentLevel {
  const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${featureId}`);
  if (raw === "FullGranted") return "FullGranted";
  if (raw === "NotPrompted") return "NotPrompted";
  return "Redacted"; // safe fallback for all other values including null
}

/**
 * Record that the user has been prompted but has not yet granted or declined.
 * This sets state to NotPrompted (the initial state on first feature access).
 */
export function markNotPrompted(featureId: string): void {
  localStorage.setItem(`${STORAGE_KEY_PREFIX}${featureId}`, "NotPrompted");
}

/**
 * Store a consent assertion + transition to FullGranted.
 *
 * The assertion is an OPAQUE, server-signed permission slip from the Go edge
 * (HMAC-SHA256; pinned contract: ARCHITECTURE §10a). The client treats it as an
 * opaque string — it CANNOT and MUST NOT validate the signature (it does not hold
 * `CONSENT_SIGNING_KEY`). Only the edge verifies it, on every full-egress request.
 *
 * The client's job is to: cache the blob per feature, attach it as the
 * `X-Consent-Assertion` header on full-egress AI calls (in `ai/orchestration.ts`),
 * and re-request a fresh assertion from `POST /v1/consent/assert` when the edge
 * rejects it as expired (~5 min TTL).
 *
 * TODO (egress-subsystem): on edge "assertion expired" response, transparently
 * re-fetch and retry once; surface only persistent failures to the user.
 */
export function storeConsentAssertion(
  featureId: string,
  assertion: string // opaque server-signed assertion (ARCHITECTURE §10a)
): void {
  localStorage.setItem(`${STORAGE_KEY_PREFIX}${featureId}:assertion`, assertion);
  localStorage.setItem(`${STORAGE_KEY_PREFIX}${featureId}`, "FullGranted");
}

/**
 * Revoke consent for a feature — transition FullGranted → Redacted.
 *
 * Also clears any stored consent assertion for the feature.
 */
export function revokeConsent(featureId: string): void {
  localStorage.setItem(`${STORAGE_KEY_PREFIX}${featureId}`, "Redacted");
  localStorage.removeItem(`${STORAGE_KEY_PREFIX}${featureId}:assertion`);
}

/**
 * Clear all consent state (e.g. on sign-out or local data clear).
 *
 * After clearing, all features revert to Redacted (safe fallback, INV-EGR-01).
 */
export function clearAllConsent(): void {
  const keys = Object.keys(localStorage).filter((k) =>
    k.startsWith(STORAGE_KEY_PREFIX)
  );
  for (const key of keys) {
    localStorage.removeItem(key);
  }
}
