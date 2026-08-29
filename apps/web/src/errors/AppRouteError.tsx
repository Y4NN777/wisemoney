import { useEffect, useMemo } from "react";
import AppFaultPanel from "./AppFaultPanel.tsx";
import { classifyAppError } from "./diagnostics.ts";
import { surfaceFromPathname } from "../help/context.ts";

export default function AppRouteError({ error, reset }: { error: unknown; reset: () => void }) {
  const code = useMemo(() => classifyAppError(error), [error]);
  useEffect(() => {
    // Keep the technical detail in the local developer console, never in the user interface.
    console.error("WiseMoney route recovery", error);
  }, [error]);
  return (
    <main className="app-page flex min-h-[60vh] items-center justify-center">
      <AppFaultPanel faultCode={code} surfaceId={surfaceFromPathname(window.location.pathname)} onRetry={reset} />
    </main>
  );
}
