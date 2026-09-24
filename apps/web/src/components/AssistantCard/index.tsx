import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MessageSquare } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/button.tsx";
import { getAICapability } from "../../lib/capabilities.ts";

export const AI_CAPABILITY_QUERY_KEY = ["aiCapability"] as const;

/** Home entry to the assistant; rendered only once a provider is actually usable. */
export default function AssistantCard() {
  const { t } = useTranslation();
  const capabilityQuery = useQuery({ queryKey: AI_CAPABILITY_QUERY_KEY, queryFn: getAICapability });

  if (capabilityQuery.data?.available !== true) return null;

  return (
    <section
      aria-label={t("assistantCard.title")}
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-ocean-wash text-ocean-primary">
          <MessageSquare className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-sm font-semibold">{t("assistantCard.title")}</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t("assistantCard.body")}</p>
        </div>
      </div>
      <Button asChild size="sm" variant="outline" className="shrink-0">
        <Link to="/assistant">{t("assistantCard.action")}</Link>
      </Button>
    </section>
  );
}
