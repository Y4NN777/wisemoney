import type { LiteracyLocale, LiteracyUnit } from "../../src/literacy/corpus.js";

/**
 * The embedding side of the tutor's retrieval (ADR-0013, amended 2026-10-06). Lessons are embedded
 * once by tools/literacy/embed.mjs and shipped in _lessonVectors.ts; the question is embedded per
 * request with the same model, task family and size, because vectors from different models or
 * settings do not share a space.
 */
export const EMBEDDING_MODEL = "gemini-embedding-001";
/** 768 of 3072: MTEB 67.99 against 68.17 at 1536 (research note RAG-1, 2026-10-05). */
export const EMBEDDING_DIMENSIONS = 768;

export type EmbeddingTask = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

/** One vector, quantised to int8 with its scale, base64-encoded. `hash` ties it to the text it came from. */
export type StoredVector = { id: string; hash: string; scale: number; data: string };

export type LessonVectorSet = {
  model: string;
  dimensions: number;
  lessons: Record<LiteracyLocale, StoredVector[]>;
};

/** The text a lesson is embedded and keyword-searched from: everything a learner could ask about. */
export function lessonText(unit: LiteracyUnit): string {
  return [
    unit.title,
    unit.aliases.join(" ; "),
    unit.summary,
    ...unit.points,
    unit.example,
    unit.action,
    unit.watchOut,
  ].join("\n");
}

/** Back to a unit-length float vector. */
export function decodeVector(stored: StoredVector): Float32Array {
  const binary = atob(stored.data);
  const vector = new Float32Array(binary.length);
  let norm = 0;
  for (let index = 0; index < binary.length; index += 1) {
    const byte = binary.charCodeAt(index);
    const value = (byte > 127 ? byte - 256 : byte) * stored.scale;
    vector[index] = value;
    norm += value * value;
  }
  const length = Math.sqrt(norm) || 1;
  for (let index = 0; index < vector.length; index += 1) vector[index] = vector[index]! / length;
  return vector;
}

/** Unit length, which the API leaves to the caller below 3072 dimensions. */
export function normalizeVector(values: readonly number[]): Float32Array {
  const length = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0)) || 1;
  return Float32Array.from(values, (value) => value / length);
}
