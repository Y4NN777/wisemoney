import { useState, type FormEvent } from "react";
import { useFinancialState, useCreateBudget, useArchiveBudget } from "../../hooks/useFinancialState.ts";
import { Card, CardContent } from "../../components/ui/card.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Input } from "../../components/ui/input.tsx";
import { Label } from "../../components/ui/label.tsx";
import { Badge } from "../../components/ui/badge.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../../components/ui/dialog.tsx";
import { Progress } from "../../components/ui/progress.tsx";
import { Skeleton } from "../../components/ui/skeleton.tsx";
import { Plus, Archive, AlertTriangle, Info } from "lucide-react";

function formatMoney(minorUnits: number, currency: string): string {
  const symbol: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", JPY: "¥" };
  const sym = symbol[currency] ?? currency + " ";
  const abs = Math.abs(minorUnits);
  return `${minorUnits < 0 ? "-" : ""}${sym}${Math.floor(abs / 100).toLocaleString()}.${(abs % 100).toString().padStart(2, "0")}`;
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}`;
}

export default function Budgets() {
  const { data: snapshot, isLoading } = useFinancialState();
  const createBudget = useCreateBudget();
  const archiveBudget = useArchiveBudget();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [budgetName, setBudgetName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [limitStr, setLimitStr] = useState("");
  const [periodMonth, setPeriodMonth] = useState(currentMonth());
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    if (!budgetName.trim()) {
      setCreateError("Enter a budget name");
      return;
    }
    const amount = parseFloat(limitStr);
    if (isNaN(amount) || amount <= 0) {
      setCreateError("Enter a valid amount");
      return;
    }
    if (!categoryId) {
      setCreateError("Select a category");
      return;
    }
    const minorUnits = Math.round(amount * 100);
    createBudget.mutate(
      {
        name: budgetName.trim(),
        categoryId,
        limit: { minorUnits, currency: "USD" },
        periodMonth,
      },
      {
        onSuccess: () => {
          setDialogOpen(false);
          setBudgetName("");
          setCategoryId("");
          setLimitStr("");
          setCreateError(null);
        },
        onError: (err) => {
          setCreateError(err instanceof Error ? err.message : "Failed to create budget");
        },
      }
    );
  };

  if (isLoading) {
    return (
      <main aria-label="Budgets" className="app-page">
        <h1 className="page-title">Budgets</h1>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </main>
    );
  }

  const categories = snapshot?.categories.filter((c) => !c.isSystemDefault) ?? [];
  const activeBudgets = snapshot?.budgets.filter((b) => !b.isArchived) ?? [];
  const archivedBudgets = snapshot?.budgets.filter((b) => b.isArchived) ?? [];

  return (
    <main aria-label="Budgets" className="app-page">
      <div className="page-head">
        <div>
          <p className="page-kicker">Planning</p>
          <h1 className="page-title">Budgets</h1>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Add Budget
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Budget</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              {createError != null && (
                <p role="alert" className="text-destructive text-sm">{createError}</p>
              )}
              <div className="space-y-2">
                <Label htmlFor="budget-name">Name</Label>
                <Input
                  id="budget-name"
                  placeholder="e.g. Monthly Groceries"
                  value={budgetName}
                  onChange={(e) => setBudgetName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="budget-category">Category</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger id="budget-category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.length === 0 ? (
                      <SelectItem value="__no_categories__" disabled>No categories yet. Create one in Manage.</SelectItem>
                    ) : (
                      categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="budget-limit">Monthly Limit ($)</Label>
                <Input
                  id="budget-limit"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={limitStr}
                  onChange={(e) => setLimitStr(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="budget-period">Period (YYYY-MM)</Label>
                <Input
                  id="budget-period"
                  type="month"
                  value={periodMonth}
                  onChange={(e) => setPeriodMonth(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" disabled={createBudget.isPending} className="w-full">
                {createBudget.isPending ? "Creating…" : "Create Budget"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {activeBudgets.length === 0 && archivedBudgets.length === 0 && (
        <div className="empty-state">
          <p>No budgets yet. Create your first budget to track category spending.</p>
        </div>
      )}

      {activeBudgets.length > 0 && (
        <div className="panel-grid">
          <h2 className="text-sm font-medium text-muted-foreground">Active</h2>
          {activeBudgets.map((budget) => {
            const prog = snapshot?.budgetProgress[budget.id];
            const cat = categories.find((c) => c.id === budget.categoryId);
            const overspent = prog != null && prog.percentage > 100;
            const nearing = prog != null && prog.percentage >= 80 && !overspent;

            return (
              <Card key={budget.id} className={`interactive-surface ${overspent ? "border-destructive bg-destructive/10" : nearing ? "border-amber bg-amber-wash" : ""}`}>
                <CardContent className="pt-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="min-w-0">
                        <span className="text-sm font-medium block truncate">{budget.name}</span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-normal mt-0.5">
                          {cat?.name ?? "Unknown"}
                        </Badge>
                      </div>
                      {overspent && <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />}
                      {nearing && <Info className="h-4 w-4 text-amber-500 shrink-0" />}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => archiveBudget.mutate({ budgetId: budget.id })}
                      disabled={archiveBudget.isPending}
                    >
                      <Archive className="h-4 w-4" />
                    </Button>
                  </div>
                  {prog != null && (
                    <>
                      <Progress
                        value={Math.min(prog.percentage, 100)}
                        className={overspent ? "bg-red-200 [&>div]:bg-destructive" : nearing ? "bg-amber-200 [&>div]:bg-amber-500" : ""}
                      />
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          {formatMoney(prog.spent.minorUnits, prog.spent.currency)} spent
                        </span>
                        <span>
                          {formatMoney(prog.limit.minorUnits, prog.limit.currency)} limit
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {budget.periodMonth} &middot; {Math.round(prog.percentage)}% used
                      </p>
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {archivedBudgets.length > 0 && (
        <details className="group">
          <summary className="text-sm text-muted-foreground cursor-pointer py-2 hover:text-foreground">
            Archived ({archivedBudgets.length})
          </summary>
          <div className="space-y-2 mt-2">
            {archivedBudgets.map((budget) => {
              const cat = categories.find((c) => c.id === budget.categoryId);
              return (
                <Card key={budget.id} className="opacity-60">
                  <CardContent className="py-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-sm block truncate">{budget.name}</span>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-normal mt-0.5">
                        {cat?.name ?? "Unknown"}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">{budget.periodMonth}</span>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </details>
      )}
    </main>
  );
}
