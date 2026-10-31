import { Link } from "@tanstack/react-router";
import { Check, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../components/ui/button.tsx";
import { FIRST_SESSION_STEPS } from "./firstSession.ts";
import { FIRST_SESSION_EXTRAS, nextExtra, type FirstSessionExtra } from "./extras.ts";

/** The optional steps after the three required ones; each can be skipped and none changes any data. */
export default function FirstSessionExtras({ step, onStep }: { step: FirstSessionExtra; onStep: (next: FirstSessionExtra | null) => void }) {
  const { t } = useTranslation();
  const required = FIRST_SESSION_STEPS.length;
  const current = required + FIRST_SESSION_EXTRAS.indexOf(step);
  const advance = () => onStep(nextExtra(step));
  const labels = [...FIRST_SESSION_STEPS.map((id) => t(`firstSession.${id}.label`)), ...FIRST_SESSION_EXTRAS.map((id) => t(`firstSession.${id}.label`))];

  return (
    <main aria-label={t("firstSession.aria")} className="app-page max-w-2xl">
      <ol aria-label={t("firstSession.progressAria")} className="flex items-center gap-2">
        {labels.map((label, i) => {
          const done = i < current;
          const isCurrent = i === current;
          return (
            <li key={label} className="flex flex-1 items-center gap-2" aria-current={isCurrent ? "step" : undefined}>
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${done ? "bg-positive text-white" : isCurrent ? "border border-ocean-primary/50 bg-ocean-wash text-ocean-dark" : "border border-border text-muted-foreground"}`}>
                {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className={`hidden truncate text-xs sm:block ${isCurrent ? "font-semibold" : "text-muted-foreground"}`}>{label}</span>
            </li>
          );
        })}
      </ol>

      <section className="rounded-lg border border-border bg-card p-4 sm:p-6">
        <p className="text-xs font-medium text-muted-foreground">{t("firstSession.optional")}</p>
        <h1 className="mt-1 text-lg font-semibold sm:text-xl">{t(`firstSession.${step}.title`)}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t(`firstSession.${step}.body`)}</p>
        <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={advance}>{t(step === "ai" ? "firstSession.ai.done" : "firstSession.later")}</Button>
          {step === "voice" ? (
            <Button asChild>
              <Link to="/settings" search={{ panel: "voice" }}>
                {t("firstSession.voice.test")}
                <ChevronRight className="h-4 w-4" />
              </Link>
            </Button>
          ) : (
            <Button asChild variant="outline">
              <Link to="/settings" search={{ panel: "assistant" }}>{t("firstSession.ai.key")}</Link>
            </Button>
          )}
        </div>
      </section>
    </main>
  );
}
