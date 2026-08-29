import { Bot, Copy, RefreshCcw, RotateCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../components/ui/button.tsx";
import type { SurfaceId } from "../help/corpus.ts";
import type { AppFaultCode } from "../help/context.ts";
import { requestWiseBot } from "../help/WiseBotProvider.tsx";
import { recordLocalDiagnostic, type LocalDiagnostic } from "./diagnostics.ts";

export default function AppFaultPanel({ faultCode, surfaceId, onRetry, className = "" }: {
  faultCode: AppFaultCode;
  surfaceId: SurfaceId;
  onRetry?: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const [diagnostic, setDiagnostic] = useState<LocalDiagnostic | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => setDiagnostic(recordLocalDiagnostic(faultCode, surfaceId)), [faultCode, surfaceId]);

  const copyId = async () => {
    try {
      if (diagnostic == null) return;
      await navigator.clipboard.writeText(diagnostic.id);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch { /* The identifier remains selectable below. */ }
  };

  return (
    <section role="alert" className={`mx-auto w-full max-w-xl border border-border bg-card p-5 text-center ${className}`}>
      <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-ocean-wash text-ocean-primary"><RefreshCcw className="h-5 w-5" /></span>
      <h1 className="mt-3 text-lg font-bold">{t("fault.title")}</h1>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t(`fault.codes.${faultCode}`)}</p>
      <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
        {onRetry != null && <Button type="button" onClick={onRetry}><RotateCw className="h-4 w-4" />{t("fault.retry")}</Button>}
        <Button type="button" variant="outline" onClick={() => window.location.reload()}><RefreshCcw className="h-4 w-4" />{t("fault.reopen")}</Button>
        <Button type="button" variant="outline" onClick={() => requestWiseBot({ entryPoint: "error", surfaceId, faultCode })}><Bot className="h-4 w-4" />{t("fault.askWiseBot")}</Button>
      </div>
      <button type="button" onClick={() => { void copyId(); }} className="mt-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground underline underline-offset-4">
        <Copy className="h-3.5 w-3.5" />{copied ? t("fault.copied") : t("fault.diagnostic", { id: diagnostic?.id ?? "…" })}
      </button>
    </section>
  );
}
