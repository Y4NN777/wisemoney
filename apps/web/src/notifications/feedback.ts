import type { InAppReminder } from "../reminders/index.ts";

export function hasNewDueReminder(
  previousIds: ReadonlySet<string>,
  next: readonly InAppReminder[],
): boolean {
  return next.some((reminder) => reminder.readAt == null && reminder.dismissedAt == null && !previousIds.has(reminder.id));
}
export function playForegroundNotificationCue(): void {
  if (typeof window === "undefined" || document.visibilityState !== "visible") return;
  const AudioContextClass = window.AudioContext;
  if (AudioContextClass == null) return;
  try {
    const context = new AudioContextClass();
    const gain = context.createGain();
    const oscillator = context.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(660, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(880, context.currentTime + 0.12);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.2);
    oscillator.addEventListener("ended", () => { void context.close(); }, { once: true });
    if (typeof navigator.vibrate === "function") navigator.vibrate(40);
  } catch {
    // Browsers may reject audio before a user gesture. Visual feedback remains available.
  }
}
