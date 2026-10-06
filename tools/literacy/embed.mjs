#!/usr/bin/env node
// Embeds the literacy lessons (and the labelled retrieval questions) with the Gemini API and writes
// apps/web/api/learn/_lessonVectors.ts and _evalVectors.ts. Run it after any lesson change:
//
//   LITERACY_GEMINI_API_KEY=<key> node tools/literacy/embed.mjs
//
// The key is read from the environment and never written. Only texts whose hash changed are sent.
// Node 22.6+ is needed to import the TypeScript sources directly.
import { writeFileSync } from "node:fs";
import { normalize, quantize, vectorHash } from "./embedLib.mjs";

const web = new URL("../../apps/web/", import.meta.url);
const load = (path) => import(new URL(path, web).href);

const { LITERACY_UNITS_EN } = await load("src/literacy/corpus.en.ts");
const { LITERACY_UNITS_FR } = await load("src/literacy/corpus.fr.ts");
const { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL, lessonText } = await load("api/learn/_embedding.ts");
const { RETRIEVAL_EVAL } = await load("api/learn/_retrievalEval.ts");
const previousLessons = await load("api/learn/_lessonVectors.ts").then((module) => module.LESSON_VECTORS).catch(() => null);
const previousEval = await load("api/learn/_evalVectors.ts").then((module) => module.EVAL_VECTORS).catch(() => null);

