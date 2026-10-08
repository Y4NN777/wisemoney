import { describe, expect, it } from "vitest";
import { splitAnswer } from "./answerText.ts";

describe("tutor answer text", () => {
  it("takes the two follow-up questions out of the answer", () => {
    expect(splitAnswer("Un budget dit où va chaque franc.\n\n>> Comment commencer ?\n>> Et si mon revenu change ?")).toEqual({
      body: "Un budget dit où va chaque franc.",
      followUps: ["Comment commencer ?", "Et si mon revenu change ?"],
    });
  });

  it("keeps at most two, drops empty or bold-wrapped markers, and hides a marker still being written", () => {
    expect(splitAnswer("Texte\n>> **Un ?**\n>> Deux ?\n>> Trois ?").followUps).toEqual(["Un ?", "Deux ?"]);
    expect(splitAnswer("Texte\n>>   ").followUps).toEqual([]);
    expect(splitAnswer("Texte\n>")).toEqual({ body: "Texte", followUps: [] });
  });

  it("leaves an answer without follow-ups as it is", () => {
    expect(splitAnswer("**Gras** et une liste :\n- un\n- deux")).toEqual({ body: "**Gras** et une liste :\n- un\n- deux", followUps: [] });
  });
});
