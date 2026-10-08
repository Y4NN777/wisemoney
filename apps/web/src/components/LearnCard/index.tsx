import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import WiseLearnMark from "../WiseLearnMark.tsx";

/** Home entry to WiseLearn. Always present: the tutor needs a connection, not a configured provider. */
export default function LearnCard() {
  const { t } = useTranslation();
  return (
    <Link
      to="/learn"
      className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 text-sm font-semibold hover:bg-muted"
    >
      <WiseLearnMark size="sm" ring="ring-card" />
      <span className="min-w-0 flex-1">{t("learnCard.title")}</span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}
