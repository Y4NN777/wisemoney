// Reached by the Vercel functions in api/: relative imports here must use .js specifiers (api/serverGraph.test.ts).
import { LITERACY_UNITS_EN } from "./corpus.en.js";
import { LITERACY_UNITS_FR } from "./corpus.fr.js";
import { LITERACY_PATH } from "./path.js";

export { LITERACY_SOURCES, type LiteracySource } from "./sources.js";
export { LITERACY_PATH };

/**
 * Literacy course v1 (ADR-0013, research logs of 2026-10-03). Every lesson was written from cited
 * sources, never from model knowledge: docs/literacy/course-v1.md lists them and
 * docs/literacy/evidence-v1.md traces each claim. The lesson files, the path and the source
 * registry are generated from content/literacy/area-*.json by tools/literacy/assemble.py.
 */
export const LITERACY_CORPUS_VERSION = "1.0.0-2026-10-03";

export type LiteracyLocale = "en" | "fr";

export type LiteracyAreaId = keyof typeof LITERACY_PATH;
export const LITERACY_AREAS = Object.keys(LITERACY_PATH) as LiteracyAreaId[];

export type LiteracyUnit = {
  id: string;
  area: LiteracyAreaId;
  locale: LiteracyLocale;
  title: string;
  summary: string;
  points: string[];
  example: string;
  /** One small thing to do this week: the course treats behaviour as part of literacy. */
  action: string;
  watchOut: string;
  aliases: string[];
  /** Ids in LITERACY_SOURCES. */
  sources: string[];
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
 * weigh most; a generic word in a title must not beat a precise alias. Returns an empty list when
 * nothing matches, so the caller can tell "no lesson covers this".
 */
export function findRelevantUnits(units: readonly LiteracyUnit[], question: string, limit = MAX_GROUNDING_UNITS): LiteracyUnit[] {
  const wanted = terms(question);
  if (wanted.length === 0) return [];
  return units.map((unit, index) => {
    const title = normalize(unit.title);
    const aliases = normalize(unit.aliases.join(" "));
    const body = normalize([unit.summary, ...unit.points, unit.example, unit.action, unit.watchOut].join(" "));
    const score = wanted.reduce((total, term) => total + (aliases.includes(term) ? 12 : 0) + (title.includes(term) ? 8 : 0) + (body.includes(term) ? 2 : 0), 0);
    return { unit, index, score };
  }).filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, limit)
    .map(({ unit }) => unit);
}

const LABELS: Record<LiteracyLocale, { example: string; action: string; watchOut: string }> = {
  en: { example: "**Example:**", action: "**Do this week:**", watchOut: "**Watch out:**" },
  fr: { example: "**Exemple :**", action: "**À faire cette semaine :**", watchOut: "**Attention :**" },
};

/** The lesson as plain Markdown: the on-device answer, and the trusted context sent to the tutor. */
export function unitAsMarkdown(unit: LiteracyUnit): string {
  const labels = LABELS[unit.locale];
  return [
    `**${unit.title}**`,
    unit.summary,
    unit.points.map((point) => `- ${point}`).join("\n"),
    `${labels.example} ${unit.example}`,
    `${labels.action} ${unit.action}`,
    `${labels.watchOut} ${unit.watchOut}`,
  ].join("\n\n");
}
