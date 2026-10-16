// Minimal Gemini API client for the teacher (Gemma). Retries 429 and 5xx with the delay Google asks for.
const MAX_ATTEMPTS = 6;
const DEFAULT_RETRY_MS = 65_000;

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function retryDelayMs(detail) {
  const match = /"retryDelay":\s*"(\d+(?:\.\d+)?)s"/.exec(detail);
  return match == null ? null : Math.ceil(Number(match[1]) * 1000) + 2_000;
}

export function geminiClient({ apiKey, model, pauseMs }) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  let requests = 0;
  let last = 0;
  async function ask(prompt, temperature) {
    // A steady pace below the free tier's per-minute limit instead of bursts that hit it.
    const wait = last + pauseMs - Date.now();
    if (wait > 0) await sleep(wait);
    for (let attempt = 1; ; attempt += 1) {
      last = Date.now();
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
        console.warn(`HTTP ${response.status}, waiting ${Math.round(delay / 1000)} s (attempt ${attempt} of ${MAX_ATTEMPTS})`);
        await sleep(delay);
        continue;
      }
      throw new Error(`HTTP ${response.status}: ${detail.slice(0, 400)}`);
    }
  }
  return { ask, requestCount: () => requests };
}
