// The identifiers every help module shares, kept apart from the task corpus so that code which
// only needs to name a surface (error screens, the WiseBot context) does not load the corpus.
export type HelpLocale = "en" | "fr";

export const HELP_KNOWLEDGE_VERSION = "1.0.0-2026-08-29";

export const HELP_SURFACES = [
  "landing", "onboarding", "restore", "unlock", "dashboard", "capture", "operations",
  "planning", "budgets", "goals", "planned-expenses", "recurring", "debts", "settings",
  "help", "assistant", "updates", "global",
] as const;

export type SurfaceId = typeof HELP_SURFACES[number];
