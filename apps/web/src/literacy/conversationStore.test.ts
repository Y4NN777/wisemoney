import { describe, expect, it } from "vitest";
import type { MasterKey } from "../crypto/envelope.ts";
import { conversationTitle, openConversation, sealConversation, sortSummaries, trimMessages, type LearnConversation } from "./conversationStore.ts";

async function testKey(): Promise<MasterKey> {
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  return { _brand: "MasterKey", key };
}

const conversation: LearnConversation = {
  id: "c1", title: "Comment épargner ?", createdAt: 1, updatedAt: 2,
  messages: [{ role: "user", text: "Comment épargner ?" }, { role: "assistant", text: "Commencez petit.", answer: { unitIds: ["why-save"], lessons: [], webSearch: false, sources: [] } }],
};

describe("WiseLearn conversation store", () => {
  it("seals a conversation so nothing but the id is readable, and opens it back", async () => {
    const key = await testKey();
    const record = await sealConversation(conversation, key);
    expect(record.id).toBe("c1");
    expect(new TextDecoder().decode(record.ciphertext)).not.toContain("épargner");
    expect(await openConversation(record, key)).toEqual(conversation);
  });

  it("does not open under another key", async () => {
    const record = await sealConversation(conversation, await testKey());
    await expect(openConversation(record, await testKey())).rejects.toThrow();
  });

  it("titles a conversation with its first question, cut at a word", () => {
    expect(conversationTitle(conversation.messages)).toBe("Comment épargner ?");
    const long = "Comment faire pour garder un peu d’argent chaque mois quand le salaire arrive en retard et que la famille demande ?";
    const title = conversationTitle([{ role: "user", text: long }]);
    expect(title.length).toBeLessThanOrEqual(81);
    expect(title.endsWith("…")).toBe(true);
    expect(long.startsWith(title.slice(0, -1))).toBe(true);
  });

  it("lists newest first and keeps the latest messages of a very long conversation", () => {
    expect(sortSummaries([{ ...conversation, id: "old", updatedAt: 1 }, { ...conversation, id: "new", updatedAt: 9 }]).map((item) => item.id)).toEqual(["new", "old"]);
    const many = Array.from({ length: 450 }, (_, index) => ({ role: "user" as const, text: String(index) }));
    const kept = trimMessages(many);
    expect(kept).toHaveLength(400);
    expect(kept.at(-1)?.text).toBe("449");
  });
});
