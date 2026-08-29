import { HELP_KNOWLEDGE_VERSION, HELP_SURFACES, type HelpLocale, type SurfaceId } from "./corpus.ts";

export const APP_FAULT_CODES = [
  "dashboard_load", "storage_unavailable", "render_conflict", "network_unavailable", "unknown",
] as const;

export type AppFaultCode = typeof APP_FAULT_CODES[number];
export type HelpEntryPoint = "manual" | "coach" | "notification" | "error";

export type SafeHelpContext = {
  schemaVersion: 1;
  knowledgeVersion: string;
  locale: HelpLocale;
  entryPoint: HelpEntryPoint;
  surfaceId: SurfaceId;
  taskId?: string;
  faultCode?: AppFaultCode;
};

export function surfaceFromPathname(pathname: string): SurfaceId {
  if (pathname === "/") return "dashboard";
  const first = pathname.split("/").filter(Boolean)[0] ?? "global";
  return HELP_SURFACES.includes(first as SurfaceId) ? first as SurfaceId : "global";
}

export function createSafeHelpContext(input: {
  locale: string;
  entryPoint?: HelpEntryPoint;
  surfaceId?: SurfaceId;
  taskId?: string;
  faultCode?: AppFaultCode;
}): SafeHelpContext {
  return {
    schemaVersion: 1,
    knowledgeVersion: HELP_KNOWLEDGE_VERSION,
    locale: input.locale.toLowerCase().startsWith("fr") ? "fr" : "en",
    entryPoint: input.entryPoint ?? "manual",
    surfaceId: input.surfaceId ?? surfaceFromPathname(typeof window === "undefined" ? "/" : window.location.pathname),
    ...(input.taskId == null ? {} : { taskId: input.taskId }),
    ...(input.faultCode == null ? {} : { faultCode: input.faultCode }),
  };
}

export function isSafeHelpContext(value: unknown): value is SafeHelpContext {
  if (value == null || typeof value !== "object") return false;
  const context = value as Partial<SafeHelpContext>;
  const allowedKeys = new Set(["schemaVersion", "knowledgeVersion", "locale", "entryPoint", "surfaceId", "taskId", "faultCode"]);
  return Object.keys(value).every((key) => allowedKeys.has(key)) && context.schemaVersion === 1 &&
    context.knowledgeVersion === HELP_KNOWLEDGE_VERSION &&
    (context.locale === "fr" || context.locale === "en") &&
    (context.entryPoint === "manual" || context.entryPoint === "coach" || context.entryPoint === "notification" || context.entryPoint === "error") &&
    HELP_SURFACES.includes(context.surfaceId as SurfaceId) &&
    (context.taskId == null || typeof context.taskId === "string") &&
    (context.faultCode == null || APP_FAULT_CODES.includes(context.faultCode));
}
