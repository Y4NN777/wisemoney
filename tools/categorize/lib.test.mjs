// node --test tools/categorize/
import assert from "node:assert/strict";
import { test } from "node:test";
import { augment, dropNearDuplicates, firstJsonArray, normalizeText, reformatAmount, seededRandom, similarity, splitOf, typo } from "./lib.mjs";

test("normalizeText folds case, accents and spaces", () => {
  assert.equal(normalizeText("  Électricité   SONABEL "), "electricite sonabel");
});

test("firstJsonArray reads an array inside a fence or a sentence", () => {
  assert.deepEqual(firstJsonArray('Voici :\n```json\n["taxi 500", "pain"]\n```'), ["taxi 500", "pain"]);
  assert.throws(() => firstJsonArray("no array here"));
});

test("seededRandom repeats for the same seed and differs for another", () => {
  const first = seededRandom("a");
  const again = seededRandom("a");
  const other = seededRandom("b");
  const run = (random) => [random(), random(), random()];
  assert.deepEqual(run(first), run(again));
  assert.notDeepEqual(run(seededRandom("a")), run(other));
});

test("splitOf is stable and ignores case and accents", () => {
  assert.equal(splitOf("Crédit Orange 1000"), splitOf("credit orange 1000"));
  const counts = { train: 0, validation: 0, test: 0 };
  for (let index = 0; index < 5000; index += 1) counts[splitOf(`phrase ${index}`)] += 1;
  assert.ok(counts.test > 350 && counts.test < 650, `test share ${counts.test}`);
  assert.ok(counts.validation > 350 && counts.validation < 650, `validation share ${counts.validation}`);
});

test("near duplicates are dropped within a class only", () => {
  assert.ok(similarity("taxi 500", "taxi 2000") > 0.85);
  const rows = [
    { text: "taxi 500", key: "transport" },
    { text: "taxi 2000", key: "transport" },
    { text: "taxi 2000", key: "travel" },
    { text: "loyer du mois", key: "housing" },
  ];
  assert.deepEqual(dropNearDuplicates(rows).map((row) => `${row.key}:${row.text}`), ["transport:taxi 500", "travel:taxi 2000", "housing:loyer du mois"]);
});

test("reformatAmount rewrites the amount and keeps its value", () => {
  const random = seededRandom("amount");
  for (let index = 0; index < 20; index += 1) {
    const text = reformatAmount("essence 2 500 F", random);
    assert.match(text, /^essence (2500|2 500|2\.500|2500 F|2500f|2500 FCFA)$/);
  }
  assert.equal(reformatAmount("pain", random), null);
});

test("typo changes one word of four letters or more", () => {
  const random = seededRandom("typo");
  for (let index = 0; index < 20; index += 1) {
    const text = typo("ticket de bus", random);
    if (text == null) continue;
    assert.equal(text.split(" ")[1], "de");
    assert.notEqual(text, "ticket de bus");
  }
});

test("augment is deterministic and never returns the original", () => {
  const row = { text: "Crédit Orange 1000", key: "utilities" };
  const first = augment(row, "seed");
  assert.deepEqual(first, augment(row, "seed"));
  assert.ok(first.length > 0 && first.every((variant) => variant.text !== row.text && variant.augmented && variant.key === "utilities"));
});

test("pickWeighted follows the weights", async () => {
  const { pickWeighted } = await import("./lib.mjs");
  const random = seededRandom("weights");
  const counts = { a: 0, b: 0 };
  for (let index = 0; index < 4000; index += 1) counts[pickWeighted(random, [{ id: "a", weight: 3 }, { id: "b", weight: 1 }]).id] += 1;
  assert.ok(counts.a > 2700 && counts.a < 3300, `a drawn ${counts.a} times`);
});

test("contextFor uses only the country's terms for the class and is empty without a lexicon", async () => {
  const { contextFor } = await import("./lib.mjs");
  const lexicon = {
    countries: { BF: [{ term: "zoom-koom", category: "foodDining", meaning: "millet drink" }, { term: "SONABEL", category: "utilities", meaning: "electricity company" }], CI: [{ term: "garba", category: "foodDining", meaning: "attiéké with fish" }] },
    scenarios: [{ scenario: "rentrée scolaire", categories: ["education"] }],
    people: [{ term: "tantie", meaning: "older woman" }],
    paymentChannels: [{ term: "Orange Money", country: "BF" }],
  };
  const context = contextFor(lexicon, seededRandom("ctx"), { country: "BF", key: "foodDining" });
  assert.deepEqual(context.used, ["zoom-koom"]);
  assert.match(context.block, /zoom-koom/);
  assert.doesNotMatch(context.block, /SONABEL|garba|rentrée/);
  assert.match(context.block, /Orange Money/);
  assert.deepEqual(contextFor(null, seededRandom("ctx"), { country: "BF", key: "foodDining" }), { block: "", used: [] });
});
