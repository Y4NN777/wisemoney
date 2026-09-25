import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, ChevronRight, ListChecks } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/button.tsx";
import { useOpenCaptureSheet } from "../CaptureSheet/index.tsx";
import type { FinancialStateSnapshot } from "../../domain/financialState.ts";
import { allFirstStepsDone, dismissFirstSteps, isFirstStepsDismissed, selectFirstSteps, type FirstStepId } from "./firstSteps.ts";

/**
 * "First steps": what to do first, as a checklist that ticks from real state, plus one line
 * naming the three tabs. Replaces the empty dashboard's lone button and stays on Home until
 * the three steps exist or the user dismisses it (onboarding-rethink decision 2).
 */
export default function FirstSteps({ snapshot, hasMovement }: { snapshot: FinancialStateSnapshot; hasMovement: boolean }) {
  const { t, i18n } = useTranslation();
  const openCapture = useOpenCaptureSheet();
  const [dismissed, setDismissed] = useState(isFirstStepsDismissed);
  const defaultNames = i18n.languages.map((language) => t("captureSheet.cashName", { lng: language }));
  const steps = selectFirstSteps(snapshot, hasMovement, [...new Set([...defaultNames, "Cash", "Espèces"])]);

  if (dismissed || allFirstStepsDone(steps)) return null;

  const actions: Record<FirstStepId, React.ReactNode> = {
    firstMovement: (
      <Button type="button" size="sm" onClick={() => openCapture("transaction")}>
        {t("firstSteps.firstMovement.action")}
        <ChevronRight className="h-4 w-4" />
      </Button>
    ),
    accounts: (
      <Button asChild size="sm" variant="outline">
        <Link to="/settings" search={{ panel: "accounts" }}>{t("firstSteps.accounts.action")}<ChevronRight className="h-4 w-4" /></Link>
      </Button>
    ),
    plan: (
      <Button asChild size="sm" variant="outline">
        <Link to="/planning">{t("firstSteps.plan.action")}<ChevronRight className="h-4 w-4" /></Link>
      </Button>
    ),
  };

  return (
    <section aria-label={t("firstSteps.title")} className="rounded-lg border border-ocean-primary/25 bg-card">
      <div className="flex items-start gap-3 p-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-ocean-wash text-ocean-primary">
          <ListChecks className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">{t("firstSteps.title")}</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t("firstSteps.body")}</p>
        </div>
      </div>
      <ol className="divide-y divide-border border-t border-border">
        {steps.map((step, index) => (
          <li key={step.id} className="flex items-center gap-3 px-4 py-3">
            <span
              aria-hidden="true"
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${step.done ? "bg-positive text-white" : "border border-border text-muted-foreground"}`}
            >
              {step.done ? <Check className="h-3.5 w-3.5" /> : index + 1}
            </span>
            <span className={`min-w-0 flex-1 text-sm ${step.done ? "text-muted-foreground line-through" : ""}`}>
              {t(`firstSteps.${step.id}.label`)}
              {step.done && <span className="sr-only"> {t("firstSteps.done")}</span>}
            </span>
            {!step.done && <span className="shrink-0">{actions[step.id]}</span>}
          </li>
        ))}
      </ol>
      <div className="flex flex-col gap-2 border-t border-border px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>{t("firstSteps.tabs")}</p>
        <button
          type="button"
          className="self-start text-xs font-medium underline underline-offset-4 hover:text-foreground sm:self-auto"
          onClick={() => { dismissFirstSteps(); setDismissed(true); }}
        >
          {t("firstSteps.dismiss")}
        </button>
      </div>
    </section>
  );
}
