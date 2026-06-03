/**
 * Per-feature consent state machine (typed enum + transition guards).
 *
 * UML 03-state-machines.md: NotPrompted → Redacted → FullGranted → Redacted on
 * revoke / expiry / localStorage clear.
 *
 * INV-EGR-01/02/03. NFR-MOD-03: only the consent subsystem drives transitions.
 * Redacted is the safe default and the fallback for any ambiguous / error state.
 *
 * NOTE: this module encodes the TRANSITION LOGIC only — actual localStorage
 * reads/writes are in consentStore.ts. The state machine drives transitions;
 * consentStore persists them.
 */

export type ConsentState =
  | { status: "NotPrompted" }
  | { status: "Redacted" }
  | { status: "FullGranted"; assertionExpiresAt: number }; // Unix ms

export type ConsentEvent =
  | { type: "USER_DISMISSED_PROMPT" }
  | { type: "USER_DECLINED_CONSENT" }
  | { type: "USER_INITIATES_FULL_EGRESS" }
  | { type: "ASSERTION_ISSUED"; assertionExpiresAt: number }
  | { type: "USER_CANCELLED_DIALOG" }
  | { type: "USER_REVOKES_CONSENT" }
  | { type: "ASSERTION_EXPIRED" }
  | { type: "LOCALSTORAGE_CLEARED" }
  | { type: "USER_RECONFIRMS"; newAssertionExpiresAt: number };

/**
 * Pure transition function — no side effects. Returns the next state.
 *
 * Any unhandled event in any state returns Redacted (safe fallback, INV-EGR-03).
 *
 * Implements UML 03-state-machines.md per-feature consent state machine exactly.
 */
export function transition(
  current: ConsentState,
  event: ConsentEvent
): ConsentState {
  switch (current.status) {
    case "NotPrompted":
      switch (event.type) {
        case "USER_DISMISSED_PROMPT":
        case "USER_DECLINED_CONSENT":
          return { status: "Redacted" };
        case "USER_INITIATES_FULL_EGRESS":
          // Transition to ConsentFlow is handled by the UI;
          // the machine moves to Redacted until an assertion is issued or cancelled.
          return { status: "Redacted" };
        default:
          return { status: "Redacted" }; // safe fallback
      }

    case "Redacted":
      switch (event.type) {
        case "ASSERTION_ISSUED":
          return { status: "FullGranted", assertionExpiresAt: event.assertionExpiresAt };
        default:
          return { status: "Redacted" }; // all ambiguous events stay Redacted
      }

    case "FullGranted":
      switch (event.type) {
        case "USER_REVOKES_CONSENT":
        case "ASSERTION_EXPIRED":
        case "LOCALSTORAGE_CLEARED":
          return { status: "Redacted" };
        case "USER_RECONFIRMS":
          // Re-confirm before prior assertion expires (FullGranted → FullGranted)
          return { status: "FullGranted", assertionExpiresAt: event.newAssertionExpiresAt };
        default:
          return { status: "Redacted" }; // safe fallback for unknown events
      }
  }
}

/**
 * Check whether a FullGranted assertion has expired.
 *
 * An expired assertion transitions FullGranted → Redacted (no auto-renewal).
 */
export function isAssertionExpired(state: ConsentState): boolean {
  if (state.status !== "FullGranted") return false;
  return Date.now() >= state.assertionExpiresAt;
}
