import type { ProductTask, SurfaceId } from "./corpus.ts";

export const SUGGESTED_TASK_LIMIT = 3;

/**
 * WiseBot empty state (panel rework, 2026-09-26): tasks from the help corpus offered as tappable
 * questions. Tasks for the current surface come first, then the rest of the corpus in order, so the
 * chips are never empty and never repeat.
 */
export function suggestedTasks(tasks: readonly ProductTask[], surfaceId: SurfaceId | undefined, limit = SUGGESTED_TASK_LIMIT): ProductTask[] {
  const onSurface = surfaceId == null ? [] : tasks.filter((task) => task.surfaces.includes(surfaceId));
  const seen = new Set<string>();
  const result: ProductTask[] = [];
  for (const task of [...onSurface, ...tasks]) {
    if (seen.has(task.id)) continue;
    seen.add(task.id);
    result.push(task);
    if (result.length === limit) break;
  }
  return result;
}
