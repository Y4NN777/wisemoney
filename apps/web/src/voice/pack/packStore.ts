import { PACK_CACHE, packBytes, type PackFile } from "./packFiles.ts";

type CacheLike = Pick<Cache, "match" | "put" | "keys">;
export type PackDeps = {
  has: () => Promise<boolean>;
  open: () => Promise<CacheLike>;
  remove: () => Promise<boolean>;
  fetch: typeof fetch;
  sha256: (data: ArrayBuffer) => Promise<string>;
};

const browserDeps = (): PackDeps => ({
  has: () => caches.has(PACK_CACHE),
  open: () => caches.open(PACK_CACHE),
  // The pack's files, and its code kept by the service worker for offline use (src/sw.ts).
  remove: async () => (await Promise.all([caches.delete(PACK_CACHE), caches.delete("voice-pack-code")])).some(Boolean),
  fetch: (input, init) => fetch(input, init),
  sha256: async (data) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", data))].map((byte) => byte.toString(16).padStart(2, "0")).join(""),
});

export type PackStatus = { presentBytes: number; totalBytes: number; complete: boolean };

/** Which files of the pack are already on the phone; a file counts only when it is all there. */
export async function packStatus(files: readonly PackFile[], deps: PackDeps = browserDeps()): Promise<PackStatus> {
  const totalBytes = packBytes(files);
  // Checking must not create the store: a phone that never installed the pack keeps nothing.
  if (!(await deps.has())) return { presentBytes: 0, totalBytes, complete: false };
  const cache = await deps.open();
  let presentBytes = 0;
  for (const file of files) if ((await cache.match(file.url)) != null) presentBytes += file.bytes;
  return { presentBytes, totalBytes, complete: presentBytes === totalBytes };
}

export class PackDownloadError extends Error {
  constructor(readonly reason: "network" | "corrupt" | "storage", readonly url: string) {
    super(`${reason}: ${url}`);
  }
}

/**
 * Downloads the files not yet on the phone, one by one, so an interrupted download resumes at the
 * next missing file. Each file is checked (size, and SHA-256 for the model weights) before it is
 * stored; nothing half-downloaded is ever kept.
 */
export async function downloadPack(
  files: readonly PackFile[],
  onProgress: (loadedBytes: number, totalBytes: number) => void,
  signal: AbortSignal,
  deps: PackDeps = browserDeps(),
): Promise<void> {
  const cache = await deps.open();
  const totalBytes = packBytes(files);
  let done = 0;
  for (const file of files) {
    if ((await cache.match(file.url)) != null) {
      done += file.bytes;
      onProgress(done, totalBytes);
      continue;
    }
    let response: Response;
    try {
      response = await deps.fetch(file.url, { signal, cache: "no-store" });
    } catch (error) {
      if (signal.aborted) throw error;
      throw new PackDownloadError("network", file.url);
    }
    if (!response.ok || response.body == null) throw new PackDownloadError("network", file.url);
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    for (;;) {
      let part: ReadableStreamReadResult<Uint8Array>;
      try {
        part = await reader.read();
      } catch (error) {
        if (signal.aborted) throw error;
        throw new PackDownloadError("network", file.url);
      }
      if (part.done) break;
      chunks.push(part.value);
      received += part.value.byteLength;
      onProgress(done + Math.min(received, file.bytes), totalBytes);
    }
    if (received !== file.bytes) throw new PackDownloadError("corrupt", file.url);
    const body = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    if (file.sha256 != null && (await deps.sha256(body.buffer)) !== file.sha256) throw new PackDownloadError("corrupt", file.url);
    const headers = new Headers(response.headers);
    headers.set("content-length", String(received));
    try {
      await cache.put(file.url, new Response(body, { status: 200, headers }));
    } catch {
      throw new PackDownloadError("storage", file.url);
    }
    done += file.bytes;
    onProgress(done, totalBytes);
  }
}

/** Deletes the whole pack store (only the voice pack uses it) and the pack's offline code. */
export async function deletePack(deps: PackDeps = browserDeps()): Promise<void> {
  await deps.remove();
}
