/**
 * Which build is running, read from the hashed entry script in index.html. Its name changes
 * whenever the shipped code or text changes, and not on a deploy that changes nothing visible.
 */
export function currentBuildId(doc: Pick<Document, "querySelector"> = document): string | null {
  return doc.querySelector('script[type="module"][src]')?.getAttribute("src") ?? null;
}

const LAST_BUILD_KEY = "wisemoney:last-build";

type BuildStorage = Pick<Storage, "getItem" | "setItem">;

function resolveStorage(storage?: BuildStorage): BuildStorage | null {
  if (storage != null) return storage;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * True once per new build, the first time it is asked; records the build either way. The first
 * build a device ever runs is not news, so it returns false.
 */
export function takeUpdateNotice(current: string | null, storage?: BuildStorage): boolean {
  const target = resolveStorage(storage);
  if (current == null || target == null) return false;
  try {
    const previous = target.getItem(LAST_BUILD_KEY);
    if (previous === current) return false;
    target.setItem(LAST_BUILD_KEY, current);
    return previous != null;
  } catch {
    return false;
  }
}
