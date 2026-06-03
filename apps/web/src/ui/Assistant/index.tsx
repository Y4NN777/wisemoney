/**
 * Assistant surface — AI guidance (Financial Intelligence) + learning chat
 * (Financial Literacy).
 *
 * NFR-MOD-02: this surface imports Intelligence/Literacy pillars only.
 * It NEVER imports AIOrchestrClient, ai/orchestration.ts, or any provider SDK.
 *
 * NFR-MOD-03: consent state is surfaced via the consent subsystem only.
 * This surface may read consent level to drive UI (show consent prompt vs chat),
 * but all reads go through consent/consentStore.ts — never raw localStorage.
 *
 * INV-PROXY-04: when all AI providers are unavailable, this surface shows a
 * clear user-facing error message. It NEVER displays a fabricated AI response.
 *
 * TODO (FR-UI-03):
 * - Implement chat UI for Literacy conversational learning.
 * - Implement insight/recommendation display for Intelligence features.
 * - Implement per-feature consent prompt flow (state machine in consentMachine.ts).
 * - Show ProviderUnavailableSignal as a UI error state (INV-PROXY-04).
 */

export default function Assistant() {
  return (
    <main aria-label="AI assistant">
      {/* TODO: implement chat + insight UI; consent prompt flow */}
      <p>Assistant — not yet implemented</p>
    </main>
  );
}
