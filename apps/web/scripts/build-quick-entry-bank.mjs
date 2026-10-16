#!/usr/bin/env node
// Builds src/capture/quickEntry.bank.json, the test bank of the quick-entry reader (W1 plan,
// docs/plans/2026-10-w1-capture.md). Deterministic: same seed, same file.
//
//   node scripts/build-quick-entry-bank.mjs
//
// Two parts:
// - curated: phrases written and checked by hand (dictation forms, measured misreads of 2026-10-16);
// - generated: templates of how people type or dictate a movement, filled with Burkina Faso terms from
//   the sourced lexicon (tools/categorize/context/west-africa-lexicon.json), realistic CFA amounts
//   and every amount format. The expected reading follows from the template, not from the reader.
import { readFileSync, writeFileSync } from "node:fs";

const SEED = "quick-entry-bank-2026-10-16";
const GENERATED = 320;

const lexicon = JSON.parse(readFileSync(new URL("../../../tools/categorize/context/west-africa-lexicon.json", import.meta.url), "utf8"));

// --- Seeded random (mulberry32 from a string hash) -------------------------------------------
function seeded(seed) {
  let state = 0;
  for (const char of seed) state = (Math.imul(state, 31) + char.charCodeAt(0)) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}
const random = seeded(SEED);
const pick = (items) => items[Math.floor(random() * items.length)];

// --- French number words (standard spelling, as French dictation writes them) ----------------
const UNITS = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize"];
const TENS = { 2: "vingt", 3: "trente", 4: "quarante", 5: "cinquante", 6: "soixante" };
function below100(n) {
  if (n < 17) return UNITS[n];
  if (n < 20) return `dix-${UNITS[n - 10]}`;
  if (n < 70) {
    const tens = TENS[Math.floor(n / 10)];
    const unit = n % 10;
    return unit === 0 ? tens : unit === 1 ? `${tens} et un` : `${tens}-${UNITS[unit]}`;
  }
  if (n < 80) return n === 71 ? "soixante et onze" : `soixante-${below100(n - 60)}`;
  if (n === 80) return "quatre-vingts";
  return `quatre-vingt-${below100(n - 80)}`;
}
function below1000(n) {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds === 0) return below100(rest);
  const head = hundreds === 1 ? "cent" : `${UNITS[hundreds]} cent${rest === 0 ? "s" : ""}`;
  return rest === 0 ? head : `${head} ${below100(rest)}`;
}
function frenchWords(n) {
  if (n >= 1_000_000) {
    const millions = Math.floor(n / 1_000_000);
    const rest = n % 1_000_000;
    const head = `${below1000(millions)} million${millions > 1 ? "s" : ""}`;
    return rest === 0 ? head : `${head} ${frenchWords(rest)}`;
  }
  const thousands = Math.floor(n / 1000);
  const rest = n % 1000;
  if (thousands === 0) return below1000(rest);
  const head = thousands === 1 ? "mille" : `${below1000(thousands)} mille`;
  return rest === 0 ? head : `${head} ${below1000(rest)}`;
}

// --- Amounts and how they are written ---------------------------------------------------------
const AMOUNTS = [25, 50, 100, 150, 200, 250, 300, 350, 400, 500, 600, 700, 750, 800, 1000, 1250, 1500, 2000, 2500, 3000, 3500, 4000, 5000, 6000, 7500, 10000, 12500, 15000, 20000, 25000, 35000, 50000, 75000, 100000, 150000, 250000];
const grouped = (n, separator) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, separator);
const FORMATS = [
  (n) => String(n),
  (n) => grouped(n, " "),
  (n) => grouped(n, "."),
  (n) => `${n} F`,
  (n) => `${n}f`,
  (n) => `${grouped(n, " ")} FCFA`,
  (n) => `${grouped(n, " ")} francs`,
  (n) => (n >= 1000 && n % 1000 === 0 ? `${n / 1000}k` : String(n)),
  (n) => (n >= 1000 && n % 500 === 0 && n % 1000 !== 0 ? `${String(n / 1000).replace(".", ",")}k` : String(n)),
  (n) => (n >= 1000 && n % 1000 === 0 ? `${n / 1000} mille` : String(n)),
  (n) => frenchWords(n),
  (n) => frenchWords(n),
];
const written = (n) => pick(FORMATS)(n);