const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:batchEmbedContents`;
// The free tier's per-minute limits are not published (research note RAG-1); one forum reply gives
// 30,000 tokens a minute. A lesson is about 500 tokens, so 20 per batch and a pause between batches
// stay under it, and a 429 waits for the delay Google asks for (or a full minute).
const BATCH_SIZE = 20;
const PAUSE_BETWEEN_BATCHES_MS = 20_000;
const MAX_ATTEMPTS = 6;

const apiKey = process.env.LITERACY_GEMINI_API_KEY?.trim() ?? "";

/** Every text to embed, with the vector already shipped for it when its hash still matches. */
function plan(scope, entries, task, previous) {
  const known = new Map((previous ?? []).map((vector) => [vector.id, vector]));
  return entries.map(({ id, text }) => {
    const hash = vectorHash(EMBEDDING_MODEL, EMBEDDING_DIMENSIONS, task, text);
    const kept = known.get(id);
    // French and English lessons share ids: the scope keeps their vectors apart.
    return { key: `${scope}:${id}`, id, text, task, hash, kept: kept?.hash === hash ? kept : null };
  });
}

const lessonPlans = {
  en: plan("en", LITERACY_UNITS_EN.map((unit) => ({ id: unit.id, text: lessonText(unit) })), "RETRIEVAL_DOCUMENT", previousLessons?.lessons.en),
  fr: plan("fr", LITERACY_UNITS_FR.map((unit) => ({ id: unit.id, text: lessonText(unit) })), "RETRIEVAL_DOCUMENT", previousLessons?.lessons.fr),
};
const evalPlan = plan("eval", RETRIEVAL_EVAL.map((item) => ({ id: item.id, text: item.question })), "RETRIEVAL_QUERY", previousEval);
const pending = [...lessonPlans.en, ...lessonPlans.fr, ...evalPlan].filter((item) => item.kept == null);

if (process.argv.includes("--check")) {
  if (pending.length > 0) {
    console.error(`${pending.length} vector(s) out of date: ${pending.slice(0, 10).map((item) => item.id).join(", ")}${pending.length > 10 ? ", …" : ""}`);
    process.exit(1);
  }
  console.log("Vectors match the lessons and the questions.");
  process.exit(0);
}

if (pending.length > 0 && apiKey.length === 0) {
  console.error(`LITERACY_GEMINI_API_KEY is not set and ${pending.length} text(s) need embedding.`);
  process.exit(1);
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

/** The wait Google asks for in a 429 (RetryInfo "retryDelay": "37s"), plus a margin. */
function retryDelayMs(detail) {
  const match = /"retryDelay":\s*"(\d+(?:\.\d+)?)s"/.exec(detail);
  return match == null ? null : Math.ceil(Number(match[1]) * 1000) + 2_000;
}

/** The error message and the quota that was hit, without the rest of the payload. */
function quotaSummary(detail) {
  try {
    const error = JSON.parse(detail).error ?? {};
    const quotas = (error.details ?? []).flatMap((item) => item.violations ?? []).map((violation) => `${violation.quotaMetric ?? ""} ${violation.quotaId ?? ""} limit ${violation.quotaValue ?? "?"}`.trim());
    return [error.message?.split("\n")[0], ...quotas].filter(Boolean).join(" | ");
  } catch {
    return detail.slice(0, 500);
  }
}

async function embedBatch(items) {
  const body = {
    requests: items.map((item) => ({
      model: `models/${EMBEDDING_MODEL}`,
      content: { parts: [{ text: item.text }] },
      taskType: item.task,
      outputDimensionality: EMBEDDING_DIMENSIONS,
    })),
  };
  for (let attempt = 1; ; attempt += 1) {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
    });
    if (response.ok) {
      const json = await response.json();
      const embeddings = json.embeddings ?? [];
      if (embeddings.length !== items.length) throw new Error(`expected ${items.length} embeddings, got ${embeddings.length}`);
      return embeddings.map((embedding, index) => {
        const values = embedding.values ?? [];
        // A size other than the one asked means the request field was ignored: stop rather than ship it.
        if (values.length !== EMBEDDING_DIMENSIONS) throw new Error(`${items[index].id}: ${values.length} dimensions, expected ${EMBEDDING_DIMENSIONS}`);
        return normalize(values);
      });
    }
    const detail = await response.text();
    if ((response.status === 429 || response.status >= 500) && attempt < MAX_ATTEMPTS) {
      const wait = retryDelayMs(detail) ?? 65_000;
      console.warn(`HTTP ${response.status}, waiting ${Math.round(wait / 1000)} s (attempt ${attempt} of ${MAX_ATTEMPTS})`);
      await sleep(wait);
      continue;
    }
    throw new Error(`HTTP ${response.status}: ${quotaSummary(detail)}`);
  }
}

const fresh = new Map();

function stored(item) {
  if (item.kept != null) return item.kept;
  const vector = fresh.get(item.key);
  if (vector == null) return null;
  const { scale, data } = quantize(vector);
  return { id: item.id, hash: item.hash, scale, data };
}

const header = (what) => `// Generated by tools/literacy/embed.mjs (${EMBEDDING_MODEL}, ${EMBEDDING_DIMENSIONS} dimensions, int8).
// Do not edit by hand: ${what}, then run the script again. A unit test fails when this file no longer matches.
`;

/** Written after every batch, so a stopped run keeps what it already paid for; the next run sends only the rest. */
function writeFiles() {
  const keep = (items) => items.map(stored).filter((vector) => vector != null);
  const lessons = { model: EMBEDDING_MODEL, dimensions: EMBEDDING_DIMENSIONS, lessons: { en: keep(lessonPlans.en), fr: keep(lessonPlans.fr) } };
  writeFileSync(new URL("api/learn/_lessonVectors.ts", web), `${header("change the lesson in content/literacy/ and run tools/literacy/assemble.py")}import type { LessonVectorSet } from "./_embedding.js";

export const LESSON_VECTORS: LessonVectorSet = ${JSON.stringify(lessons, null, 1)};
`);
  const questions = keep(evalPlan);
  writeFileSync(new URL("api/learn/_evalVectors.ts", web), `${header("change the questions in _retrievalEval.ts")}import type { StoredVector } from "./_embedding.js";

export const EVAL_VECTORS: StoredVector[] = ${JSON.stringify(questions, null, 1)};
`);
  return { lessons: lessons.lessons.en.length + lessons.lessons.fr.length, questions: questions.length };
}

for (let start = 0; start < pending.length; start += BATCH_SIZE) {
  const batch = pending.slice(start, start + BATCH_SIZE);
  const vectors = await embedBatch(batch);
  batch.forEach((item, index) => fresh.set(item.key, vectors[index]));
  writeFiles();
  console.log(`embedded ${Math.min(start + BATCH_SIZE, pending.length)} / ${pending.length} (saved)`);
  if (start + BATCH_SIZE < pending.length) await sleep(PAUSE_BETWEEN_BATCHES_MS);
}

const written = writeFiles();
console.log(`Wrote ${written.lessons} lesson vectors and ${written.questions} question vectors (${pending.length} new).`);
