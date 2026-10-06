import type { LiteracyUnit } from "../../src/literacy/corpus.js";
import { decodeVector, lessonText, type StoredVector } from "./_embedding.js";

/**
 * Retrieval over the literacy lessons (ADR-0013, amended 2026-10-06). Measured on the 55 labelled
 * questions of _retrievalEval.ts with gemini-embedding-001 at 768 dimensions: embeddings alone found a
 * right lesson in the top 4 for 55 of 55 (MRR 0.947); keyword search (BM25) 41 of 55; the two merged
 * by reciprocal rank fusion 47 of 55, because keyword noise pushed good lessons down. The research
 * (note RAG-1) found fusion better on other corpora; on these lessons it is not, so embeddings rank
 * and keyword search is only the fallback when the question cannot be embedded.
 */
export const RETRIEVAL_LIMIT = 4;
const BM25_K1 = 1.2;
const BM25_B = 0.75;

const STOP_WORDS = new Set([
  "a", "about", "after", "all", "an", "and", "are", "as", "at", "be", "but", "by", "can", "do", "does", "for", "from", "have",
  "how", "i", "if", "in", "is", "it", "me", "my", "of", "on", "or", "should", "so", "that", "the", "this", "to", "what",
  "when", "where", "which", "who", "why", "will", "with", "you", "your",
  "a", "au", "aux", "avec", "c", "ca", "ce", "ces", "cette", "comme", "comment", "d", "dans", "de", "des", "du", "elle",
  "en", "est", "et", "etre", "faire", "faut", "il", "ils", "j", "je", "l", "la", "le", "les", "leur", "lui", "m", "ma",
  "mais", "me", "mes", "moi", "mon", "n", "ne", "nous", "on", "ou", "par", "pas", "pour", "qu", "que", "quel", "quelle",
  "qui", "quoi", "s", "sa", "se", "ses", "si", "son", "sur", "t", "ta", "te", "tes", "toi", "ton", "tu", "un", "une",
  "vos", "votre", "vous", "y", "est-ce", "c'est", "dois", "peut", "peux", "plus", "tout", "tous", "tres", "bien",
]);

/** Lower case, no accents, no stop word, and a crude plural strip so "dettes" meets "dette". */
export function keywordTerms(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length >= 2 && !STOP_WORDS.has(term))
    .map((term) => (term.length > 4 && /[sx]$/.test(term) ? term.slice(0, -1) : term));
}

type IndexedLesson = { unit: LiteracyUnit; terms: Map<string, number>; length: number; vector: Float32Array | null };
export type LessonIndex = { lessons: IndexedLesson[]; documentFrequency: Map<string, number>; averageLength: number };

/** Built once per locale. Title and aliases are counted again so a lesson's own words weigh most. */
export function buildLessonIndex(units: readonly LiteracyUnit[], vectors: readonly StoredVector[] = []): LessonIndex {
  const byId = new Map(vectors.map((vector) => [vector.id, vector]));
  const documentFrequency = new Map<string, number>();
  const lessons = units.map((unit) => {
    const words = keywordTerms(`${lessonText(unit)}\n${unit.title}\n${unit.aliases.join(" ")}`);
    const terms = new Map<string, number>();
    for (const word of words) terms.set(word, (terms.get(word) ?? 0) + 1);
    for (const term of terms.keys()) documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    const stored = byId.get(unit.id);
    return { unit, terms, length: words.length, vector: stored == null ? null : decodeVector(stored) };
  });
  const averageLength = lessons.reduce((sum, lesson) => sum + lesson.length, 0) / Math.max(1, lessons.length);
  return { lessons, documentFrequency, averageLength };
}

/** Lessons with at least one query term, best first. */
export function keywordRanking(index: LessonIndex, question: string): Array<{ unit: LiteracyUnit; score: number }> {
  const queryTerms = [...new Set(keywordTerms(question))];
  const total = index.lessons.length;
  return index.lessons.map((lesson) => {
    let score = 0;
    for (const term of queryTerms) {
      const frequency = lesson.terms.get(term) ?? 0;
      if (frequency === 0) continue;
      const containing = index.documentFrequency.get(term) ?? 0;
      const idf = Math.log(1 + (total - containing + 0.5) / (containing + 0.5));
      score += idf * (frequency * (BM25_K1 + 1)) / (frequency + BM25_K1 * (1 - BM25_B + BM25_B * lesson.length / index.averageLength));
    }
    return { unit: lesson.unit, score };
  }).filter(({ score }) => score > 0).sort((left, right) => right.score - left.score);
}

/** Every lesson with a vector, by cosine to the (unit-length) question vector. */
export function denseRanking(index: LessonIndex, queryVector: Float32Array): Array<{ unit: LiteracyUnit; score: number }> {
  return index.lessons.flatMap((lesson) => {
    if (lesson.vector == null) return [];
    let dot = 0;
    for (let position = 0; position < queryVector.length; position += 1) dot += queryVector[position]! * lesson.vector[position]!;
    return [{ unit: lesson.unit, score: dot }];
  }).sort((left, right) => right.score - left.score);
}

/**
 * The lessons sent to the tutor: the closest by embedding, or by keywords when the question could not
 * be embedded. Off-topic questions still get the closest lessons; the tutor's rules refuse them.
 */
export function retrieveLessons(index: LessonIndex, question: string, queryVector: Float32Array | null, limit = RETRIEVAL_LIMIT): LiteracyUnit[] {
  const ranking = queryVector == null ? keywordRanking(index, question) : denseRanking(index, queryVector);
  return ranking.slice(0, limit).map(({ unit }) => unit);
}
