import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodeVector } from "./_embedding.ts";
import { extractLearnFrames, sendLearnMessage } from "./_learnGateway.ts";
import { LESSON_VECTORS } from "./_lessonVectors.ts";

const ORIGINAL_ENV = { ...process.env };
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemma-4-26b-a4b-it:streamGenerateContent?alt=sse";
const EMBED_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent";

/** An embedding response equal to a lesson's own vector, so that lesson ranks first. */
function embeddingOf(locale: "en" | "fr", id: string): Response {
  const stored = LESSON_VECTORS.lessons[locale].find((vector) => vector.id === id)!;
  return Response.json({ embedding: { values: Array.from(decodeVector(stored)) } });
}

/**
 * fetch as the gateway sees it: the embedding call answered by `embedding`, every other call (Gemma)
 * by `gemma`. Assertions on the Gemma request read `gemma.mock.calls`.
 */
function routedFetch(gemma: ReturnType<typeof vi.fn>, embedding: () => Response | Promise<Response>) {
  const embed = vi.fn(embedding);
  const fetchMock = vi.fn((url: string, init?: RequestInit) => (url === EMBED_ENDPOINT ? embed() : gemma(url, init)));
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, embed };
}

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV, LITERACY_GEMINI_API_KEY: "literacy-project-token", GEMINI_API_KEY: "help-project-token" };
  delete process.env.LITERACY_WEB_SEARCH;
  delete process.env.LITERACY_GEMMA_MODEL;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
});

