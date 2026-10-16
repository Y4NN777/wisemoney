#!/usr/bin/env node
// Builds the category-suggestion dataset (ADR-0015) with Gemma as the teacher.
//
//   CATEGORIZE_GEMINI_API_KEY=<key> node tools/categorize/generate.mjs [options]
//
// Stages, each resumable (raw replies are appended to data/raw/, never rewritten):
//   generate  every class × style × round, with a persona and a town drawn per request
//   contrast  phrases on both sides of each confusable pair (labelingGuide.mjs CONFUSABLE_PAIRS)
//   label     two blind labelling passes at temperature 0, in two different orders
//   build     offline: keep phrases where intent and both passes agree, drop near duplicates, split
//             by hash (train / validation / test), augment train only, write data/dataset.jsonl,
//             data/review.jsonl (disagreements) and data/manifest.json
//
// Options: --rounds N (default 3)  --per-request N (default 30)  --only key1,key2
//          --stage generate|contrast|label|build (default: all)  --dry-run (print one prompt, no call)
//          --pause-ms N (default 4000)  --seed S (default the guide version)
// The key is read from the environment and never written. Rebuilding with "--stage build" needs no key.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { CATEGORIES, CONFUSABLE_PAIRS, GUIDE_VERSION, KEYS, NONE, PERSONAS, TOWNS, guideText } from "./labelingGuide.mjs";
import { augment, dropNearDuplicates, firstJsonArray, normalizeText, pick, seededRandom, sha256, shuffled, splitOf, stats } from "./lib.mjs";
import { geminiClient } from "./gemini.mjs";

const MODEL = "gemma-4-26b-a4b-it";
const LABEL_BATCH = 40;
const MAX_PHRASE_LENGTH = 120;
const AUGMENTATIONS_PER_PHRASE = 2;

const { values: options } = parseArgs({
  options: {
    rounds: { type: "string", default: "3" },
    "per-request": { type: "string", default: "30" },
    only: { type: "string" },
    stage: { type: "string" },
    "dry-run": { type: "boolean", default: false },
    "pause-ms": { type: "string", default: "4000" },
    seed: { type: "string", default: GUIDE_VERSION },
  },
});
const ROUNDS = Number(options.rounds);
const PER_REQUEST = Number(options["per-request"]);
const SEED = options.seed;
const ONLY = options.only?.split(",").map((key) => key.trim());
const runs = (stage) => options.stage == null || options.stage === stage;

const STYLES = {
  terse: "notes typed quickly in an expense app: 1 to 4 words, most with an amount in CFA francs written in varied ways (2000, 2 000, 2k, 1.500, 25 000 F)",
  spoken: "sentences as someone would dictate them to their phone in French, amounts in words or digits",
  messy: "notes with typos, SMS spelling, missing accents and abbreviations, as typed fast on a cheap phone",
  local: "notes using everyday words of Burkina Faso and West Africa: local French, Mooré or Dioula words written in Latin letters, local brands, operators, places and dishes",
  english: "short notes in English, some mixing French words, as typed by a young francophone",
  noAmount: "notes with no amount at all, only what the money was for, 1 to 5 words",
};

const dataDir = new URL("./data/", import.meta.url);
const rawDir = new URL("./raw/", dataDir);
mkdirSync(rawDir, { recursive: true });
const raw = (name) => new URL(name, rawDir);
const readJsonl = (url) => (existsSync(url) ? readFileSync(url, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line)) : []);
const appendJsonl = (url, rows) => appendFileSync(url, rows.map((row) => `${JSON.stringify(row)}\n`).join(""));
const writeJsonl = (url, rows) => writeFileSync(url, rows.map((row) => `${JSON.stringify(row)}\n`).join(""));

const GUIDE = guideText();
const classes = [...CATEGORIES, NONE].filter((category) => ONLY == null || ONLY.includes(category.key));
const describe = (key) => {
  const category = [...CATEGORIES, NONE].find((item) => item.key === key);
  return key === NONE.key ? `the class "none": ${NONE.covers}` : `the category "${key}" (${category.direction}): ${category.covers}`;
};

function generationPrompt({ key, style, persona, town, count }) {
  return `You write training data for WiseMoney, a personal-finance app used by young people in Burkina Faso.
The app sorts each money movement into one of these classes:
${GUIDE}

Write ${count} different notes that ${persona} in ${town} would write for movements belonging to ${describe(key)}.
Style: ${STYLES[style]}.
Cover many different items, places, people and amounts; no two notes alike; nothing that clearly belongs to another class.
Answer with a JSON array of strings only.`;
}

