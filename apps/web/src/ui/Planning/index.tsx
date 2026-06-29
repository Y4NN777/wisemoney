import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card.tsx";
import { Wallet, Target, Repeat, ArrowRight, HandCoins } from "lucide-react";

export default function Planning() {
  const { t } = useTranslation();

  return (
    <main aria-label="Planning" className="app-page">
      <div className="page-head">
        <div>
          <p className="page-kicker">{t("planning.title")}</p>
          <h1 className="page-title">{t("planning.cardTitle")}</h1>
        </div>
      </div>
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle className="text-base">{t("planning.cardTitle")}</CardTitle>
          <CardDescription>
            {t("planning.cardDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            to="/budgets"
            className="interactive-surface flex min-h-24 flex-col justify-between rounded-lg border border-border bg-card p-3"
          >
            <span className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm font-medium">{t("planning.links.budgets")}</span>
            </span>
            <ArrowRight className="h-4 w-4 self-end text-muted-foreground" />
          </Link>
          <Link
            to="/goals"
            className="interactive-surface flex min-h-24 flex-col justify-between rounded-lg border border-border bg-card p-3"
          >
            <span className="flex items-center gap-2">
              <Target className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm font-medium">{t("planning.links.goals")}</span>
            </span>
            <ArrowRight className="h-4 w-4 self-end text-muted-foreground" />
          </Link>
          <Link
            to="/recurring"
            className="interactive-surface flex min-h-24 flex-col justify-between rounded-lg border border-border bg-card p-3"
          >
            <span className="flex items-center gap-2">
              <Repeat className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm font-medium">{t("planning.links.recurring")}</span>
            </span>
            <ArrowRight className="h-4 w-4 self-end text-muted-foreground" />
          </Link>
          <Link
            to="/debts"
            className="interactive-surface flex min-h-24 flex-col justify-between rounded-lg border border-border bg-card p-3"
          >
            <span className="flex items-center gap-2">
              <HandCoins className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm font-medium">{t("planning.links.debts")}</span>
            </span>
            <ArrowRight className="h-4 w-4 self-end text-muted-foreground" />
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
