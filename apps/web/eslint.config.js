import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

/** @type {import("eslint").Linter.FlatConfig[]} */
export default [
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "./tsconfig.json",
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      ...tsPlugin.configs["recommended"].rules,
      ...tsPlugin.configs["recommended-requiring-type-checking"].rules,
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/strict-boolean-expressions": "error",
      "@typescript-eslint/no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      }],
    },
  },
  // NFR-MOD-02 (docs/SRS.md): UI surfaces talk to AI through the pillar modules, never through
  // the orchestration client or a provider SDK. Enforced with the core rule so no dependency is
  // needed; the layering it encodes is ARCHITECTURE.md §12 rule 2.
  {
    files: ["src/ui/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}", "src/routes/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          { group: ["**/ai/*", "@/ai/*"], message: "NFR-MOD-02: import AI through pillars/intelligence or pillars/literacy, not the orchestration client." },
          { group: ["openai", "@google/genai", "@google/generative-ai", "@anthropic-ai/*"], message: "NFR-MOD-02: provider SDKs never enter the UI." },
        ],
      }],
    },
  },
  // NFR-MOD-01: Financial State stays independent of the AI pillars (ARCHITECTURE.md §12 rule 1).
  {
    files: ["src/pillars/state/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          { group: ["**/pillars/intelligence/*", "@/pillars/intelligence/*", "**/pillars/literacy/*", "@/pillars/literacy/*", "**/ai/*", "@/ai/*"], message: "NFR-MOD-01: the state pillar must not depend on intelligence, literacy or the AI client." },
        ],
      }],
    },
  },
];
