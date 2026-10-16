/**
 * One line ("taxi 2000", "salaire deux cent mille", "2 pains à 250") turned into the capture sheet's
 * fields, on the device (ADR-0014, accepted 2026-10-16; W1 plan, docs/plans/2026-10-w1-capture.md).
 * Typed or dictated with the keyboard's microphone; nothing leaves the phone and nothing is saved
 * until the user chooses Add.
 *
 * The reader is a fixed pipeline, so the same line always gives the same result:
 *   tokens → numbers (digits and words) → items (one per purchase) → amount, direction, note,
 *   and a confidence that tells the screen whether to fill the fields or ask first.
 */

/** sure: fill the fields. check: show the reading and ask. none: no amount was found. */
export type Confidence = "sure" | "check" | "none";

export type AmountReading =
  | { how: "digits" | "words"; value: number }
  | { how: "quantity"; value: number; quantity: number; unitPrice: number };

export type QuickItem = {
  /** Major units as the amount field expects them ("2000", "12.5"), or null when none was said. */
  amount: string | null;
  reading: AmountReading | null;
  /** Other plausible amounts when the reading is in doubt (confidence "check"). */
  alternatives: string[];
  direction: "expense" | "income" | null;
  /** The word that decided the direction, as written. */
  directionWord: string | null;
  note: string;
  confidence: Confidence;
  /** Where this purchase starts in the line, so the rest can be read after it is saved. */
  from: number;
};

/** The first item, for callers that fill a single movement. */
export type QuickEntry = Pick<QuickItem, "amount" | "direction" | "note">;

export type QuickEntryOptions = {
  /** Currency of the amount field; CFA francs have no coins under 5, so "2 F" is doubtful there. */
  currency?: string;
};

// ---------------------------------------------------------------------------------------------
// Vocabulary. Matching is on lower-case words without accents; the note keeps the words as written.
// ---------------------------------------------------------------------------------------------