function contrastPrompt({ left, right, border, persona, count }) {
  return `You write training data for WiseMoney, a personal-finance app used by young people in Burkina Faso.
Classes:
${GUIDE}

The border between "${left}" and "${right}" is: ${border}.
Write ${count} notes, as ${persona} would type them, that sit close to that border but clearly belong to one side.
Half for "${left}", half for "${right}".
Answer with a JSON array of objects {"text": "...", "key": "${left}" or "${right}"} only.`;
}

function labelPrompt(texts) {
  return `Sort each money movement note from WiseMoney, a personal-finance app in Burkina Faso, into exactly one class:
${GUIDE}

Notes:
${texts.map((text, index) => `${index}. ${text}`).join("\n")}

Answer with a JSON array of ${texts.length} class keys, in the same order, and nothing else. Use only: ${KEYS.join(", ")}.`;
}

const cleanText = (value) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");
const usable = (text) => text.length > 0 && text.length <= MAX_PHRASE_LENGTH;

const apiKey = process.env.CATEGORIZE_GEMINI_API_KEY?.trim() ?? "";
const needsKey = !options["dry-run"] && (runs("generate") || runs("contrast") || runs("label"));
if (needsKey && apiKey.length === 0) {
  console.error("CATEGORIZE_GEMINI_API_KEY is not set (only --stage build or --dry-run work without it).");
  process.exit(1);
}
const gemini = geminiClient({ apiKey, model: MODEL, pauseMs: Number(options["pause-ms"]) });

// Generate: one request per class × style × round. The request id makes the run resumable.
if (runs("generate")) {
  const done = new Set(readJsonl(raw("generated.jsonl")).map((row) => row.request));
  for (let round = 0; round < ROUNDS; round += 1) {
    for (const category of classes) {
      for (const style of Object.keys(STYLES)) {
        const request = `${GUIDE_VERSION}|${category.key}|${style}|${round}`;
        if (done.has(request)) continue;
        const random = seededRandom(`${SEED}|${request}`);
        const spec = { key: category.key, style, persona: pick(random, PERSONAS), town: pick(random, TOWNS), count: PER_REQUEST };
        const prompt = generationPrompt(spec);
        if (options["dry-run"]) {
          console.log(prompt);
          process.exit(0);
        }
        let phrases;
        try {
          phrases = firstJsonArray(await gemini.ask(prompt, 1)).map(cleanText).filter(usable);
        } catch (error) {
          console.warn(`skipped ${request}: ${error.message}`);
          continue;
        }
        appendJsonl(raw("generated.jsonl"), phrases.map((text) => ({ text, key: category.key, style, persona: spec.persona, town: spec.town, request, model: MODEL, promptHash: sha256(prompt) })));
        console.log(`generate ${request}: ${phrases.length}`);
      }
    }
  }
}

// Contrast: both sides of each confusable border, one persona per round.
if (runs("contrast")) {
  const done = new Set(readJsonl(raw("contrast.jsonl")).map((row) => row.request));
  for (let round = 0; round < ROUNDS; round += 1) {
    for (const [left, right, border] of CONFUSABLE_PAIRS) {
      if (ONLY != null && !ONLY.includes(left) && !ONLY.includes(right)) continue;
      const request = `${GUIDE_VERSION}|${left}~${right}|${round}`;
      if (done.has(request)) continue;
      const random = seededRandom(`${SEED}|${request}`);
      const prompt = contrastPrompt({ left, right, border, persona: pick(random, PERSONAS), count: PER_REQUEST });
      if (options["dry-run"]) {
        console.log(prompt);
        process.exit(0);
      }
      let rows;
      try {
        rows = firstJsonArray(await gemini.ask(prompt, 1))
          .map((item) => ({ text: cleanText(item?.text), key: item?.key }))
          .filter((item) => usable(item.text) && (item.key === left || item.key === right));
      } catch (error) {
        console.warn(`skipped ${request}: ${error.message}`);
        continue;
      }
      appendJsonl(raw("contrast.jsonl"), rows.map((row) => ({ ...row, style: "contrast", request, model: MODEL, promptHash: sha256(prompt) })));
      console.log(`contrast ${request}: ${rows.length}`);
    }
  }
}

