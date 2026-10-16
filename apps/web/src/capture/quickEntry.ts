/**
 * One line ("taxi 2000", "salaire deux cent mille") turned into the capture sheet's fields, on the
 * device (ADR-0014, accepted 2026-10-16). Typed or dictated with the keyboard's microphone; nothing
 * leaves the phone and nothing is saved until the user chooses Add.
 */
export type QuickEntry = {
  /** Major units as the amount field expects them ("2000", "12.5"), or null when none was said. */
  amount: string | null;
  direction: "expense" | "income" | null;
  note: string;
};

const UNITS: Record<string, number> = {
  zero: 0, "zéro": 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9,
  dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16,
  vingt: 20, vingts: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60,
  one: 1, two: 2, three: 3, four: 4, five: 5, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const HUNDRED = new Set(["cent", "cents", "hundred"]);
const THOUSAND = new Set(["mille", "mil", "thousand"]);
const MILLION = new Set(["million", "millions"]);
const JOINERS = new Set(["et", "and"]);

const CURRENCY_WORDS = new Set(["f", "fr", "fcfa", "cfa", "xof", "franc", "francs", "euro", "euros", "€", "$", "dollar", "dollars"]);
const FILLERS = new Set(["pour", "de", "d", "du", "des", "à", "a", "au", "for", "on", "of", "j", "ai", "i", "the", "le", "la", "les", "un", "une"]);
const INCOME = ["reçu", "recu", "reçue", "salaire", "paie", "paye", "vente", "vendu", "gagné", "gagne", "received", "salary", "income", "sold", "earned"];
const EXPENSE = ["payé", "paye", "dépensé", "depense", "dépense", "acheté", "achete", "paid", "spent", "bought"];
/** Verbs only say the direction; nouns such as "salaire" or "vente" stay in the note. */
const DIRECTION_VERBS = new Set(["payé", "dépensé", "depense", "acheté", "achete", "reçu", "recu", "reçue", "gagné", "gagne", "vendu", "paid", "spent", "bought", "received", "earned", "sold"]);

const SCALE: Record<string, number> = { k: 1_000, mille: 1_000, m: 1_000_000, million: 1_000_000, millions: 1_000_000 };

/** Words as written (for the note); compare them through lower(). */
function words(text: string): string[] {
  return text.replace(/[’']/g, " ").split(/[\s-]+/).filter((word) => word.length > 0);
}

const lower = (tokens: readonly string[]) => tokens.map((token) => token.toLowerCase());

/** "2 000", "2.000", "2000,5", "2k", "2,5k", "3 mille", "1,2 million". */
function digitAmount(text: string): { value: number; span: [number, number] } | null {
  const pattern = /(\d{1,3}(?:[   .]\d{3})+|\d+)(?:[.,](\d{1,2}))?(?:\s*(k|mille|millions?|m)\b)?/i;
  const match = pattern.exec(text);
  if (match == null) return null;
  const whole = (match[1] ?? "").replace(/[   .]/g, "");
  const value = Number(`${whole}.${match[2] ?? "0"}`) * (SCALE[(match[3] ?? "").toLowerCase()] ?? 1);
  return Number.isFinite(value) ? { value, span: [match.index, match.index + match[0].length] } : null;
}

/** The longest run of number words, e.g. "deux cent cinquante mille", "quatre-vingt-dix". */
function wordAmount(tokens: readonly string[]): { value: number; start: number; end: number } | null {
  let best: { value: number; start: number; end: number } | null = null;
  for (let start = 0; start < tokens.length; start += 1) {
    let total = 0;
    let current = 0;
    let end = start;
    let seen = false;
    for (let index = start; index < tokens.length; index += 1) {
      const token = tokens[index] ?? "";
      if (JOINERS.has(token) && seen) continue;
      if (token in UNITS) {
        const unit = UNITS[token] ?? 0;
        // French 80 is "quatre-vingt(s)": four times twenty, not four plus twenty.
        if (unit === 20 && tokens[index - 1] === "quatre") current += 76;
        else current += unit;
      } else if (HUNDRED.has(token)) {
        current = (current === 0 ? 1 : current) * 100;
      } else if (THOUSAND.has(token)) {
        total += (current === 0 ? 1 : current) * 1_000;
        current = 0;
      } else if (MILLION.has(token)) {
        total += (current === 0 ? 1 : current) * 1_000_000;
        current = 0;
      } else {
        break;
      }
      seen = true;
      end = index + 1;
    }
    const value = total + current;
    if (seen && value > 0 && (best == null || end - start > best.end - best.start)) best = { value, start, end };
  }
  return best;
}

function formatMajor(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

function cleanNote(tokens: readonly string[]): string {
  const kept = tokens.filter((token) => {
    const bare = token.toLowerCase().replace(/[.,;:!?]+$/, "");
    return !CURRENCY_WORDS.has(bare) && !DIRECTION_VERBS.has(bare);
  });
  while (kept.length > 0 && FILLERS.has((kept[0] ?? "").toLowerCase())) kept.shift();
  while (kept.length > 0 && FILLERS.has((kept[kept.length - 1] ?? "").toLowerCase())) kept.pop();
  return kept.join(" ").replace(/\s+([,.;:!?])/g, "$1").replace(/^[,.;:\s]+|[,.;:\s]+$/g, "");
}

function directionOf(tokens: readonly string[]): QuickEntry["direction"] {
  const said = lower(tokens);
  if (said.some((token) => INCOME.includes(token))) return "income";
  if (said.some((token) => EXPENSE.includes(token))) return "expense";
  return null;
}

export function parseQuickEntry(text: string): QuickEntry {
  const digits = digitAmount(text);
  if (digits != null) {
    const rest = `${text.slice(0, digits.span[0])} ${text.slice(digits.span[1])}`;
    const tokens = words(rest);
    return { amount: formatMajor(digits.value), direction: directionOf(words(text)), note: cleanNote(tokens) };
  }
  const tokens = words(text);
  const spoken = wordAmount(lower(tokens));
  if (spoken == null) return { amount: null, direction: directionOf(tokens), note: cleanNote(tokens) };
  return {
    amount: formatMajor(spoken.value),
    direction: directionOf(tokens),
    note: cleanNote([...tokens.slice(0, spoken.start), ...tokens.slice(spoken.end)]),
  };
}
