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

function formatMoney(minorUnits: number, currency: string): string {
  const symbol: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", JPY: "¥" };
  const sym = symbol[currency] ?? currency + " ";
  const abs = Math.abs(minorUnits);
  return `${minorUnits < 0 ? "-" : ""}${sym}${Math.floor(abs / 100).toLocaleString()}.${(abs % 100).toString().padStart(2, "0")}`;
}

export default function Goals() {
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
      setCreateError("Goal name is required");
      return;
    }
    const amount = parseFloat(targetStr);
    if (isNaN(amount) || amount <= 0) {
      setCreateError("Enter a valid target amount");
      return;
    }
    const minorUnits = Math.round(amount * 100);
    const goalName = name.trim();
    const goalArgs: Omit<CreateGoalParams, "masterKey"> = {
      name: goalName,
      targetAmount: { minorUnits, currency: "USD" },
    };
    if (targetDate) {
      goalArgs.targetDate = new Date(targetDate).getTime();
    }
    createGoal.mutate(goalArgs, {
        onSuccess: () => {
          setDialogOpen(false);
          setName("");
          setTargetStr("");
          setTargetDate("");
          setCreateError(null);
          toast.success("Goal created", { description: goalName });
        },
        onError: (err) => {
          const message = err instanceof Error ? err.message : "Failed to create goal";
          setCreateError(message);
          toast.error(message);
        },
      });
  };

  if (isLoading) {
    return (
      <main aria-label="Goals" className="app-page">
        <h1 className="page-title">Goals</h1>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </main>
    );
  }

  const activeGoals = snapshot?.goals.filter((g) => !g.isArchived) ?? [];
  const archivedGoals = snapshot?.goals.filter((g) => g.isArchived) ?? [];

  return (
    <main aria-label="Goals" className="app-page">
      <div className="page-head">
        <div>
          <p className="page-kicker">Planning</p>
          <h1 className="page-title">Savings Goals</h1>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Add Goal
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Savings Goal</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              {createError != null && (
                <p role="alert" className="text-destructive text-sm">{createError}</p>
              )}
              <div className="space-y-2">
                <Label htmlFor="goal-name">Goal Name</Label>
                <Input
                  id="goal-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Emergency Fund"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="goal-target">Target Amount ($)</Label>
                <Input
                  id="goal-target"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={targetStr}
                  onChange={(e) => setTargetStr(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="goal-date">Target Date (optional)</Label>
                <Input
                  id="goal-date"
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={createGoal.isPending} className="w-full">
                {createGoal.isPending ? "Creating…" : "Create Goal"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {activeGoals.length === 0 && archivedGoals.length === 0 && (
        <div className="empty-state">
          <Target className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p>No goals yet. Create a savings goal to track your progress.</p>
        </div>
      )}

      {activeGoals.length > 0 && (
        <div className="panel-grid">
          <h2 className="text-sm font-medium text-muted-foreground">Active</h2>
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
                          onSuccess: () => toast.success("Goal archived", { description: goal.name }),
                          onError: (err) => {
                            const message = err instanceof Error ? err.message : "Failed to archive goal";
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
                          {formatMoney(prog.accumulated.minorUnits, prog.accumulated.currency)} saved
                        </span>
                        <span>
                          {formatMoney(prog.target.minorUnits, prog.target.currency)} target
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {Math.round(prog.percentage)}% complete
                        {goal.targetDate != null && (
                          <span> &middot; Target: {new Date(goal.targetDate).toLocaleDateString()}</span>
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
            Archived ({archivedGoals.length})
          </summary>
          <div className="space-y-2 mt-2">
            {archivedGoals.map((goal) => (
              <Card key={goal.id} className="opacity-60">
                <CardContent className="py-2 flex items-center justify-between">
                  <span className="text-sm">{goal.name}</span>
                  <span className="text-xs text-muted-foreground">
                    Target: {formatMoney(goal.targetAmount.minorUnits, goal.targetAmount.currency)}
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
