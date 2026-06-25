import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card.tsx";
import { Wallet, Target, Repeat, ArrowRight } from "lucide-react";

export default function Planning() {
  return (
    <main aria-label="Planning" className="app-page">
      <div className="page-head">
        <div>
          <p className="page-kicker">Planning</p>
          <h1 className="page-title">Budgets, Goals & Recurring</h1>
        </div>
      </div>
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle className="text-base">Budgets, Goals &amp; Recurring</CardTitle>
          <CardDescription>
            Plan your spending, save toward goals, and track recurring transactions
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-3">
          <Link
            to="/budgets"
            className="interactive-surface flex min-h-24 flex-col justify-between rounded-lg border border-border bg-card p-3"
          >
            <span className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm font-medium">Budgets</span>
            </span>
            <ArrowRight className="h-4 w-4 self-end text-muted-foreground" />
          </Link>
          <Link
            to="/goals"
            className="interactive-surface flex min-h-24 flex-col justify-between rounded-lg border border-border bg-card p-3"
          >
            <span className="flex items-center gap-2">
              <Target className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm font-medium">Goals</span>
            </span>
            <ArrowRight className="h-4 w-4 self-end text-muted-foreground" />
          </Link>
          <Link
            to="/recurring"
            className="interactive-surface flex min-h-24 flex-col justify-between rounded-lg border border-border bg-card p-3"
          >
            <span className="flex items-center gap-2">
              <Repeat className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm font-medium">Recurring Transactions</span>
            </span>
            <ArrowRight className="h-4 w-4 self-end text-muted-foreground" />
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
