import type { LiteracyLocale } from "./corpus.js";

/**
 * Questions a beginner would actually ask, in their own words (Y4NN, 2026-10-03: someone who
 * knows nothing about finance does not ask for "compound interest"). Each one is tied to the
 * lessons that answer it, so it also works on the device with no connection.
 */
export type LiteracyStarter = { id: string; question: Record<LiteracyLocale, string>; unitIds: string[] };

export const LITERACY_STARTERS: LiteracyStarter[] = [
  {
    id: "broke-before-month-end",
    question: { en: "Why am I broke before the end of the month?", fr: "Pourquoi je suis à sec avant la fin du mois ?" },
    unitIds: ["tracking-spending", "budget-basics"],
  },
  {
    id: "save-on-small-income",
    question: { en: "How do I save when I earn very little?", fr: "Comment épargner quand je gagne très peu ?" },
    unitIds: ["emergency-fund", "budget-methods"],
  },
  {
    id: "first-pay",
    question: { en: "I just got paid for the first time. What now?", fr: "Je viens de toucher ma première paie. Je fais quoi ?" },
    unitIds: ["first-income", "money-goals"],
  },
  {
    id: "double-my-money",
    question: { en: "Someone says they can double my money. Is it real?", fr: "On me propose de doubler mon argent. C’est vrai ?" },
    unitIds: ["scams-ponzi", "risk-return"],
  },
];
