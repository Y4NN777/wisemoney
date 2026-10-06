// Pure helpers of embed.mjs, kept apart so a unit test can check that the shipped vectors still
// match the lessons without calling any API.
import { createHash } from "node:crypto";

export function vectorHash(model, dimensions, task, text) {
  return createHash("sha256").update(`${model}|${dimensions}|${task}|${text}`).digest("hex").slice(0, 16);
}

/** int8 with one scale per vector: 768 bytes instead of 3 KB, for a cosine that stays within rounding. */
export function quantize(unitVector) {
  const peak = unitVector.reduce((max, value) => Math.max(max, Math.abs(value)), 0) || 1;
  const scale = peak / 127;
  const bytes = Int8Array.from(unitVector, (value) => Math.max(-127, Math.min(127, Math.round(value / scale))));
  return { scale, data: Buffer.from(bytes.buffer).toString("base64") };
}

export function normalize(values) {
  const length = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0)) || 1;
  return values.map((value) => value / length);
}