const UNITS: Record<string, number> = {
  zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9,
  dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16,
  one: 1, two: 2, three: 3, four: 4, five: 5, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = {
  vingt: 20, vingts: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60,
  // Belgian and Swiss forms, which some keyboards write.
  septante: 70, huitante: 80, octante: 80, nonante: 90,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const HUNDRED = new Set(["cent", "cents", "hundred"]);
const THOUSAND = new Set(["mille", "mil", "milles", "thousand"]);
const MILLION = new Set(["million", "millions"]);
/** Scale written right after digits: "25k", "2 mille", "1,2 million". */
const DIGIT_SCALE: Record<string, number> = { k: 1_000, mille: 1_000, mil: 1_000, million: 1_000_000, millions: 1_000_000, m: 1_000_000 };

const CURRENCY_WORDS = new Set(["f", "fr", "frs", "fcfa", "cfa", "xof", "franc", "francs", "euro", "euros", "eur", "dollar", "dollars", "usd"]);
/** Words that join two purchases: "taxi 500 et pain 250", "taxi 500, pain 250". */
const ITEM_JOINERS = new Set(["et", "puis", "plus", "and", "then"]);
/** "2 pains à 250", "3 sacs x 12 000", "2 pains de 250 chacun". */
const UNIT_PRICE_MARKERS = new Set(["a", "x", "de", "at", "chacun", "chacune", "each", "l'unite", "lunite", "piece", "la", "le"]);
// "to" is left out on purpose: without its accent, the dish "tô" reads the same.
const EDGE_FILLERS = new Set([
  "pour", "de", "d", "du", "des", "a", "au", "aux", "en", "j", "ai", "je", "on", "m", "ma", "mon", "mes",
  "le", "la", "les", "l", "un", "une", "et", "for", "of", "the", "i", "my",
]);
const DETERMINERS = new Set(["la", "ma", "sa", "ta", "une", "notre", "votre", "leur", "my", "the"]);

/** Verbs and nouns that say money went out. Verbs leave the note; nouns stay in it. */
const EXPENSE_VERBS = new Set([
  "paye", "payee", "payes", "payer", "regle", "reglee", "achete", "achetee", "achetes", "acheter",
  "depense", "depensee", "depenses", "donne", "donnee", "envoye", "envoyee", "cotise", "prete",
  "paid", "spent", "bought", "gave", "sent", "lent",
]);
const EXPENSE_NOUNS = new Set(["achat", "achats", "facture", "factures", "frais", "depense", "depenses"]);
const INCOME_VERBS = new Set([
  "recu", "recue", "recus", "gagne", "gagnee", "vendu", "vendue", "vendus", "encaisse", "empruntee", "emprunte",
  "received", "earned", "sold", "got", "borrowed",
]);
const INCOME_NOUNS = new Set(["salaire", "vente", "ventes", "bourse", "dividende", "dividendes", "interets", "recette", "recettes", "salary", "income", "sale", "sales", "refund"]);

// ---------------------------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------------------------

type Token = {
  /** As written, for the note. */
  raw: string;
  /** Lower case, no accents, no surrounding punctuation: what matching uses. */
  key: string;
  /** A sentence or list break after this token (",", ".", ";", "+", "/"). */
  breakAfter: boolean;
  /** Where the token sits in the line, so the note keeps the original spelling between words. */
  from: number;
  to: number;
  /** Digits as read, when the token is a number. */
  digits?: number;
};

function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

const NUMBER = String.raw`\d{1,3}(?:[   .]\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,3})?`;
/** One number with the letters glued to it ("25k", "35000f", "2,5k"), or one word. */
const TOKEN_PATTERN = new RegExp(String.raw`(${NUMBER})([a-zA-Z]{0,4})|[\p{L}\p{N}'’_-]+|[,.;:!?+/×]`, "gu");

function readDigits(text: string): number {
  const compact = text.replace(/[   ]/g, "");
  // A dot or comma followed by exactly three digits groups thousands ("1.500", "2,500"); otherwise it
  // is a decimal separator ("2,5", "12.50").
  const grouped = compact.replace(/[.,](?=\d{3}(?:[.,]|$))/g, "");
  return Number(grouped.replace(",", "."));
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const normalized = text.replace(/[’`]/g, "'");
  const push = (raw: string, key: string, from: number) => tokens.push({ raw, key, breakAfter: false, from, to: from + raw.length });
  for (const match of normalized.matchAll(TOKEN_PATTERN)) {
    const [whole, number, suffix] = match;
    const at = match.index;
    if (/^[,.;:!?+/×]$/.test(whole)) {
      const previous = tokens[tokens.length - 1];
      if (whole === "×") push(whole, "x", at);
      else if (previous != null) previous.breakAfter = true;
      continue;
    }
    if (number != null) {
      push(number, fold(number), at);
      tokens[tokens.length - 1]!.digits = readDigits(number);
      if (suffix != null && suffix.length > 0) push(suffix, fold(suffix), at + number.length);
      continue;
    }
    // Elisions split ("j'ai" → "j", "ai"; "l'unité" stays one marker); hyphens split only inside
    // number words ("quatre-vingt-dix"), so "taxi-moto" or "zoom-koom" stay whole in the note.
    const parts = whole.split("'");
    let offset = at;
    parts.forEach((part, index) => {
      const partAt = offset;
      offset += part.length + 1;
      if (part.length === 0) return;
      const key = fold(part);
      if (index === 0 && parts.length > 1 && key === "l" && fold(parts[1] ?? "") === "unite") return;
      if (index === 1 && fold(parts[0] ?? "") === "l" && key === "unite") {
        push(`l'${part}`, "l'unite", partAt - 2);
        return;
      }
      const pieces = part.split("-");
      if (pieces.length > 1 && pieces.every((piece) => isNumberWord(fold(piece)) || fold(piece) === "et")) {
        let pieceAt = partAt;
        for (const piece of pieces) {
          push(piece, fold(piece), pieceAt);
          pieceAt += piece.length + 1;
        }
      } else {
        push(part, key, partAt);
      }
    });
  }
  return tokens;
}

function isNumberWord(key: string): boolean {
  return key in UNITS || key in TENS || HUNDRED.has(key) || THOUSAND.has(key) || MILLION.has(key);
}

// ---------------------------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------------------------

type NumberSpan = { start: number; end: number; value: number; how: "digits" | "words" };