function request(body: unknown): Request {
  return new Request("https://app.example.test/api/learn/messages", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function providerStream(...frames: unknown[]): Response {
  return new Response(frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join(""), {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

const answer = { candidates: [{ content: { parts: [{ text: "Players lose on average." }] } }] };

function sentBody(fetchMock: ReturnType<typeof vi.fn>, call = 0) {
  const [url, init] = fetchMock.mock.calls[call] as [string, RequestInit];
  return { url, headers: new Headers(init.headers), body: JSON.parse(String(init.body)) as {
    systemInstruction: { parts: Array<{ text: string }> };
    contents: Array<{ role: string; parts: Array<{ text: string }> }>;
    tools?: unknown;
  } };
}

describe("literacy tutor gateway", () => {
  it("embeds the question with its own key, grounds the answer in the closest lessons and credits them", async () => {
    const fetchMock = vi.fn().mockResolvedValue(providerStream(answer));
    const { embed } = routedFetch(fetchMock, () => embeddingOf("en", "build-a-budget"));

    const response = await sendLearnMessage(request({
      question: "How do I build a budget for the month?",
      locale: "en",
      history: [{ role: "assistant", text: "Welcome." }],
    }));

    expect(response.status).toBe(200);
    const events = await response.text();
    expect(events).toMatch(/event: meta\ndata: \{"unitIds":\["build-a-budget"/);
    expect(events).toContain('"webSearch":false');
    expect(events).toContain('"retrieval":"embeddings"');
    expect(events).toMatch(/"lessons":\[\{"id":"build-a-budget","title":"Build your first budget","publishers":\[[^\]]+\]/);
    expect(embed).toHaveBeenCalledTimes(1);
    expect(events).toContain('event: delta\ndata: {"text":"Players lose on average."}');
    expect(events.endsWith("event: done\ndata: {}\n\n")).toBe(true);

    const sent = sentBody(fetchMock);
    expect(sent.url).toBe(ENDPOINT);
    expect(sent.headers.get("x-goog-api-key")).toBe("literacy-project-token");
    expect(JSON.stringify(sent.body)).not.toContain("help-project-token");
    expect(sent.body.tools).toBeUndefined();
    const instruction = sent.body.systemInstruction.parts[0]!.text;
    expect(instruction).toContain("Build your first budget");
    expect(instruction).toContain("Teach, do not advise");
    expect(instruction).toContain("Never ask about the learner's own money");
    expect(instruction).toContain("Never state current fees, rates, limits, or regulations");
    expect(sent.body.contents.map(({ role }) => role)).toEqual(["model", "user"]);
  });

  it("answers in French from the French lessons and ignores unit ids sent by older clients", async () => {
    const fetchMock = vi.fn().mockResolvedValue(providerStream(answer));
    routedFetch(fetchMock, () => embeddingOf("fr", "interest-and-time"));
    const response = await sendLearnMessage(request({ question: "si je laisse mon argent des années, il grossit comment ?", locale: "fr", unitIds: ["spot-a-scam"] }));
    const events = await response.text();
    expect(events).toContain('"unitIds":["interest-and-time"');
    expect(events).not.toMatch(/"unitIds":\["spot-a-scam"/);
    const instruction = sentBody(fetchMock).body.systemInstruction.parts[0]!.text;
    expect(instruction).toContain("in French");
    expect(instruction).toContain("Voir les intérêts grandir avec le temps");
  });

  it("falls back to keyword search when the question cannot be embedded, and still answers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(providerStream(answer));
    const { embed } = routedFetch(fetchMock, () => new Response("{}", { status: 429 }));
    const response = await sendLearnMessage(request({ question: "Comment marche une tontine ?", locale: "fr" }));
    expect(response.status).toBe(200);
    const events = await response.text();
    expect(events).toContain('"retrieval":"keywords"');
    expect(events).toContain('"savings-groups"');
    expect(embed).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["a vault aggregate", { question: "Why?", locale: "en", context: { monthlyExpenses: 120000 } }],
    ["the help gateway's safe context", { question: "Why?", locale: "en", safeContext: { surfaceId: "dashboard" } }],
    ["an image", { question: "Why?", locale: "en", image: "data:image/jpeg;base64,YWJj" }],
    ["an extra field inside a turn", { question: "Why?", locale: "en", history: [{ role: "user", text: "Hi", balance: 5 }] }],
    ["a malformed unit id", { question: "Why?", locale: "en", unitIds: ["Not A Lesson!"] }],
    ["a missing locale", { question: "Why?" }],
    ["an unsupported locale", { question: "Why?", locale: "de" }],
    ["an empty question", { question: "   ", locale: "en" }],
    ["too many turns", { question: "Why?", locale: "en", history: Array.from({ length: 9 }, () => ({ role: "user", text: "x" })) }],
    ["a non-object body", "[]"],
  ])("rejects %s before any provider call (INV-EGR-04)", async (_label, body) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await sendLearnMessage(request(body));
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an oversized body with 413", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await sendLearnMessage(request({ question: "x".repeat(1000), locale: "en", history: Array.from({ length: 8 }, () => ({ role: "user", text: "é".repeat(2000) })) }));
    expect(response.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("attaches Google Search when enabled and forwards deduplicated https sources", async () => {
    process.env.LITERACY_WEB_SEARCH = "on";
    const grounded = { candidates: [{ groundingMetadata: { groundingChunks: [
      { web: { uri: "https://www.bceao.int/fr/taux", title: "bceao.int" } },
      { web: { uri: "https://redirect.example/other-link-to-the-same-site", title: "bceao.int" } },
      { web: { uri: "http://insecure.example/x", title: "insecure" } },
      { web: { uri: "javascript:alert(1)", title: "bad" } },
      { web: { uri: "https://example.org/a" } },
    ] } }] };
    const fetchMock = vi.fn().mockResolvedValue(providerStream(answer, grounded));
    routedFetch(fetchMock, () => embeddingOf("en", "the-legal-ceiling"));

    const events = await (await sendLearnMessage(request({ question: "What is the usury ceiling today?", locale: "en" }))).text();

    const sent = sentBody(fetchMock);
    expect(sent.body.tools).toEqual([{ google_search: {} }]);
    expect(sent.body.systemInstruction.parts[0]!.text).toContain("use Google Search");
    expect(sent.body.systemInstruction.parts[0]!.text).toContain("Call a figure official only when it comes from that official site");
    expect(events).toContain('"webSearch":true');
    expect(events).toContain('event: sources\ndata: {"items":[{"title":"bceao.int","uri":"https://www.bceao.int/fr/taux"},{"title":"example.org","uri":"https://example.org/a"}]}');
  });

  it("falls back to a lessons-only request when the provider refuses the search tool", async () => {
    process.env.LITERACY_WEB_SEARCH = "on";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("{}", { status: 400 }))
      .mockResolvedValueOnce(providerStream(answer));
    routedFetch(fetchMock, () => embeddingOf("en", "build-a-budget"));

    const response = await sendLearnMessage(request({ question: "How does a budget work?", locale: "en" }));

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('"webSearch":false');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sentBody(fetchMock, 0).body.tools).toEqual([{ google_search: {} }]);
    expect(sentBody(fetchMock, 1).body.tools).toBeUndefined();
    expect(sentBody(fetchMock, 1).body.systemInstruction.parts[0]!.text).toContain("Never state current fees");
  });

  it("returns 503 without a key, with a foreign model, or when the provider fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 403 }));
    routedFetch(fetchMock, () => embeddingOf("en", "build-a-budget"));
    const body = { question: "How does a budget work?", locale: "en" };

    expect((await sendLearnMessage(request(body))).status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    process.env.LITERACY_GEMMA_MODEL = "gemini-3.5-flash";
    expect((await sendLearnMessage(request(body))).status).toBe(503);

    delete process.env.LITERACY_GEMMA_MODEL;
    delete process.env.LITERACY_GEMINI_API_KEY;
    expect((await sendLearnMessage(request(body))).status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("drops thought parts and malformed frames", () => {
    const parsed = extractLearnFrames(`data: {"candidates":[{"content":{"parts":[{"text":"hidden","thought":true},{"text":"shown"}]}}]}\ndata: {broken\ndata: [DONE]\ndata: {"cand`);
    expect(parsed.text).toBe("shown");
    expect(parsed.sources).toEqual([]);
    expect(parsed.remainder).toBe('data: {"cand');
  });
});