// --- Terms from the sourced lexicon -----------------------------------------------------------
const fold = (text) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const RESERVED = new Set([
  "et", "puis", "plus", "x", "a", "de", "du", "des", "la", "le", "les", "un", "une", "pour", "au", "aux", "en", "l", "d", "j", "m",
  "paye", "payer", "achat", "achats", "facture", "frais", "vente", "ventes", "salaire", "recu", "bourse", "recette", "recettes",
  "depense", "depenses", "rembourse", "remboursement", "f", "fr", "fcfa", "cfa", "francs", "franc", "k", "mille", "cent", "million",
  "chacun", "piece", "neuf", "huit", "sept", "six", "cinq", "quatre", "trois", "deux", "dix", "vingt", "trente", "soixante", "interets", "dividende",
]);
function usableTerm(term) {
  if (!/^[\p{L}' -]+$/u.test(term) || term.length > 30) return false;
  return term.split(/[\s'-]+/).every((word) => word.length > 0 && !RESERVED.has(fold(word)));
}
const EXPENSE_KEYS = new Set(["foodDining", "transport", "housing", "utilities", "entertainment", "healthcare", "education", "shopping", "personalCare", "insurance", "subscriptions", "giftsDonations", "travel"]);
const terms = [...new Set(lexicon.countries.BF.filter((entry) => EXPENSE_KEYS.has(entry.category)).map((entry) => entry.term).filter(usableTerm))];
const people = [...new Set([...lexicon.people.map((entry) => entry.term).filter(usableTerm), "Awa", "Moussa", "Fatim", "Issa", "Salif", "Aminata"])];
const capital = (text) => text.charAt(0).toUpperCase() + text.slice(1);

// --- Templates: text and the reading it must give ---------------------------------------------
const one = (amount, direction, note) => ({ amount: String(amount), direction, note });
const TEMPLATES = [
  ["note-amount", () => { const t = pick(terms); const n = pick(AMOUNTS); return [`${t} ${written(n)}`, [one(n, null, t)]]; }],
  ["dictated", () => { const t = pick(terms); const n = pick(AMOUNTS); return [`${capital(t)} ${frenchWords(n)}.`, [one(n, null, capital(t))]]; }],
  ["paid-for", () => { const t = pick(terms); const n = pick(AMOUNTS); return [`j'ai payé ${written(n)} pour ${t}`, [one(n, "expense", t)]]; }],
  ["paid-unaccented", () => { const t = pick(terms); const n = pick(AMOUNTS); return [`j'ai paye ${t} ${written(n)}`, [one(n, "expense", t)]]; }],
  ["amount-note", () => { const t = pick(terms); const n = pick(AMOUNTS); return [`${written(n)} ${t}`, [one(n, null, t)]]; }],
  ["bought-at", () => { const t = pick(terms); const n = pick(AMOUNTS); return [`acheté ${t} à ${written(n)}`, [one(n, "expense", t)]]; }],
  ["received-from", () => { const p = pick(people); const n = pick(AMOUNTS); return [`reçu ${written(n)} de ${p}`, [one(n, "income", p)]]; }],
  ["salary", () => { const n = pick(AMOUNTS.filter((value) => value >= 25000)); return [`salaire ${written(n)}`, [one(n, "income", "salaire")]]; }],
  ["repaid-me", () => { const p = pick(people); const n = pick(AMOUNTS); return [`${capital(p)} m'a remboursé ${written(n)}`, [one(n, "income", capital(p))]]; }],
  ["sold", () => { const t = pick(terms); const n = pick(AMOUNTS); return [`vendu ${t} ${written(n)}`, [one(n, "income", t)]]; }],
  ["quantity", () => { const t = pick(terms); const q = 2 + Math.floor(random() * 4); const p = pick(AMOUNTS.filter((value) => value >= 50 && value <= 5000)); return [`${q} ${t} à ${p}`, [one(q * p, null, `${q} ${t}`)]]; }],
  ["two-purchases", () => { const [a, b] = [pick(terms), pick(terms)]; const [m, n] = [pick(AMOUNTS), pick(AMOUNTS)]; return [`${a} ${m} et ${b} ${n}`, [one(m, null, a), one(n, null, b)]]; }],
];

// --- Curated phrases, checked by hand ----------------------------------------------------------
const CURATED = [
  ["taxi 2000", [one(2000, null, "taxi")]],
  ["Taxi deux mille.", [one(2000, null, "Taxi")]],
  ["j'ai paye le taxi 2000", [one(2000, "expense", "taxi")]],
  ["Payé 1500 pour le pain", [one(1500, "expense", "pain")]],
  ["2 pains à 250", [one(500, null, "2 pains")]],
  ["j'ai vendu 3 sacs à 12000", [one(36000, "income", "3 sacs")]],
  ["3 x 500 brochettes", [one(1500, null, "3 brochettes")]],
  ["taxi 500 et pain 250", [one(500, null, "taxi"), one(250, null, "pain")]],
  ["taxi 500 pain 250", [one(500, null, "taxi"), one(250, null, "pain")]],
  ["Taxi, deux mille. Pain, cinq cents.", [one(2000, null, "Taxi"), one(500, null, "Pain")]],
  ["j'ai payé taxi 500 et pain 250", [one(500, "expense", "taxi"), one(250, "expense", "pain")]],
  ["deux mille cinq cents crédit orange", [one(2500, null, "crédit orange")]],
  ["reçu 25000 de tonton", [one(25000, "income", "tonton")]],
  ["salaire 75k", [one(75000, "income", "salaire")]],
  ["la paye 200 000", [one(200000, "income", "paye")]],
  ["Paye du mois 150 000", [one(150000, "income", "Paye du mois")]],
  ["riz gras sept cent cinquante", [one(750, null, "riz gras")]],
  ["facture d'eau 4500", [one(4500, "expense", "facture d'eau")]],
  ["J’ai payé 3000 F de crédit téléphone", [one(3000, "expense", "crédit téléphone")]],
  ["essence 1.500", [one(1500, null, "essence")]],
  ["loyer 35 000f", [one(35000, null, "loyer")]],
  ["Moto 2 500 FCFA", [one(2500, null, "Moto")]],
  ["moto 2 mille", [one(2000, null, "moto")]],
  ["J'ai donné 5000 à maman", [one(5000, "expense", "maman")]],
  ["remboursement de Awa 3000", [one(3000, "income", "remboursement de Awa")]],
  ["Awa m'a remboursé 3000", [one(3000, "income", "Awa")]],
  ["j'ai remboursé Awa 3000", [one(3000, "expense", "Awa")]],
  ["frais OM 250", [one(250, "expense", "frais OM")]],
  ["téléphone neuf 50 000", [one(50000, null, "téléphone neuf")]],
  ["un pain 250", [one(250, null, "pain")]],
  ["zoom-koom 200", [one(200, null, "zoom-koom")]],
  ["taxi-moto 300", [one(300, null, "taxi-moto")]],
  ["soixante-dix mille loyer", [one(70000, null, "loyer")]],
  ["quatre-vingt-quinze mille", [one(95000, null, "")]],
  ["soixante et onze mille", [one(71000, null, "")]],
  ["vingt et un mille cinq cents", [one(21500, null, "")]],
  ["1,2 million terrain", [one(1200000, null, "terrain")]],
  ["cent", [one(100, null, "")]],
  ["Tô cinquante.", [one(50, null, "Tô")]],
  ["tô 200 et sauce 150", [one(200, null, "tô"), one(150, null, "sauce")]],
  ["taxi pour aller au marché", [{ amount: null, direction: null, note: "taxi pour aller au marché" }]],
  ["salaire", [{ amount: null, direction: "income", note: "salaire" }]],
];

const seen = new Set(CURATED.map(([text]) => text));
const generated = [];
while (generated.length < GENERATED) {
  const [name, make] = pick(TEMPLATES);
  const [text, expected] = make();
  if (seen.has(text)) continue;
  seen.add(text);
  generated.push({ text, expected, source: `template:${name}` });
}

const bank = {
  built: "2026-10-16",
  seed: SEED,
  note: "Curated phrases are checked by hand; generated ones follow their template. Rebuild with node scripts/build-quick-entry-bank.mjs.",
  phrases: [...CURATED.map(([text, expected]) => ({ text, expected, source: "curated" })), ...generated],
};
writeFileSync(new URL("../src/capture/quickEntry.bank.json", import.meta.url), `${JSON.stringify(bank, null, 1)}\n`);
console.log(`${bank.phrases.length} phrases (${CURATED.length} curated, ${generated.length} generated from ${terms.length} terms)`);
