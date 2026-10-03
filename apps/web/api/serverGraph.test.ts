import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Vercel compiles each file reachable from a function and keeps import specifiers as written.
 * On the Node runtime a specifier ending in ".ts" (or a "@/" alias) then fails with
 * ERR_UNKNOWN_FILE_EXTENSION / ERR_MODULE_NOT_FOUND, and the function answers 500 on every
 * request. That happened to the help gateway from 2026-08-29 to 2026-10-03, hidden by the client
 * fallback. Every file a function can reach must import siblings with ".js" specifiers.
 */
const apiDir = dirname(fileURLToPath(import.meta.url));
const webDir = resolve(apiDir, "..");

function entrypoints(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entrypoints(path);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") && !entry.name.startsWith("_") ? [path] : [];
  });
}

const IMPORT_PATTERN = /(?:^|\n)\s*(import|export)\s+(type\s+)?[^"';]*?from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

function runtimeSpecifiers(source: string): string[] {
  return [...source.matchAll(IMPORT_PATTERN)].flatMap((match) => {
    const typeOnly = match[2] != null;
    const specifier = match[3] ?? match[4];
    return typeOnly || specifier == null ? [] : [specifier];
  });
}

function walk(file: string, seen: Map<string, string[]>): void {
  if (seen.has(file)) return;
  const specifiers = runtimeSpecifiers(readFileSync(file, "utf8"));
  seen.set(file, specifiers);
  for (const specifier of specifiers) {
    if (!specifier.startsWith(".")) continue;
    const target = resolve(dirname(file), specifier.replace(/\.js$/, ".ts"));
    if (existsSync(target)) walk(target, seen);
  }
}

describe("server function import graph", () => {
  const graph = new Map<string, string[]>();
  const entries = entrypoints(apiDir);
  for (const entry of entries) walk(entry, graph);

  it("finds the functions and the shared modules they reach", () => {
    const files = [...graph.keys()].map((file) => relative(webDir, file));
    expect(entries.map((file) => relative(webDir, file)).sort()).toEqual(["api/help/messages.ts", "api/learn/messages.ts"]);
    expect(files).toEqual(expect.arrayContaining(["api/help/_helpGateway.ts", "api/learn/_learnGateway.ts", "src/help/context.ts", "src/help/corpus.ts", "src/literacy/corpus.ts", "src/literacy/corpus.en.ts", "src/literacy/corpus.fr.ts"]));
  });

  it("uses only .js relative specifiers that resolve to a source file, and no alias or package", () => {
    const problems: string[] = [];
    for (const [file, specifiers] of graph) {
      for (const specifier of specifiers) {
        const where = `${relative(webDir, file)} -> ${specifier}`;
        if (specifier.startsWith("node:")) continue;
        if (!specifier.startsWith(".")) problems.push(`${where}: not a relative import (aliases and packages are not bundled for the functions)`);
        else if (!specifier.endsWith(".js")) problems.push(`${where}: must end with .js`);
        else if (!existsSync(resolve(dirname(file), specifier.replace(/\.js$/, ".ts")))) problems.push(`${where}: no such source file`);
      }
    }
    expect(problems).toEqual([]);
  });
});
