import { describe, expect, it } from "vitest";
import { LITERACY_UNITS_EN } from "../../src/literacy/corpus.en.js";
import { LITERACY_UNITS_FR } from "../../src/literacy/corpus.fr.js";
import { findRelevantUnits } from "../../src/literacy/corpus.js";
// Helpers of the embedding script: the same hash it writes, computed here without any network call.
import { vectorHash } from "../../../../tools/literacy/embedLib.mjs";
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL, decodeVector, lessonText } from "./_embedding.js";
import { EVAL_VECTORS } from "./_evalVectors.js";
import { LESSON_VECTORS } from "./_lessonVectors.js";
import { RETRIEVAL_LIMIT, buildLessonIndex, retrieveLessons } from "./_retrieval.js";
import { RETRIEVAL_EVAL, type RetrievalCase } from "./_retrievalEval.js";

const corpora = { en: LITERACY_UNITS_EN, fr: LITERACY_UNITS_FR };
const indexes = { en: buildLessonIndex(corpora.en, LESSON_VECTORS.lessons.en), fr: buildLessonIndex(corpora.fr, LESSON_VECTORS.lessons.fr) };
const questionVectors = new Map(EVAL_VECTORS.map((vector) => [vector.id, decodeVector(vector)]));

/** Share of questions with a right lesson among those returned, and the mean reciprocal rank of the first one. */
function score(retrieve: (item: RetrievalCase) => string[]) {
  let found = 0;
  let reciprocal = 0;
  for (const item of RETRIEVAL_EVAL) {
    const position = retrieve(item).findIndex((id) => item.expected.includes(id));
    if (position >= 0) {
      found += 1;
      reciprocal += 1 / (position + 1);
    }
  }
  return { found, mrr: reciprocal / RETRIEVAL_EVAL.length };
}

describe("tutor retrieval", () => {
  it("ships one vector per lesson and per question, matching today's texts (re-run tools/literacy/embed.mjs when this fails)", () => {
    expect(LESSON_VECTORS.model).toBe(EMBEDDING_MODEL);
    expect(LESSON_VECTORS.dimensions).toBe(EMBEDDING_DIMENSIONS);
    for (const locale of ["en", "fr"] as const) {
      const stored = new Map(LESSON_VECTORS.lessons[locale].map((vector) => [vector.id, vector.hash]));
      for (const unit of corpora[locale]) {
        expect(stored.get(unit.id), `${locale} ${unit.id}`).toBe(vectorHash(EMBEDDING_MODEL, EMBEDDING_DIMENSIONS, "RETRIEVAL_DOCUMENT", lessonText(unit)));
      }
      expect(stored.size).toBe(corpora[locale].length);
    }
    const questions = new Map(EVAL_VECTORS.map((vector) => [vector.id, vector.hash]));
    for (const item of RETRIEVAL_EVAL) {
      expect(questions.get(item.id), item.id).toBe(vectorHash(EMBEDDING_MODEL, EMBEDDING_DIMENSIONS, "RETRIEVAL_QUERY", item.question));
    }
  });

  it("finds a right lesson for every labelled question, well above the phone's keyword matching", () => {
    // Measured 2026-10-06 on 55 questions: embeddings 55/55 (MRR 0.947); keywords 41/55; the
    // previous on-device matching 43/55 (MRR 0.645). The floors leave room for re-embedding noise.
    const embeddings = score((item) => retrieveLessons(indexes[item.locale], item.question, questionVectors.get(item.id)!).map(({ id }) => id));
    const previous = score((item) => findRelevantUnits(corpora[item.locale], item.question, 3).map(({ id }) => id));
    expect(embeddings.found).toBeGreaterThanOrEqual(53);
    expect(embeddings.mrr).toBeGreaterThan(0.85);
    expect(embeddings.found).toBeGreaterThan(previous.found);
  });

  it("keeps keyword search as a working fallback", () => {
    const keywords = score((item) => retrieveLessons(indexes[item.locale], item.question, null).map(({ id }) => id));
    expect(keywords.found).toBeGreaterThanOrEqual(38);
    expect(retrieveLessons(indexes.fr, "Comment marche une tontine ?", null)[0]?.id).toBe("savings-groups");
  });

  it("sends at most four lessons to the tutor", () => {
    const vector = questionVectors.get("fr-keep-my-money")!;
    expect(retrieveLessons(indexes.fr, "comment je fais pour garder mon argent ?", vector)).toHaveLength(RETRIEVAL_LIMIT);
    expect(RETRIEVAL_LIMIT).toBe(4);
  });
});
