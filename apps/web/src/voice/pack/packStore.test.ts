import { describe, expect, it, vi } from "vitest";
import type { PackFile } from "./packFiles.ts";
import { PackDownloadError, deletePack, downloadPack, packStatus, type PackDeps } from "./packStore.ts";

const files: PackFile[] = [
  { url: "https://hub/a.json", bytes: 3, sha256: null },
  { url: "https://hub/b.onnx", bytes: 4, sha256: "hash-of-b" },
];

function fakeDeps(bodies: Record<string, string>, failOn: string | null = null) {
  const stored = new Map<string, Response>();
  const fetched: string[] = [];
  let exists = false;
  const deps: PackDeps = {
    has: () => Promise.resolve(exists),
    open: () => {
      exists = true;
      return Promise.resolve({
        match: (url: string) => Promise.resolve(stored.get(url)),
        put: (url: string, response: Response) => { stored.set(url, response); return Promise.resolve(); },
        keys: () => Promise.resolve([]),
      } as unknown as Cache);
    },
    remove: () => { stored.clear(); exists = false; return Promise.resolve(true); },
    fetch: vi.fn((url: string) => {
      fetched.push(url);
      if (url === failOn) return Promise.reject(new TypeError("offline"));
      return Promise.resolve(new Response(bodies[url] ?? "", { status: 200 }));
    }) as unknown as typeof fetch,
    sha256: (data) => Promise.resolve(new TextDecoder().decode(data) === "BBBB" ? "hash-of-b" : "other"),
  };
  return { deps, stored, fetched, exists: () => exists };
}

describe("voice pack store", () => {
  it("checks a phone without the pack without creating its store", async () => {
    const { deps, exists } = fakeDeps({});
    expect(await packStatus(files, deps)).toEqual({ presentBytes: 0, totalBytes: 7, complete: false });
    expect(exists()).toBe(false);
  });

  it("downloads every file, checked, and reports progress up to the total", async () => {
    const { deps, stored } = fakeDeps({ "https://hub/a.json": "AAA", "https://hub/b.onnx": "BBBB" });
    const progress: number[] = [];
    await downloadPack(files, (loaded) => progress.push(loaded), new AbortController().signal, deps);
    expect([...stored.keys()]).toEqual(["https://hub/a.json", "https://hub/b.onnx"]);
    expect(progress.at(-1)).toBe(7);
    expect(await packStatus(files, deps)).toEqual({ presentBytes: 7, totalBytes: 7, complete: true });
  });

  it("resumes at the first missing file after an interruption", async () => {
    const { deps, fetched } = fakeDeps({ "https://hub/a.json": "AAA", "https://hub/b.onnx": "BBBB" }, "https://hub/b.onnx");
    await expect(downloadPack(files, () => undefined, new AbortController().signal, deps)).rejects.toEqual(new PackDownloadError("network", "https://hub/b.onnx"));
    expect(await packStatus(files, deps)).toEqual({ presentBytes: 3, totalBytes: 7, complete: false });
    deps.fetch = vi.fn(() => Promise.resolve(new Response("BBBB")));
    await downloadPack(files, () => undefined, new AbortController().signal, deps);
    expect(fetched).toEqual(["https://hub/a.json", "https://hub/b.onnx"]);
    expect(deps.fetch).toHaveBeenCalledTimes(1);
    expect((await packStatus(files, deps)).complete).toBe(true);
  });

  it("keeps nothing of a file with the wrong size or hash", async () => {
    const short = fakeDeps({ "https://hub/a.json": "AA" });
    await expect(downloadPack(files, () => undefined, new AbortController().signal, short.deps)).rejects.toEqual(new PackDownloadError("corrupt", "https://hub/a.json"));
    expect(short.stored.size).toBe(0);
    const tampered = fakeDeps({ "https://hub/a.json": "AAA", "https://hub/b.onnx": "XXXX" });
    await expect(downloadPack(files, () => undefined, new AbortController().signal, tampered.deps)).rejects.toEqual(new PackDownloadError("corrupt", "https://hub/b.onnx"));
    expect([...tampered.stored.keys()]).toEqual(["https://hub/a.json"]);
  });

  it("deletes the whole pack", async () => {
    const { deps } = fakeDeps({ "https://hub/a.json": "AAA", "https://hub/b.onnx": "BBBB" });
    await downloadPack(files, () => undefined, new AbortController().signal, deps);
    await deletePack(deps);
    expect((await packStatus(files, deps)).presentBytes).toBe(0);
  });
});
