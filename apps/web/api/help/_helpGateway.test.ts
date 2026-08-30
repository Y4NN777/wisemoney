import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractGeminiDeltas, isSameOriginRequest, sendMessage } from "./_helpGateway.ts";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = {
    ...ORIGINAL_ENV,
    GEMINI_API_KEY: "google-ai-studio-token",
    HELP_GEMMA_MODEL: "gemma-4-26b-a4b-it",
  };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
});

function request(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://app.example.test/api/help/messages", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("stateless Gemini help gateway", () => {
  it("uses the direct Google endpoint and native multimodal request shape", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      `data: {"candidates":[{"content":{"parts":[{"text":"Open Capture."}]}}]}\n\n`,
      { status: 200, headers: { "content-type": "text/event-stream" } },
    ));
    vi.stubGlobal("fetch", fetchMock);

    const response = await sendMessage(request({
      question: "How do I add an account?",
      image: "data:image/jpeg;base64,YWJj",
      locale: "en",
      history: [{ role: "assistant", text: "Previous answer" }],
      helpContext: [{ id: "comptes" }],
    }));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('event: meta\ndata: {"taskIds":["comptes"]}\n\nevent: delta\ndata: {"text":"Open Capture."}\n\nevent: done\ndata: {}\n\n');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemma-4-26b-a4b-it:streamGenerateContent?alt=sse");
    expect(url).not.toContain("google-ai-studio-token");
    expect(new Headers(init.headers).get("x-goog-api-key")).toBe("google-ai-studio-token");
    expect(new Headers(init.headers).has("authorization")).toBe(false);
    const providerBody = JSON.parse(String(init.body)) as {
      systemInstruction: { parts: Array<{ text: string }> };
      contents: Array<{ role: string; parts: Array<Record<string, unknown>> }>;
    };
    expect(providerBody.systemInstruction.parts[0]?.text).toContain("Create and manage an account");
    expect(providerBody.systemInstruction.parts[0]?.text).toContain("Open Capture");
    expect(providerBody.systemInstruction.parts[0]?.text).toContain("WiseMoney tracks accounts, income, expenses, transfers");
    expect(providerBody.systemInstruction.parts[0]?.text).toContain("Resolve short follow-up questions from the conversation history");
    expect(providerBody.systemInstruction.parts[0]?.text).toContain("Never replace a feature-specific answer with generic onboarding");
    expect(providerBody.contents[0]?.role).toBe("model");
    expect(providerBody.contents.at(-1)?.parts[0]).toEqual({
      inlineData: { mimeType: "image/jpeg", data: "YWJj" },
    });
    expect(providerBody.contents.at(-1)?.parts[1]).toEqual({ text: "How do I add an account?" });
  });

  it("sends only the trusted transfer procedure selected by the browser", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      `data: {"candidates":[{"content":{"parts":[{"text":"Oui. Ouvrez Saisie, puis Transfert."}]}}]}\n\n`,
      { status: 200, headers: { "content-type": "text/event-stream" } },
    ));
    vi.stubGlobal("fetch", fetchMock);

    await sendMessage(request({
      question: "Y a-t-il moyen de faire un transfert de compte à compte et de le suivre ?",
      locale: "fr",
      helpContext: [{ id: "virements" }],
    }));

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const providerBody = JSON.parse(String(init.body)) as {
      systemInstruction: { parts: Array<{ text: string }> };
    };
    const instruction = providerBody.systemInstruction.parts[0]?.text ?? "";
    expect(instruction).toContain("[virements] Transférer entre deux comptes et suivre le transfert");
    expect(instruction).toContain("Ouvrez Saisie puis Envoyer ou déplacer de l’argent");
    expect(instruction).toContain("ouvrez Activité");
    expect(instruction).not.toContain("[demarrage]");
    expect(instruction).not.toContain("[sauvegarde]");
  });

  it("retries temporary provider limits and returns a WiseMoney error", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("limited", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await sendMessage(request({ question: "How do I add an account?", locale: "en" }));

    expect(response.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(await response.json()).toEqual({ message: "WiseMoney help is temporarily unavailable." });
  });

  it("rejects malformed and oversized requests before calling Google", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const invalidImage = await sendMessage(request({ question: "Help", image: "data:image/png;base64,YWJj" }));
    const oversized = await sendMessage(request({ question: "Help" }, { "content-length": "3000001" }));

    expect(invalidImage.status).toBe(400);
    expect(oversized.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects unknown identifiers and private or browser-authored help fields", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const unknown = await sendMessage(request({ question: "Help", locale: "en", helpContext: [{ id: "not-a-task" }] }));
    const privateField = await sendMessage(request({ question: "Help", locale: "en", helpContext: [{ id: "comptes", balance: 1200 }] }));
    const unsafeContext = await sendMessage(request({
      question: "Help",
      locale: "en",
      safeContext: { schemaVersion: 1, knowledgeVersion: "1.0.0-2026-08-29", locale: "en", entryPoint: "manual", surfaceId: "help", accountName: "Private" },
    }));

    expect(unknown.status).toBe(400);
    expect(privateField.status).toBe(400);
    expect(unsafeContext.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("filters thought parts and parses fragmented SSE lines", () => {
    const first = extractGeminiDeltas(`data: {"candidates":[{"content":{"parts":[{"text":"secret","thought":true},{"text":"Visible`);
    expect(first.text).toBe("");
    const second = extractGeminiDeltas(`${first.remainder} answer"}]}}]}\r\n\r\n`);
    expect(second.text).toBe("Visible answer");
  });

  it("accepts only same-origin browser requests", () => {
    expect(isSameOriginRequest(request({ question: "Help" }, { origin: "https://app.example.test" }))).toBe(true);
    expect(isSameOriginRequest(request({ question: "Help" }, { origin: "https://evil.example" }))).toBe(false);
  });
});