/** Value of a run of number words, French or English; null when the run is not a number. */
function wordsValue(keys: readonly string[]): number | null {
  let total = 0;
  let current = 0;
  let seen = false;
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index] ?? "";
    if (key === "et" || key === "and") continue;
    if (key in UNITS) {
      current += UNITS[key] ?? 0;
    } else if (key in TENS) {
      const tens = TENS[key] ?? 0;
      // French 80 is "quatre-vingt(s)", four times twenty.
      if (tens === 20 && keys[index - 1] === "quatre") current += 80 - 4;
      else current += tens;
    } else if (HUNDRED.has(key)) {
      current = (current === 0 ? 1 : current) * 100;
    } else if (THOUSAND.has(key)) {
      total += (current === 0 ? 1 : current) * 1_000;
      current = 0;
    } else if (MILLION.has(key)) {
      total += (current === 0 ? 1 : current) * 1_000_000;
      current = 0;
    } else {
      return null;
    }
    seen = true;
  }
  return seen ? total + current : null;
}

/** "et" joins number words only in "vingt et un", "soixante et onze", "one hundred and five". */
function joinsNumber(tokens: readonly Token[], index: number): boolean {
  const before = tokens[index - 1]?.key ?? "";
  const after = tokens[index + 1]?.key ?? "";
  if (tokens[index]?.key === "et") return before in TENS && (after === "un" || after === "une" || after === "onze");
  if (tokens[index]?.key === "and") return (HUNDRED.has(before) || THOUSAND.has(before)) && (after in UNITS || after in TENS);
  return false;
}

function findNumbers(tokens: readonly Token[]): NumberSpan[] {
  const spans: NumberSpan[] = [];
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index]!;
    if (token.digits != null) {
      let value = token.digits;
      let end = index + 1;
      const scale = tokens[end]?.key;
      if (scale != null && scale in DIGIT_SCALE && !token.breakAfter) {
        value *= DIGIT_SCALE[scale] ?? 1;
        end += 1;
      }
      spans.push({ start: index, end, value, how: "digits" });
      index = end;
      continue;
    }
    if (isNumberWord(token.key)) {
      let end = index;
      while (end < tokens.length && (isNumberWord(tokens[end]!.key) || joinsNumber(tokens, end)) && (end === index || !tokens[end - 1]!.breakAfter)) end += 1;
      const keys = tokens.slice(index, end).map((item) => item.key);
      const value = wordsValue(keys);
      // A lone "un" or "une" is an article ("un pain 250"), not the number one.
      const article = keys.length === 1 && (keys[0] === "un" || keys[0] === "une" || keys[0] === "one");
      if (value != null && value > 0 && !article) {
        spans.push({ start: index, end, value, how: "words" });
        index = end;
        continue;
      }
    }
    index += 1;
  }
  return spans;
}

// ---------------------------------------------------------------------------------------------
// Items, amounts, direction, note
// ---------------------------------------------------------------------------------------------

type Item = { start: number; end: number; numbers: NumberSpan[] };

/**
 * One item per purchase: a second amount starts a new item ("taxi 500 et pain 250", "taxi 500 pain
 * 250"), except a unit price ("2 pains à 250"). Words between two amounts belong to the next purchase
 * when the line starts with words ("taxi 500 pain 250"), to the previous one when it starts with an
 * amount ("500 taxi 250 pain").
 */
function splitItems(tokens: readonly Token[], numbers: readonly NumberSpan[]): Item[] {
  const items: Item[] = [];
  const amountFirst = numbers[0]?.start === 0;
  let current: Item = { start: 0, end: tokens.length, numbers: [] };
  for (const span of numbers) {
    const previous = current.numbers[current.numbers.length - 1];
    if (previous != null && !isUnitPrice(tokens, previous, span)) {
      const cut = amountFirst ? span.start : previous.end;
      items.push({ ...current, end: cut });
      current = { start: cut, end: tokens.length, numbers: [] };
    }
    current.numbers.push(span);
  }
  items.push(current);
  return items;
}

/**
 * A lone small number word next to a written amount is an adjective or an article, not a price:
 * "téléphone neuf 50 000", "un pain 250". It stays a number when it is a quantity ("deux pains à 250").
 */
