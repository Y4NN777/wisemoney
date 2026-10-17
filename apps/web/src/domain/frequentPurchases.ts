import { noteKey } from "./categorySuggestion.ts";

/**
 * The purchases a person records most often, from movements already decrypted for the session (E1,
 * 2026-10-17): one tap fills the quick line with the note and its usual amount. Deterministic: most
 * frequent first, ties to the most recent; the amount is the one used most often for that note, ties
 * to the most recent.
 */

export type FrequentHistoryItem = {
  note: string;
  direction: "income" | "expense";
  /** Major units as the amount field expects them ("750"). */
  amount: string;
  timestamp: number;
};

export type FrequentPurchase = {
  /** The note as last written ("Riz gras"). */
  note: string;
  amount: string;
  uses: number;
};

type Group = { uses: number; last: number; note: string; amounts: Map<string, { uses: number; last: number }> };

export function frequentPurchases(
  history: readonly FrequentHistoryItem[],
  direction: "income" | "expense",
  limit = 3,
): FrequentPurchase[] {
  const groups = new Map<string, Group>();
  for (const item of history) {
    if (item.direction !== direction) continue;
    const key = noteKey(item.note);
    if (key.length === 0) continue;
    const group: Group = groups.get(key) ?? { uses: 0, last: 0, note: item.note.trim(), amounts: new Map<string, { uses: number; last: number }>() };
    group.uses += 1;
    if (item.timestamp >= group.last) {
      group.last = item.timestamp;
      group.note = item.note.trim();
    }
    const amount = group.amounts.get(item.amount) ?? { uses: 0, last: 0 };
    amount.uses += 1;
    amount.last = Math.max(amount.last, item.timestamp);
    group.amounts.set(item.amount, amount);
    groups.set(key, group);
  }
  return [...groups.entries()]
    .sort(([leftKey, left], [rightKey, right]) => right.uses - left.uses || right.last - left.last || leftKey.localeCompare(rightKey))
    .slice(0, limit)
    .map(([, group]) => {
      const [amount] = [...group.amounts.entries()].sort(([leftAmount, left], [rightAmount, right]) =>
        right.uses - left.uses || right.last - left.last || leftAmount.localeCompare(rightAmount));
      return { note: group.note, amount: amount![0], uses: group.uses };
    });
}

/**
 * The example shown in an empty quick line: the user's most frequent purchase, or, before any history,
 * an everyday purchase that fits the time of day.
 */
export function quickLineExample(frequent: readonly FrequentPurchase[], hour: number, starters: { morning: string; midday: string; evening: string }): string {
  const [top] = frequent;
  if (top != null) return `${top.note} ${top.amount}`;
  if (hour < 11) return starters.morning;
  if (hour < 16) return starters.midday;
  return starters.evening;
}
