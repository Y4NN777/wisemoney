// Minimal Gemini API client for the teacher (Gemma). Retries 429 and 5xx with the delay Google asks for.
const MAX_ATTEMPTS = 6;
const DEFAULT_RETRY_MS = 65_000;
// A per-minute limit asks for under a minute; a daily quota asks for hours (seen 2026-10-17: 60 768 s).
// Past this, waiting is pointless: the run stops and resumes when the user runs it again.
const MAX_RETRY_WAIT_MS = 10 * 60_000;

/** The model's quota is spent for now; carries how long Google asks to wait. */
export class QuotaExhausted extends Error {
  constructor(model, delayMs) {
    super(`${model}: quota reached, Google asks to wait about ${Math.ceil(delayMs / 3_600_000)} h`);
    this.model = model;
    this.delayMs = delayMs;
  }
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function retryDelayMs(detail) {
  const match = /"retryDelay":\s*"(\d+(?:\.\d+)?)s"/.exec(detail);
  return match == null ? null : Math.ceil(Number(match[1]) * 1000) + 2_000;
}

const API = "https://generativelanguage.googleapis.com/v1beta/models";

/** One client for several models: each request names its model; each model keeps its own pace (own quota). */
export function geminiClient({ apiKey, pauseMs }) {
  let requests = 0;
  const lastByModel = new Map();
  /** Fails fast on a model id the key cannot use, before any paid-for or rate-limited work. */
  async function check(model) {
    const response = await fetch(`${API}/${model}`, { headers: { "x-goog-api-key": apiKey } });
    if (!response.ok) throw new Error(`model ${model}: HTTP ${response.status} ${(await response.text()).slice(0, 200)}`);
  }
  async function ask(model, prompt, temperature) {
    const endpoint = `${API}/${model}:generateContent`;
    // A steady pace below the free tier's per-minute limit instead of bursts that hit it.
    const wait = (lastByModel.get(model) ?? 0) + pauseMs - Date.now();
    if (wait > 0) await sleep(wait);
    for (let attempt = 1; ; attempt += 1) {
      lastByModel.set(model, Date.now());
      requests += 1;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature } }),
      });
      if (response.ok) {
        const json = await response.json();
        // Thinking parts are the model's reasoning, not the answer.
        return (json.candidates?.[0]?.content?.parts ?? []).filter((part) => !part.thought).map((part) => part.text ?? "").join("");
      }
      const detail = await response.text();
      if ((response.status === 429 || response.status >= 500) && attempt < MAX_ATTEMPTS) {
        const delay = retryDelayMs(detail) ?? DEFAULT_RETRY_MS;
        if (delay > MAX_RETRY_WAIT_MS) throw new QuotaExhausted(model, delay);
        console.warn(`HTTP ${response.status}, waiting ${Math.round(delay / 1000)} s (attempt ${attempt} of ${MAX_ATTEMPTS})`);
        await sleep(delay);
        continue;
      }
      throw new Error(`HTTP ${response.status}: ${detail.slice(0, 400)}`);
    }
  }
  return { ask, check, requestCount: () => requests };
}