function dropStrayWords(tokens: readonly Token[], numbers: readonly NumberSpan[]): NumberSpan[] {
  if (!numbers.some((span) => span.how === "digits")) return [...numbers];
  return numbers.filter((span, index) => {
    const lone = span.how === "words" && span.end - span.start === 1 && span.value < 20;
    const next = numbers[index + 1];
    return !lone || (next != null && isUnitPrice(tokens, span, next));
  });
}

/** "2 pains à 250": a small whole quantity, then a price after a marker, the quantity first. */
function isUnitPrice(tokens: readonly Token[], quantity: NumberSpan, price: NumberSpan): boolean {
  if (!Number.isInteger(quantity.value) || quantity.value < 2 || quantity.value > MAX_QUANTITY || price.value <= quantity.value) return false;
  const between = tokens.slice(quantity.end, price.start);
  if (between.length > 4 || between.some((token) => ITEM_JOINERS.has(token.key) || token.breakAfter)) return false;
  return between.some((token) => UNIT_PRICE_MARKERS.has(token.key));
}

const MAX_QUANTITY = 99;
/** CFA francs have no coin or note under 5 F; a purchase of a few francs is almost surely a misreading. */
const SMALLEST_PLAUSIBLE_CFA = 25;
const CFA_CURRENCIES = new Set(["XOF", "XAF"]);

