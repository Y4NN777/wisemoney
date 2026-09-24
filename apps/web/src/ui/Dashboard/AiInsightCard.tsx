
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card.tsx";

import {
  Lightbulb, } from "lucide-react";
import type { } from "../../domain/financialOperations.ts";

import type { AIResult } from "../../pillars/intelligence/index.ts";
import { useTranslation } from "react-i18next";

export function InsightCard({ insight }: { insight: AIResult }) {
  const { t } = useTranslation();
  if ("unavailable" in insight) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center gap-2 pb-2">
          <Lightbulb className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">{t("dashboard.aiInsight")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{insight.message}</p>
        </CardContent>
      </Card>
    );
  }
  return (
      <Card>
        <CardHeader className="flex flex-row items-center gap-2 pb-2">
          <Lightbulb className="h-4 w-4 text-ocean-secondary" />
          <CardTitle className="text-sm font-medium">{t("dashboard.aiInsight")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed">{insight.text}</p>
          <p className="text-xs text-muted-foreground mt-2">{t("dashboard.viaProvider", { provider: insight.provider })}</p>
        </CardContent>
      </Card>
  );
}