const allGenerated = () => [...readJsonl(raw("generated.jsonl")), ...readJsonl(raw("contrast.jsonl"))];

// Label: two blind passes over every distinct phrase, the second in a shuffled order so position
// in the batch cannot decide the label.
if (runs("label")) {
  const distinct = [...new Map(allGenerated().map((row) => [normalizeText(row.text), row.text])).entries()];
  for (const pass of ["a", "b"]) {
    const labelled = new Set(readJsonl(raw(`labels-${pass}.jsonl`)).map((row) => normalizeText(row.text)));
    const order = pass === "a" ? distinct : shuffled(seededRandom(`${SEED}|labels-b`), distinct);
    const pending = order.filter(([norm]) => !labelled.has(norm));
    for (let index = 0; index < pending.length; index += LABEL_BATCH) {
      const batch = pending.slice(index, index + LABEL_BATCH);
      let labels;
      try {
        labels = firstJsonArray(await gemini.ask(labelPrompt(batch.map(([, text]) => text)), 0));
      } catch (error) {
        console.warn(`label ${pass} at ${index}: ${error.message}, rerun to retry`);
        continue;
      }
      if (labels.length !== batch.length) {
        console.warn(`label ${pass} at ${index}: ${labels.length} labels for ${batch.length} notes, rerun to retry`);
        continue;
      }
      appendJsonl(raw(`labels-${pass}.jsonl`), batch.map(([, text], position) => ({ text, label: KEYS.includes(labels[position]) ? labels[position] : "invalid", model: MODEL })));
      console.log(`label ${pass}: ${Math.min(index + LABEL_BATCH, pending.length)} / ${pending.length}`);
    }
  }
}

// Build: offline and deterministic from the raw files.
if (runs("build")) {
  const labelsA = new Map(readJsonl(raw("labels-a.jsonl")).map((row) => [normalizeText(row.text), row.label]));
  const labelsB = new Map(readJsonl(raw("labels-b.jsonl")).map((row) => [normalizeText(row.text), row.label]));
  const intents = new Map();
  for (const row of allGenerated()) {
    const norm = normalizeText(row.text);
    const entry = intents.get(norm) ?? { text: row.text, keys: new Set(), styles: new Set() };
    entry.keys.add(row.key);
    entry.styles.add(row.style);
    intents.set(norm, entry);
  }
  const agreed = [];
  const review = [];
  for (const [norm, entry] of intents) {
    const intended = entry.keys.size === 1 ? [...entry.keys][0] : null;
    const a = labelsA.get(norm) ?? null;
    const b = labelsB.get(norm) ?? null;
    if (a == null || b == null) continue;
    const row = { text: entry.text, key: intended, style: [...entry.styles][0] };
    if (intended != null && a === intended && b === intended) agreed.push(row);
    else review.push({ text: entry.text, intended: [...entry.keys], blindA: a, blindB: b });
  }
  const unique = dropNearDuplicates(agreed.sort((left, right) => left.text.localeCompare(right.text)));
  const split = unique.map((row) => ({ ...row, split: splitOf(row.text) }));
  const augmented = split.filter((row) => row.split === "train").flatMap((row) => augment(row, SEED, AUGMENTATIONS_PER_PHRASE));
  const dataset = [...split, ...augmented];
  writeJsonl(new URL("dataset.jsonl", dataDir), dataset);
  writeJsonl(new URL("review.jsonl", dataDir), review);
  const manifest = {
    guide: GUIDE_VERSION,
    teacher: MODEL,
    seed: SEED,
    built: new Date().toISOString().slice(0, 10),
    distinctGenerated: intents.size,
    labelledTwice: [...intents.keys()].filter((norm) => labelsA.has(norm) && labelsB.has(norm)).length,
    agreed: agreed.length,
    afterNearDuplicates: unique.length,
    augmented: augmented.length,
    toReview: review.length,
    perClass: stats(split, KEYS),
    datasetHash: sha256(readFileSync(new URL("dataset.jsonl", dataDir), "utf8")),
  };
  writeFileSync(new URL("manifest.json", dataDir), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({ ...manifest, perClass: undefined }, null, 2));
  console.table(manifest.perClass);
}

if (needsKey) console.log(`${gemini.requestCount()} request(s) sent to ${MODEL}`);
