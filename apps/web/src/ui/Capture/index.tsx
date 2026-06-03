/**
 * Capture surface — fast transaction / event entry.
 *
 * FR-UI-02: offline-first. Capture MUST succeed with no network connection
 * (INV-PERS-01). The event is appended to IndexedDB locally; no network call.
 *
 * NFR-MOD-01: no dependency on Intelligence, Literacy, or ai/ modules.
 * NFR-MOD-02: no import of AIOrchestrClient.
 * NFR-MOD-03: no direct localStorage consent access.
 *
 * INV-MON-01: amounts entered by the user are parsed to integer minor units
 * before any storage. Floating-point user input MUST be rejected or converted
 * to minor units at the input boundary — never stored as a float.
 *
 * TODO (FR-UI-02): implement transaction form — amount input (with currency
 * selector), category picker, optional note, date (defaults to now).
 * On submit: call State pillar recordTransaction(), which validates refs and
 * appends the event. Show optimistic success immediately (offline-capable).
 */

export default function Capture() {
  return (
    <main aria-label="Capture transaction">
      {/* TODO: implement capture form */}
      <p>Capture — not yet implemented</p>
    </main>
  );
}
