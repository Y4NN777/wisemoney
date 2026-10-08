import { db } from "../db/schema.ts";
import { open, seal, type MasterKey } from "../crypto/envelope.ts";
import type { TutorAnswer } from "../pillars/literacy/index.ts";

/**
 * WiseLearn history: each conversation is one record sealed under the master key, kept until the
 * learner deletes it (Y4NN, 2026-10-08: WiseLearn only, no expiry). Nothing leaves the device.
 */
export type StoredTutorMessage = { role: "user" | "assistant"; text: string; answer?: TutorAnswer };
export type LearnConversation = { id: string; title: string; createdAt: number; updatedAt: number; messages: StoredTutorMessage[] };
export type LearnConversationSummary = Pick<LearnConversation, "id" | "title" | "updatedAt">;

const TITLE_MAX_LENGTH = 80;
/** A conversation longer than this keeps its latest messages; far beyond any real session. */
const MESSAGE_LIMIT = 400;

/** The title is the first question, on one line and cut at a word. */
export function conversationTitle(messages: readonly StoredTutorMessage[]): string {
  const first = messages.find((message) => message.role === "user")?.text.replace(/\s+/g, " ").trim() ?? "";
  if (first.length <= TITLE_MAX_LENGTH) return first;
  const cut = first.slice(0, TITLE_MAX_LENGTH);
  const space = cut.lastIndexOf(" ");
  return `${(space > TITLE_MAX_LENGTH / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

export function trimMessages(messages: readonly StoredTutorMessage[]): StoredTutorMessage[] {
  return messages.slice(-MESSAGE_LIMIT);
}

/** Newest first. */
export function sortSummaries(conversations: readonly LearnConversation[]): LearnConversationSummary[] {
  return [...conversations]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map(({ id, title, updatedAt }) => ({ id, title, updatedAt }));
}

export async function sealConversation(conversation: LearnConversation, masterKey: MasterKey): Promise<{ id: string; ciphertext: Uint8Array; iv: Uint8Array }> {
  const plaintext = new TextEncoder().encode(JSON.stringify(conversation));
  try {
    const { ciphertext, iv } = await seal(plaintext, masterKey);
    return { id: conversation.id, ciphertext, iv };
  } finally {
    plaintext.fill(0);
  }
}

export async function openConversation(record: { ciphertext: Uint8Array; iv: Uint8Array }, masterKey: MasterKey): Promise<LearnConversation | null> {
  const plaintext = await open({ ciphertext: record.ciphertext, iv: record.iv }, masterKey);
  try {
    const parsed = JSON.parse(new TextDecoder().decode(plaintext)) as Partial<LearnConversation>;
    if (typeof parsed.id !== "string" || !Array.isArray(parsed.messages)) return null;
    return {
      id: parsed.id,
      title: typeof parsed.title === "string" ? parsed.title : "",
      createdAt: typeof parsed.createdAt === "number" ? parsed.createdAt : 0,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0,
      messages: parsed.messages.filter((message): message is StoredTutorMessage =>
        message != null && (message.role === "user" || message.role === "assistant") && typeof message.text === "string"),
    };
  } finally {
    plaintext.fill(0);
  }
}

export async function listLearnConversations(masterKey: MasterKey): Promise<LearnConversationSummary[]> {
  const records = await db.learnConversations.toArray();
  const opened = await Promise.all(records.map((record) => openConversation(record, masterKey).catch(() => null)));
  return sortSummaries(opened.filter((conversation): conversation is LearnConversation => conversation != null));
}

export async function loadLearnConversation(id: string, masterKey: MasterKey): Promise<LearnConversation | null> {
  const record = await db.learnConversations.get(id);
  return record == null ? null : openConversation(record, masterKey);
}

export async function saveLearnConversation(conversation: LearnConversation, masterKey: MasterKey): Promise<void> {
  await db.learnConversations.put(await sealConversation({ ...conversation, messages: trimMessages(conversation.messages) }, masterKey));
}

export async function deleteLearnConversation(id: string): Promise<void> {
  await db.learnConversations.delete(id);
}

export async function deleteAllLearnConversations(): Promise<void> {
  await db.learnConversations.clear();
}
