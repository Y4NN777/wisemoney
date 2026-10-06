import { afterEach, describe, expect, it, vi } from "vitest";
import { streamLearnMessage } from "./tutorClient.ts";

afterEach(() => vi.unstubAllGlobals());

const input = { question: "How do I budget?", locale: "en" as const, history: [] };

function sse(body: string, contentType = "text/event-stream; charset=utf-8", status = 200): Response {
  return new Response(body, { status, headers: { "content-type": contentType } });
}

describe("streamLearnMessage", () => {
  it("sends the closed schema and forwards text, meta and https sources", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sse(
      'event: meta\ndata: {"unitIds":["build-a-budget"],"webSearch":true,"lessons":[{"id":"build-a-budget","title":"Build your first budget","publishers":["OECD",3]},{"title":"no id"}],"retrieval":"embeddings"}\n\n' +
      'event: delta\ndata: {"text":"Every franc "}\n\nevent: delta\ndata: {"text":"gets a job."}\n\n' +
      'event: sources\ndata: {"items":[{"title":"a","uri":"https://a.example"},{"title":"b","uri":"http://b.example"},{"uri":"https://c.example"}]}\n\n' +
      "event: done\ndata: {}\n\n",
    ));
    vi.stubGlobal("fetch", fetchMock);
    const text: string[] = [];
    const onMeta = vi.fn();
    const onSources = vi.fn();

    await streamLearnMessage({ ...input, history: Array.from({ length: 10 }, (_, index) => ({ role: "user" as const, text: `q${index}` })) }, { onText: (chunk) => text.push(chunk), onMeta, onSources });

    expect(text.join("")).toBe("Every franc gets a job.");
    expect(onMeta).toHaveBeenCalledWith({ unitIds: ["build-a-budget"], webSearch: true, lessons: [{ id: "build-a-budget", title: "Build your first budget", publishers: ["OECD"] }] });
    expect(onSources).toHaveBeenCalledWith([{ title: "a", uri: "https://a.example" }]);
    const [url, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(url).toBe("/api/learn/messages");
    const body = JSON.parse(init.body) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["history", "locale", "question"]);
    expect(body.history).toHaveLength(8);
  });

  it.each([
    ["an error status", sse('{"message":"x"}', "application/json", 503)],
    ["a 200 that is an HTML page", sse("<!doctype html>", "text/html")],
    ["a stream without any text", sse("event: done\ndata: {}\n\n")],
  ])("treats %s as a failure", async (_label, response) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    await expect(streamLearnMessage(input, { onText: () => undefined })).rejects.toThrow(/tutor-/);
  });
});
