/**
 * The category a person already chose for the same note (W1 step 3, ADR-0015 point 3a): computed on
 * the device from movements already decrypted for the session; nothing is stored. Deterministic: the
 * most frequent category wins, ties go to the most recent use, then to the smaller id.
 */

export type SuggestionHistoryItem = {
  categoryId: string | null;
  direction: "income" | "expense";
  note: string;
  timestamp: number;
};

export type CategorySuggestion = {
  categoryId: string;
  /** "same": the same note was used before; "firstWord": a note starting with the same word. */
  basis: "same" | "firstWord";
  /** How many past movements back this suggestion. */
  uses: number;
};

/** Words that carry no meaning for a category: articles, prepositions, currency words. */
const IGNORED = new Set([
  "le", "la", "les", "l", "un", "une", "de", "du", "des", "d", "a", "au", "aux", "pour", "et", "en", "j", "ai",
  "f", "fr", "fcfa", "cfa", "franc", "francs", "the", "for", "of", "and",
]);

/** "Taxi  2000 F" and "taxi" have the same key: lower case, no accents, no amounts, no filler words. */
export function noteKey(note: string): string {
  return note
    .normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 0 && !/^\d+$/.test(word) && !IGNORED.has(word))
    .join(" ");
}

function pickBest(matches: readonly SuggestionHistoryItem[]): { categoryId: string; uses: number } | null {
  const byCategory = new Map<string, { uses: number; last: number }>();
  for (const item of matches) {
    if (item.categoryId == null) continue;
    const entry = byCategory.get(item.categoryId) ?? { uses: 0, last: 0 };
    entry.uses += 1;
    entry.last = Math.max(entry.last, item.timestamp);
    byCategory.set(item.categoryId, entry);
  }
  const [best] = [...byCategory.entries()].sort(([leftId, left], [rightId, right]) =>
    right.uses - left.uses || right.last - left.last || leftId.localeCompare(rightId));
  return best == null ? null : { categoryId: best[0], uses: best[1].uses };
}

export function suggestCategory(
  note: string,
  direction: "income" | "expense",
  history: readonly SuggestionHistoryItem[],
  usableCategoryIds: ReadonlySet<string>,
): CategorySuggestion | null {
  const key = noteKey(note);
  if (key.length === 0) return null;
  const candidates = history.filter((item) => item.direction === direction && item.categoryId != null && usableCategoryIds.has(item.categoryId));
  const keyed = candidates.map((item) => ({ item, key: noteKey(item.note) })).filter((entry) => entry.key.length > 0);

  const same = pickBest(keyed.filter((entry) => entry.key === key).map((entry) => entry.item));
  if (same != null) return { ...same, basis: "same" };

  const firstWord = key.split(" ")[0]!;
  const sharing = pickBest(keyed.filter((entry) => entry.key.split(" ")[0] === firstWord).map((entry) => entry.item));
  return sharing == null ? null : { ...sharing, basis: "firstWord" };
}
