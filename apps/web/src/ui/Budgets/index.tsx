import { useState, type FormEvent } from "react";
import { useFinancialState, useCreateBudget, useArchiveBudget } from "../../hooks/useFinancialState.ts";
import { Card, CardContent } from "../../components/ui/card.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Input } from "../../components/ui/input.tsx";
import { Label } from "../../components/ui/label.tsx";
import { Badge } from "../../components/ui/badge.tsx";
import { Select, SelectContent, SelectEmptyState, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../../components/ui/dialog.tsx";
import { Progress } from "../../components/ui/progress.tsx";
import { Skeleton } from "../../components/ui/skeleton.tsx";
import { Plus, Archive, AlertTriangle, Info } from "lucide-react";
import { toast } from "sonner";
import { currencyInputStep, formatMoney as formatMoneyValue, parseMajorUnits } from "../../types/money.ts";
import { useTranslation } from "react-i18next";

function formatMoney(minorUnits: number, currency: string): string {
  return formatMoneyValue({ minorUnits, currency });
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}`;
}

export default function Budgets() {
  const { t } = useTranslation();
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
      setCreateError(t("budgets.errors.nameRequired"));
      return;
    }
    const currency = snapshot?.baseCurrency ?? "XOF";
    const minorUnits = parseMajorUnits(limitStr, currency);
    if (minorUnits == null || minorUnits <= 0) {
      setCreateError(t("budgets.errors.validAmount"));
      return;
    }
    if (!categoryId) {
      setCreateError(t("budgets.errors.selectCategory"));
      return;
    }
    const name = budgetName.trim();
    createBudget.mutate(
      {
        name,
        categoryId,
        limit: { minorUnits, currency },
        periodMonth,
      },
      {
        onSuccess: () => {
          setDialogOpen(false);
          setBudgetName("");
          setCategoryId("");
          setLimitStr("");
          setCreateError(null);
          toast.success(t("budgets.created"), { description: name });
        },
        onError: (err) => {
          const message = err instanceof Error ? err.message : t("budgets.errors.failed");
          setCreateError(message);
          toast.error(message);
        },
      }
    );
  };

  if (isLoading) {
    return (
      <main aria-label={t("budgets.title")} className="app-page">
        <h1 className="page-title">{t("budgets.title")}</h1>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </main>
    );
  }

  const allCategories = snapshot?.categories ?? [];
  const categories = allCategories.filter((category) => !category.isArchived);
  const activeBudgets = snapshot?.budgets.filter((b) => !b.isArchived) ?? [];
  const archivedBudgets = snapshot?.budgets.filter((b) => b.isArchived) ?? [];

  return (
    <main aria-label={t("budgets.title")} className="app-page">
      <div className="page-head">
        <div>
          <p className="page-kicker">{t("planning.title")}</p>
          <h1 className="page-title">{t("budgets.title")}</h1>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" />
              {t("budgets.add")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("budgets.create")}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              {createError != null && (
                <p role="alert" className="text-destructive text-sm">{createError}</p>
              )}
              <div className="space-y-2">
                <Label htmlFor="budget-name">{t("budgets.name")}</Label>
                <Input
                  id="budget-name"
                  placeholder={t("budgets.namePlaceholder")}
                  value={budgetName}
                  onChange={(e) => setBudgetName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="budget-category">{t("budgets.category")}</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger id="budget-category">
                    <SelectValue placeholder={t("budgets.categoryPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.length === 0 ? (
                      <SelectEmptyState>{t("common.noCategories")}</SelectEmptyState>
                    ) : (
                      categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="budget-limit">{t("budgets.monthlyLimit", { currency: snapshot?.baseCurrency ?? "XOF" })}</Label>
                <Input
                  id="budget-limit"
                  type="number"
                  step={currencyInputStep(snapshot?.baseCurrency ?? "XOF")}
                  min={currencyInputStep(snapshot?.baseCurrency ?? "XOF")}
                  value={limitStr}
                  onChange={(e) => setLimitStr(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="budget-period">{t("budgets.period")}</Label>
                <Input
                  id="budget-period"
                  type="month"
                  value={periodMonth}
                  onChange={(e) => setPeriodMonth(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" disabled={createBudget.isPending} className="w-full">
                {createBudget.isPending ? t("budgets.creating") : t("budgets.create")}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {activeBudgets.length === 0 && archivedBudgets.length === 0 && (
        <div className="empty-state">
          <p>{t("budgets.empty")}</p>
        </div>
      )}

      {activeBudgets.length > 0 && (
        <div className="panel-grid">
          <h2 className="text-sm font-medium text-muted-foreground">{t("budgets.active")}</h2>
          {activeBudgets.map((budget) => {
            const prog = snapshot?.budgetProgress[budget.id];
            const cat = allCategories.find((c) => c.id === budget.categoryId);
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
                          {cat?.name ?? t("budgets.unknown")}
                        </Badge>
                      </div>
                      {overspent && <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />}
                      {nearing && <Info className="h-4 w-4 text-amber-500 shrink-0" />}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => archiveBudget.mutate(
                        { budgetId: budget.id },
                        {
                          onSuccess: () => toast.success(t("budgets.archivedSuccess"), { description: budget.name }),
                          onError: (err) => {
                            const message = err instanceof Error ? err.message : t("budgets.errors.archiveFailed");
                            toast.error(message);
                          },
                        },
                      )}
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
                          {formatMoney(prog.spent.minorUnits, prog.spent.currency)} {t("budgets.spent")}
                        </span>
                        <span>
                          {formatMoney(prog.limit.minorUnits, prog.limit.currency)} {t("budgets.limit")}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {budget.periodMonth} &middot; {Math.round(prog.percentage)}% {t("budgets.used")}
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
            {t("budgets.archived")} ({archivedBudgets.length})
          </summary>
          <div className="space-y-2 mt-2">
            {archivedBudgets.map((budget) => {
              const cat = allCategories.find((c) => c.id === budget.categoryId);
              return (
                <Card key={budget.id} className="opacity-60">
                  <CardContent className="py-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-sm block truncate">{budget.name}</span>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-normal mt-0.5">
                        {cat?.name ?? t("budgets.unknown")}
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
