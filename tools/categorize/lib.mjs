// Pure helpers for the category dataset (ADR-0015). Deterministic: the same input and seed give the
// same output, so a dataset can be rebuilt byte for byte from the raw Gemma files.
import { createHash } from "node:crypto";

/** Lower case, no accents, single spaces: two phrases equal under this are one phrase. */
export function normalizeText(text) {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** The first JSON array in a reply; Gemma sometimes wraps it in a code fence or a sentence. */
export function firstJsonArray(reply) {
  const start = reply.indexOf("[");
  const end = reply.lastIndexOf("]");
  if (start < 0 || end <= start) throw new Error(`no JSON array in reply: ${reply.slice(0, 200)}`);
  const value = JSON.parse(reply.slice(start, end + 1));
  if (!Array.isArray(value)) throw new Error("reply is not an array");
  return value;
}

export function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

/** Mulberry32 seeded from a string: a small, fast generator good enough for sampling and noise. */
export function seededRandom(seed) {
  let state = Number.parseInt(sha256(seed).slice(0, 8), 16) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function pick(random, items) {
  return items[Math.floor(random() * items.length)];
}

export function shuffled(random, items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
}

/** Train, validation or test, from the phrase itself: stable across runs and never leaking a phrase. */
export function splitOf(text, { validation = 0.1, test = 0.1 } = {}) {
  const bucket = Number.parseInt(sha256(normalizeText(text)).slice(0, 8), 16) / 0xffffffff;
  if (bucket < test) return "test";
  if (bucket < test + validation) return "validation";
  return "train";
}

function trigrams(text) {
  const padded = ` ${normalizeText(text).replace(/\d+/g, "0")} `;
  const grams = new Set();
  for (let index = 0; index + 3 <= padded.length; index += 1) grams.add(padded.slice(index, index + 3));
  return grams;
}

/** Character-trigram Jaccard, digits folded: "taxi 500" and "taxi 2000" count as the same phrase. */
export function similarity(left, right) {
  const a = trigrams(left);
  const b = trigrams(right);
  let shared = 0;
  for (const gram of a) if (b.has(gram)) shared += 1;
  return shared / (a.size + b.size - shared || 1);
}

/** Keeps the first of each group of near-identical phrases within the same class. */
export function dropNearDuplicates(rows, threshold = 0.85) {
  const kept = [];
  const byKey = new Map();
  for (const row of rows) {
    const peers = byKey.get(row.key) ?? [];
    if (peers.some((peer) => similarity(peer.text, row.text) >= threshold)) continue;
    peers.push(row);
    byKey.set(row.key, peers);
    kept.push(row);
  }
  return kept;
}

const AMOUNT_FORMATS = [
  (value) => String(value),
  (value) => value.toLocaleString("fr-FR").replace(/ /g, " "),
  (value) => value.toLocaleString("de-DE"),
  (value) => (value % 1000 === 0 ? `${value / 1000}k` : String(value)),
  (value) => `${value} F`,
  (value) => `${value}f`,
  (value) => `${value} FCFA`,
];

const NEIGHBOURS = { a: "qs", e: "rz", i: "uo", o: "ip", u: "yi", n: "bm", s: "ad", t: "ry", r: "et", m: "n", l: "k", c: "x" };

/** Rewrites the amount in a phrase in another common format; null when it has no digits. */
export function reformatAmount(text, random) {
  const match = /(\d[\d .]*\d|\d)(\s?(k|f|fcfa|francs?))?/i.exec(text);
  if (match == null) return null;
  const digits = Number(match[1].replace(/[ .]/g, ""));
  if (!Number.isFinite(digits) || digits === 0) return null;
  const value = /k/i.test(match[3] ?? "") ? digits * 1000 : digits;
  return text.replace(match[0], pick(random, AMOUNT_FORMATS)(value));
}

/** One keyboard slip: a neighbouring key, a dropped letter or two swapped letters, in a word of 4+. */
export function typo(text, random) {
  const words = text.split(" ");
  const candidates = words.map((word, index) => [word, index]).filter(([word]) => /^\p{L}{4,}$/u.test(word));
  if (candidates.length === 0) return null;
  const [word, index] = pick(random, candidates);
  const position = 1 + Math.floor(random() * (word.length - 2));
  const kind = Math.floor(random() * 3);
  let changed = word;
  if (kind === 0) {
    const options = NEIGHBOURS[word[position].toLowerCase()];
    if (options == null) return null;
    changed = word.slice(0, position) + pick(random, [...options]) + word.slice(position + 1);
  } else if (kind === 1) {
    changed = word.slice(0, position) + word.slice(position + 1);
  } else {
    changed = word.slice(0, position) + word[position + 1] + word[position] + word.slice(position + 2);
  }
  words[index] = changed;
  return words.join(" ");
}

/** Deterministic variants of a training phrase: another amount format, no accents, a typo, case. */
export function augment(row, seed, count = 2) {
  const random = seededRandom(`${seed}|${row.text}`);
  const makers = [
    (text) => reformatAmount(text, random),
    (text) => text.normalize("NFD").replace(/\p{M}/gu, ""),
    (text) => typo(text, random),
    (text) => text.toLowerCase(),
  ];
  const variants = new Set();
  for (const make of shuffled(random, makers)) {
    if (variants.size >= count) break;
    const text = make(row.text);
    if (text != null && text !== row.text) variants.add(text);
  }
  return [...variants].map((text) => ({ ...row, text, augmented: true }));
}

/** Counts per class and per split, for the manifest and the console. */
export function stats(rows, keys) {
  const table = Object.fromEntries(keys.map((key) => [key, { train: 0, validation: 0, test: 0 }]));
  for (const row of rows) table[row.key][row.split] += 1;
  return table;
}

/** Draws one item by weight (items carry a numeric `weight`). */
export function pickWeighted(random, items) {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let threshold = random() * total;
  for (const item of items) {
    threshold -= item.weight;
    if (threshold <= 0) return item;
  }
  return items[items.length - 1];
}

/**
 * The real-world words one request should draw on: sourced lexicon terms for that country and class,
 * a matching scenario, people and payment channels. Empty parts are left out; no lexicon, no block.
 */
export function contextFor(lexicon, random, { country, key, terms = 12 }) {
  if (lexicon == null) return { block: "", used: [] };
  const own = (lexicon.countries?.[country] ?? []).filter((entry) => entry.category === key);
  const chosen = shuffled(random, own).slice(0, terms);
  const scenarios = (lexicon.scenarios ?? []).filter((entry) => entry.categories?.includes(key));
  const scenario = scenarios.length > 0 ? pick(random, scenarios) : null;
  const people = shuffled(random, lexicon.people ?? []).slice(0, 4);
  const channels = (lexicon.paymentChannels ?? []).filter((entry) => entry.country === country);
  const lines = [];
  if (chosen.length > 0) lines.push(`Real local words for this class (use several, spelled as locals do): ${chosen.map((entry) => `${entry.term} (${entry.meaning})`).join("; ")}.`);
  if (scenario != null) lines.push(`A moment of life to set some notes in: ${scenario.scenario}${scenario.note ? ` (${scenario.note})` : ""}.`);
  if (people.length > 0) lines.push(`People often named in notes: ${people.map((entry) => `${entry.term} (${entry.meaning})`).join("; ")}.`);
  if (channels.length > 0) lines.push(`How money moves there: ${channels.map((entry) => entry.term).join(", ")}.`);
  return { block: lines.join("\n"), used: chosen.map((entry) => entry.term) };
}