function formatMajor(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

function directionOf(tokens: readonly Token[], from: number, to: number): { direction: QuickItem["direction"]; word: string | null; conflict: boolean } {
  let income: string | null = null;
  let expense: string | null = null;
  for (let index = from; index < to; index += 1) {
    const { key, raw } = tokens[index]!;
    const before = tokens[index - 1]?.key ?? "";
    const twoBefore = tokens[index - 2]?.key ?? "";
    if (key === "paye" || key === "paie") {
      // "la paye", "ma paie", "paye du mois" are the salary; "j'ai payé", "payé le taxi" are spending.
      const salary = DETERMINERS.has(before) || (tokens[index + 1]?.key === "du" && tokens[index + 2]?.key === "mois");
      if (salary) income ??= raw;
      else expense ??= raw;
    } else if (key === "rembourse" || key === "remboursee" || key === "remboursement" || key === "repaid" || key === "refunded") {
      // "Awa m'a remboursé", "remboursement de Awa": money back in; "j'ai remboursé Awa": money out.
      if ((before === "a" && twoBefore === "m") || key === "remboursement" || before === "me") income ??= raw;
      else if (before === "ai" || before === "i") expense ??= raw;
    } else if (EXPENSE_VERBS.has(key) || EXPENSE_NOUNS.has(key)) {
      expense ??= raw;
    } else if (INCOME_VERBS.has(key) || INCOME_NOUNS.has(key)) {
      income ??= raw;
    }
  }
  if (income != null && expense != null) return { direction: null, word: null, conflict: true };
  if (income != null) return { direction: "income", word: income, conflict: false };
  if (expense != null) return { direction: "expense", word: expense, conflict: false };
  return { direction: null, word: null, conflict: false };
}

/** Verbs say the direction and leave the note; nouns ("salaire", "facture") stay in it. */
function isDirectionVerb(key: string): boolean {
  return EXPENSE_VERBS.has(key) || INCOME_VERBS.has(key) || key === "rembourse" || key === "remboursee";
}

function noteOf(tokens: readonly Token[], keep: readonly number[], text: string): string {
  const kept = keep
    .map((index) => tokens[index]!)
    .filter((token) => !CURRENCY_WORDS.has(token.key) && !(isDirectionVerb(token.key) && token.key !== "paye") && !(token.key === "paye" && !isSalaryPaye(tokens, token)));
  while (kept.length > 0 && (EDGE_FILLERS.has(kept[0]!.key) || ITEM_JOINERS.has(kept[0]!.key))) kept.shift();
  while (kept.length > 0 && (EDGE_FILLERS.has(kept[kept.length - 1]!.key) || ITEM_JOINERS.has(kept[kept.length - 1]!.key) || UNIT_PRICE_MARKERS.has(kept[kept.length - 1]!.key))) kept.pop();
  // Neighbouring words keep what separated them in the line ("facture d'eau", "riz, sauce");
  // words that were apart (an amount removed between them) get a space.
  return kept.map((token, index) => {
    const previous = kept[index - 1];
    if (previous == null) return token.raw;
    const adjacent = tokens.indexOf(previous) + 1 === tokens.indexOf(token);
    const between = adjacent ? text.slice(previous.to, token.from).replace(/[’`]/g, "'") : " ";
    return `${/^[\s',-]*$/.test(between) ? between : " "}${token.raw}`;
  }).join("").replace(/\s+/g, " ").trim();
}

function isSalaryPaye(tokens: readonly Token[], token: Token): boolean {
  const index = tokens.indexOf(token);
  return DETERMINERS.has(tokens[index - 1]?.key ?? "") || (tokens[index + 1]?.key === "du" && tokens[index + 2]?.key === "mois");
}

/** Where a purchase starts once its joining word is skipped ("et pain 250" → "pain 250"). */
function startOf(tokens: readonly Token[], item: Item): number {
  let index = item.start;
  while (index < item.end - 1 && ITEM_JOINERS.has(tokens[index]!.key)) index += 1;
  return tokens[index]?.from ?? 0;
}

function readItem(tokens: readonly Token[], item: Item, text: string, options: QuickEntryOptions): QuickItem {
  const indices = Array.from({ length: item.end - item.start }, (_, offset) => item.start + offset);
  const { direction, word, conflict } = directionOf(tokens, item.start, item.end);
  const [first, second] = item.numbers;
  if (first == null) {
    return { amount: null, reading: null, alternatives: [], direction, directionWord: word, note: noteOf(tokens, indices, text), confidence: "none", from: startOf(tokens, item) };
  }
  let reading: AmountReading;
  let noteIndices: number[];
  if (second != null && isUnitPrice(tokens, first, second)) {
    reading = { how: "quantity", value: first.value * second.value, quantity: first.value, unitPrice: second.value };
    // The note keeps "2 pains" and drops "à 250" (and a trailing "chacun").
    noteIndices = indices.filter((index) =>
      (index < second.start || index >= second.end) && !(index >= first.end && UNIT_PRICE_MARKERS.has(tokens[index]!.key)));
  } else {
    reading = { how: first.how, value: first.value };
    noteIndices = indices.filter((index) => index < first.start || index >= first.end);
  }
  const alternatives: string[] = [];
  let confidence: Confidence = "sure";
  if (reading.how === "quantity") alternatives.push(formatMajor(reading.unitPrice));
  if (CFA_CURRENCIES.has(options.currency ?? "XOF") && reading.value < SMALLEST_PLAUSIBLE_CFA) confidence = "check";
  if (conflict) confidence = "check";
  return {
    amount: formatMajor(reading.value),
    reading,
    alternatives: confidence === "check" || reading.how === "quantity" ? alternatives : [],
    direction,
    directionWord: word,
    note: noteOf(tokens, noteIndices, text),
    confidence,
    from: startOf(tokens, item),
  };
}

/** Every purchase said in the line, in order; an empty line gives one empty item. */
export function readQuickEntry(text: string, options: QuickEntryOptions = {}): QuickItem[] {
  const tokens = tokenize(text);
  const numbers = dropStrayWords(tokens, findNumbers(tokens));
  const items = splitItems(tokens, numbers).map((item) => readItem(tokens, item, text, options));
  // A direction said once ("j'ai payé taxi 500 et pain 250") holds for the purchases that say none.
  const shared = items.find((item) => item.direction != null);
  if (shared != null && items.every((item) => item.direction == null || item.direction === shared.direction)) {
    for (const item of items) if (item.direction == null) item.direction = shared.direction;
  }
  return items.filter((item, index) => index === 0 || item.amount != null || item.note.length > 0);
}

export function parseQuickEntry(text: string, options: QuickEntryOptions = {}): QuickEntry {
  const [first] = readQuickEntry(text, options);
  return { amount: first?.amount ?? null, direction: first?.direction ?? null, note: first?.note ?? "" };
}
