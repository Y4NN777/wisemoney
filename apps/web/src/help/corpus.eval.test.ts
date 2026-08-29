import { describe, expect, it } from "vitest";
import { findRelevantHelpSections, getHelpSections } from "./corpus.ts";

describe("WiseBot product retrieval evaluation", () => {
  it("retrieves at least 95% of a 150+ bilingual task question set in the top three", () => {
    const cases = (["fr", "en"] as const).flatMap((locale) => getHelpSections(locale).flatMap((task) => [
      task.title,
      ...task.aliases.slice(0, 3),
    ].map((question) => ({ locale, question, taskId: task.id }))));
    expect(cases.length).toBeGreaterThanOrEqual(150);
    const successes = cases.filter(({ locale, question, taskId }) =>
      findRelevantHelpSections(getHelpSections(locale), question, 3).some(({ id }) => id === taskId));
    expect(successes.length / cases.length).toBeGreaterThanOrEqual(0.95);
  });

  it.each([
    ["fr", "Comment transférer de l'argent entre mes deux comptes ?", "virements"],
    ["en", "How do I transfer money between two accounts?", "virements"],
    ["fr", "Comment restaurer mon espace sur un nouveau téléphone ?", "restauration"],
    ["en", "Restore my space on a new phone", "restauration"],
    ["fr", "Où voir toutes mes opérations ?", "tableau-de-bord"],
    ["en", "Where can I see all operations?", "tableau-de-bord"],
    ["fr", "Comment prévoir une dépense sans changer mon solde ?", "depenses-prevues"],
    ["en", "Plan an expense without changing my balance", "depenses-prevues"],
    ["fr", "Comment suivre ce qu'une personne me doit ?", "dettes"],
    ["en", "How do I track money someone owes me?", "dettes"],
    ["fr", "WiseBot peut-il analyser mes comptes ?", "intelligence"],
    ["en", "Can WiseBot analyze my accounts?", "intelligence"],
  ] as const)("keeps essential journey %s/%s in the top three", (locale, question, taskId) => {
    expect(findRelevantHelpSections(getHelpSections(locale), question, 3).map(({ id }) => id)).toContain(taskId);
  });
});
