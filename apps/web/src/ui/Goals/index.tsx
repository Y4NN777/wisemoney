import { useState, type FormEvent } from "react";
import { useFinancialState, useCreateGoal, useArchiveGoal } from "../../hooks/useFinancialState.ts";
import type { CreateGoalParams } from "../../pillars/state/index.ts";
import { Card, CardContent } from "../../components/ui/card.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Input } from "../../components/ui/input.tsx";
import { Label } from "../../components/ui/label.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../../components/ui/dialog.tsx";
import { Progress } from "../../components/ui/progress.tsx";
import { Skeleton } from "../../components/ui/skeleton.tsx";
import { Plus, Archive, Target } from "lucide-react";
import { toast } from "sonner";
import { currencyInputStep, formatMoney as formatMoneyValue, parseMajorUnits } from "../../types/money.ts";
import { parseLocalDateInput } from "../../lib/localDate.ts";
import { useTranslation } from "react-i18next";

function formatMoney(minorUnits: number, currency: string): string {
  return formatMoneyValue({ minorUnits, currency });
}

export default function Goals() {
  const { t } = useTranslation();
  const { data: snapshot, isLoading } = useFinancialState();
  const createGoal = useCreateGoal();
  const archiveGoal = useArchiveGoal();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [targetStr, setTargetStr] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    if (!name.trim()) {
      setCreateError(t("goals.errors.nameRequired"));
      return;
    }
    const currency = snapshot?.baseCurrency ?? "XOF";
    const minorUnits = parseMajorUnits(targetStr, currency);
    if (minorUnits == null || minorUnits <= 0) {
      setCreateError(t("goals.errors.validAmount"));
      return;
    }
    const goalName = name.trim();
    const goalArgs: Omit<CreateGoalParams, "masterKey"> = {
      name: goalName,
      targetAmount: { minorUnits, currency },
    };
    if (targetDate) {
      const targetTimestamp = parseLocalDateInput(targetDate);
      if (targetTimestamp == null) {
        setCreateError(t("goals.errors.validDate"));
        return;
      }
      goalArgs.targetDate = targetTimestamp;
    }
    createGoal.mutate(goalArgs, {
        onSuccess: () => {
          setDialogOpen(false);
          setName("");
          setTargetStr("");
          setTargetDate("");
          setCreateError(null);
          toast.success(t("goals.created"), { description: goalName });
        },
        onError: () => {
          const message = t("goals.errors.failed");
          setCreateError(message);
          toast.error(message);
        },
      });
  };

  if (isLoading) {
    return (
      <main aria-label={t("goals.title")} className="app-page">
        <h1 className="page-title">{t("goals.title")}</h1>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </main>
    );
  }

  const activeGoals = snapshot?.goals.filter((g) => !g.isArchived) ?? [];
  const archivedGoals = snapshot?.goals.filter((g) => g.isArchived) ?? [];

  return (
    <main aria-label={t("goals.title")} className="app-page">
      <div className="page-head">
        <div>
          <h1 className="page-title">{t("goals.title")}</h1>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" />
              {t("goals.add")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("goals.create")}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              {createError != null && (
                <p role="alert" className="text-destructive text-sm">{createError}</p>
              )}
              <div className="space-y-2">
                <Label htmlFor="goal-name">{t("goals.name")}</Label>
                <Input
                  id="goal-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("goals.namePlaceholder")}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="goal-target">{t("goals.targetAmount", { currency: snapshot?.baseCurrency ?? "XOF" })}</Label>
                <Input
                  id="goal-target"
                  type="number"
                  step={currencyInputStep(snapshot?.baseCurrency ?? "XOF")}
                  min={currencyInputStep(snapshot?.baseCurrency ?? "XOF")}
                  value={targetStr}
                  onChange={(e) => setTargetStr(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="goal-date">{t("goals.targetDate")}</Label>
                <Input
                  id="goal-date"
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={createGoal.isPending} className="w-full">
                {createGoal.isPending ? t("goals.creating") : t("goals.create")}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {activeGoals.length === 0 && archivedGoals.length === 0 && (
        <div className="empty-state">
          <Target className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p>{t("goals.empty")}</p>
        </div>
      )}

      {activeGoals.length > 0 && (
        <div className="panel-grid">
          <h2 className="text-sm font-medium text-muted-foreground">{t("goals.active")}</h2>
          {activeGoals.map((goal) => {
            const prog = snapshot?.goalProgress[goal.id];
            return (
              <Card key={goal.id} className="interactive-surface">
                <CardContent className="pt-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{goal.name}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => archiveGoal.mutate(
                        { goalId: goal.id },
                        {
                          onSuccess: () => toast.success(t("goals.archivedSuccess"), { description: goal.name }),
                          onError: () => {
                            const message = t("goals.errors.archiveFailed");
                            toast.error(message);
                          },
                        },
                      )}
                      disabled={archiveGoal.isPending}
                    >
                      <Archive className="h-4 w-4" />
                    </Button>
                  </div>
                  {prog != null && (
                    <>
                      <Progress value={Math.min(prog.percentage, 100)} />
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          {formatMoney(prog.accumulated.minorUnits, prog.accumulated.currency)} {t("goals.saved")}
                        </span>
                        <span>
                          {formatMoney(prog.target.minorUnits, prog.target.currency)} {t("goals.target")}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {Math.round(prog.percentage)}% {t("goals.complete")}
                        {goal.targetDate != null && (
                          <span> &middot; {t("goals.targetLabel")}: {new Date(goal.targetDate).toLocaleDateString(document.documentElement.lang || undefined)}</span>
                        )}
                      </p>
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {archivedGoals.length > 0 && (
        <details className="group">
          <summary className="text-sm text-muted-foreground cursor-pointer py-2 hover:text-foreground">
            {t("goals.archived")} ({archivedGoals.length})
          </summary>
          <div className="space-y-2 mt-2">
            {archivedGoals.map((goal) => (
              <Card key={goal.id} className="opacity-60">
                <CardContent className="py-2 flex items-center justify-between">
                  <span className="text-sm">{goal.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {t("goals.targetLabel")}: {formatMoney(goal.targetAmount.minorUnits, goal.targetAmount.currency)}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        </details>
      )}
    </main>
  );
}
