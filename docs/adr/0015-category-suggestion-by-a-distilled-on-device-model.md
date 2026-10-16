# ADR-0015: Suggest a movement's category with a small model taught by a large one, run on the device

| Field    | Value |
| -------- | ----- |
| Status   | Accepted (2026-10-16, Y4NN) |
| Date     | 2026-10-16 |
| Diátaxis | Explanation |
| Source   | Y4NN 2026-10-16 ("need more intelligence and determinism with a lightweight layer of AI… resilient working feature, not prototype"); research below; ADR-0014 point 5; CONTRACT INV-EGR-01/02 |
| Binds    | `apps/web/src/capture/`; `apps/web/src/components/CaptureSheet`; `tools/categorize/`; help topic `transactions` |

## Context

ADR-0014 fills amount, direction and note from one line ("taxi 2000"). The
category is still picked by hand from a list of about twenty. Y4NN asked for a
suggestion that is intelligent, deterministic and resilient, not a keyword list.

The note is vault data: it may not leave the phone (INV-EGR-01/02). So the
model runs on the device, and no user data ever trains a shared model.

Research, 2026-10-16:

- **Plaid** uses an LLM to label about a million transactions, then fine-tunes
  a small classifier on them; the small model serves production (Plaid
  Engineering, "Universal Transaction Categorization").
- **Open personal-finance categorisers** pair a lookup of frequent merchants
  (one reports about 35% of transactions covered by the top 100), a starter
  model trained on built-in examples so suggestions work before any user label,
  and a per-user model once the user has corrected enough (finsight PR #5;
  banking-class). Character n-grams absorb spelling variants.
- **Model2Vec** distils any sentence transformer into a static table of token
  vectors: inference is a lookup and a mean, no transformer at run time.
  `distill()` takes a custom `vocabulary`, `pca_dims`, `quantize_to` (int8)
  and `vocabulary_quantization`; `StaticModelForClassification` trains a head
  on top (MinishLab docs). It runs in transformers.js, and the lookup is simple
  enough to run in plain TypeScript.
- **Measured sizes** (Hugging Face, int8 or as published): multilingual-e5-small
  and paraphrase-multilingual-MiniLM 118 MB; potion-base-8M (English) 30 MB
  fp32; potion-multilingual-128M 512 MB. A distillation restricted to our
  French, English and local vocabulary is estimated at 2–4 MB in int8; to be
  measured.

## Decision

1. **Teacher at build time.** Gemma (already the WiseLearn provider, ADR-0013)
   generates and labels a dataset of short, realistic movement notes in French,
   English and local terms, against the fixed keys of the default categories
   (`src/lib/categoryName.ts`). Y4NN reviews a sample; a held-out test set is
   labelled and reviewed separately and never used for training.
2. **Student on the device.** A Model2Vec model distilled onto our vocabulary,
   int8, with a trained classification head, shipped as a versioned file of a
   few megabytes, cached by the service worker. Same input, same output.
3. **Personal layers before the student.** (a) The category the user already
   confirmed for the same normalised note wins. (b) The user's history adapts
   the scores, recent movements weighing more; categories the user created are
   learned only here. Both are rebuilt from the vault at unlock: nothing new is
   stored, and they survive restore.
4. **Context.** Direction and amount enter the decision ("crédit" as airtime
   or as a loan).
5. **Calibrated display.** A category is pre-selected and marked "Suggéré"
   only above a threshold set on the test set for a measured precision; below
   it, three choices; nothing is saved before Add.
6. **Resilience.** If the model file is missing or fails its hash, the
   personal layers still answer; with no history and no model, no suggestion.
7. **Quality gate.** A reproducible training script (`tools/categorize/`)
   writes the model, its version and hash, and its metrics (accuracy, precision
   at the threshold, coverage, per-category recall, confusion matrix). CI fails
   when the shipped model's metrics fall below the recorded floor.

## Consequences

- Positive: suggestions that understand meaning ("zémidjan", "taxi-moto",
  "moto" together), offline, instant, deterministic; no data leaves the phone;
  no consent screen.
- Negative: a few megabytes more on first install; the model improves only
  with new releases, never from users' data; generated training data carries
  the teacher's biases (mitigated by review and the held-out set).
- Risk: generated phrases unlike real ones. The test set must hold phrases
  written by people (Y4NN and testers), and the first real-user test checks it.

## Alternatives considered

- **Keyword lexicon only.** Deterministic, but brittle on spellings and words
  it has never seen. Kept only as a source of training phrases.
- **A full multilingual transformer in transformers.js.** 118 MB and an ONNX
  runtime of about 27 MB for a short phrase; kept as a comparison in the
  evaluation, adopted only if it clearly beats the student.
- **Classify on a server with an LLM.** Best raw quality, but vault egress on
  every movement and no offline use. Rejected.

## Sources

- Plaid Engineering: https://engineering.plaid.com/universal-transaction-categorization-how-plaid-unified-four-ml-systems-into-one-f08bf1eade54
- finsight PR #5: https://github.com/ebrahimmorkas/finsight/pull/5
- banking-class: https://github.com/eli-goodfriend/banking-class
- Model2Vec: https://github.com/MinishLab/model2vec · https://minish.ai/packages/model2vec/distillation/ · https://minish.ai/packages/model2vec/training/ · https://minish.ai/packages/model2vec/integrations/
- Model sizes: https://huggingface.co/api/models/minishlab/potion-base-8M/tree/main and the same API for the other models named above
