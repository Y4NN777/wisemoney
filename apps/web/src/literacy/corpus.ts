// Reached by the Vercel functions in api/: relative imports here must use .js specifiers (api/serverGraph.test.ts).
import { LITERACY_UNITS_EN } from "./corpus.en.js";
import { LITERACY_UNITS_FR } from "./corpus.fr.js";

/**
 * Literacy corpus v0 (ADR-0013): modern, international financial literacy written for young
 * Africans. Original text structured on the competency frameworks named in LITERACY_SOURCES.
 * Editorial draft: no local expert review yet (docs/literacy/corpus-v0.md).
 */
export const LITERACY_CORPUS_VERSION = "0.1.0-2026-10-03";

export type LiteracyLocale = "en" | "fr";

export const LITERACY_AREAS = ["earn", "spend", "digital", "grow", "borrow", "protect"] as const;
export type LiteracyAreaId = typeof LITERACY_AREAS[number];

export const LITERACY_SOURCES = {
  "oecd-infe-youth": "OECD/INFE Core Competencies Framework on Financial Literacy for Youth (2015)",
  "eu-oecd-digital": "EU/OECD-INFE Financial Competence Framework for Adults (2022), digital finance competences",
  bceao: "BCEAO (Central Bank of West African States)",
  brvm: "BRVM (Bourse Régionale des Valeurs Mobilières)",
} as const;
export type LiteracySourceId = keyof typeof LITERACY_SOURCES;

export type LiteracyUnit = {
  id: string;
  area: LiteracyAreaId;
  locale: LiteracyLocale;
  title: string;
  summary: string;
  points: string[];
  example: string;
  watchOut: string;
  aliases: string[];
  sources: LiteracySourceId[];
};

export const MAX_GROUNDING_UNITS = 3;

export function literacyLocale(locale: string): LiteracyLocale {
  return locale.toLowerCase().startsWith("fr") ? "fr" : "en";
}

export function getLiteracyUnits(locale: string): LiteracyUnit[] {
  return literacyLocale(locale) === "fr" ? LITERACY_UNITS_FR : LITERACY_UNITS_EN;
}

export function getLiteracyUnit(locale: string, id: string): LiteracyUnit | null {
  return getLiteracyUnits(locale).find((unit) => unit.id === id) ?? null;
}

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").replaceAll("’", "'").toLowerCase().trim();
}

const STOP_WORDS = new Set([
  "about", "avec", "avoir", "comment", "dans", "does", "faire", "from", "have", "how", "mais", "pour", "peut", "plus",
  "quoi", "some", "that", "the", "this", "tout", "une", "vous", "what", "with", "est", "sont", "des", "les", "mes",
  "mon", "sur", "and", "can", "are", "your", "que", "qui", "est-ce", "why", "pourquoi", "should", "dois", "faut",
]);

function terms(question: string): string[] {
  return normalize(question).split(/[^a-z0-9]+/).filter((term) => term.length >= 3 && !STOP_WORDS.has(term));
}

/**
 * Lexical retrieval, same shape as the help corpus. Aliases are the curated search terms, so they
 * weigh most; a generic word in a title ("buy") must not beat a precise alias ("bitcoin").
 * Returns an empty list when nothing matches, so the caller can tell "no lesson covers this".
 */
export function findRelevantUnits(units: readonly LiteracyUnit[], question: string, limit = MAX_GROUNDING_UNITS): LiteracyUnit[] {
  const wanted = terms(question);
  if (wanted.length === 0) return [];
  return units.map((unit, index) => {
    const title = normalize(unit.title);
    const aliases = normalize(unit.aliases.join(" "));
    const body = normalize([unit.summary, ...unit.points, unit.example, unit.watchOut].join(" "));
    const score = wanted.reduce((total, term) => total + (aliases.includes(term) ? 12 : 0) + (title.includes(term) ? 8 : 0) + (body.includes(term) ? 2 : 0), 0);
    return { unit, index, score };
  }).filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, limit)
    .map(({ unit }) => unit);
}

/** The lesson as plain Markdown: the offline answer, and the trusted context sent to the tutor. */
export function unitAsMarkdown(unit: LiteracyUnit): string {
  const labels = unit.locale === "fr"
    ? { example: "Exemple", watchOut: "Attention" }
    : { example: "Example", watchOut: "Watch out" };
  return [
    `**${unit.title}**`,
    unit.summary,
    unit.points.map((point) => `- ${point}`).join("\n"),
    `**${labels.example} :** ${unit.example}`.replace(" :", unit.locale === "fr" ? " :" : ":"),
    `**${labels.watchOut} :** ${unit.watchOut}`.replace(" :", unit.locale === "fr" ? " :" : ":"),
  ].join("\n\n");
}
