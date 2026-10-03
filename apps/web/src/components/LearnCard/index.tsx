import { Link } from "@tanstack/react-router";
import { ChevronRight, GraduationCap } from "lucide-react";
import { useTranslation } from "react-i18next";

/** Home entry to the literacy pillar. Always present: lessons need no provider and work offline. */
export default function LearnCard() {
  const { t } = useTranslation();
  return (
    <Link
      to="/learn"
      className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 text-sm font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-ocean-wash text-ocean-primary" aria-hidden="true">
        <GraduationCap className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">{t("learnCard.title")}</span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}
