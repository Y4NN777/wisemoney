import { useState, type FormEvent } from "react";
import { useFinancialState, useCreateRecurringItem, useRealiseRecurringOccurrence } from "../../hooks/useFinancialState.ts";
import { Card, CardContent } from "../../components/ui/card.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Input } from "../../components/ui/input.tsx";
import { Label } from "../../components/ui/label.tsx";
import { Select, SelectContent, SelectEmptyState, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../../components/ui/dialog.tsx";
import { Skeleton } from "../../components/ui/skeleton.tsx";
import { Plus, Repeat, CheckCircle2 } from "lucide-react";

function formatMoney(minorUnits: number, currency: string): string {
  const symbol: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", JPY: "¥" };
  const sym = symbol[currency] ?? currency + " ";
  const abs = Math.abs(minorUnits);
  return `${minorUnits < 0 ? "-" : ""}${sym}${Math.floor(abs / 100).toLocaleString()}.${(abs % 100).toString().padStart(2, "0")}`;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function Recurring() {
  const { data: snapshot, isLoading } = useFinancialState();
  const createItem = useCreateRecurringItem();
  const realise = useRealiseRecurringOccurrence();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [label, setLabel] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [direction, setDirection] = useState<"expense" | "income">("expense");
  const [frequency, setFrequency] = useState<"weekly" | "monthly" | "yearly">("monthly");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split("T")[0] ?? "");
  const [createError, setCreateError] = useState<string | null>(null);

  const [realiseAccountId, setRealiseAccountId] = useState<string>("");
  const [realiseDialog, setRealiseDialog] = useState<{
    itemId: string;
    categoryId: string;
    label: string;
    amount: { minorUnits: number; currency: string };
    direction: "income" | "expense";
  } | null>(null);

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    if (!label.trim()) {
      setCreateError("Label is required");
      return;
    }
    if (!categoryId) {
      setCreateError("Select a category");
      return;
    }
    const parsed = parseFloat(amountStr);
    if (isNaN(parsed) || parsed <= 0) {
      setCreateError("Enter a valid amount");
      return;
    }
    const minorUnits = Math.round(parsed * 100);

    createItem.mutate(
      {
        categoryId,
        label: label.trim(),
        amount: { minorUnits, currency: "USD" },
        direction,
        frequency,
        startDate: new Date(startDate).getTime(),
      },
      {
        onSuccess: () => {
          setDialogOpen(false);
          setCategoryId("");
          setLabel("");
          setAmountStr("");
          setCreateError(null);
        },
        onError: (err) => {
          setCreateError(err instanceof Error ? err.message : "Failed to create recurring item");
        },
      }
    );
  };

  const handleRealise = (fallbackCategoryId: string) => {
    if (realiseDialog == null) return;
    if (!realiseAccountId) return;

    realise.mutate(
      {
        itemId: realiseDialog.itemId,
        accountId: realiseAccountId,
        categoryId: fallbackCategoryId,
        amount: realiseDialog.amount,
        direction: realiseDialog.direction,
        label: realiseDialog.label,
      },
      {
        onSuccess: () => {
          setRealiseDialog(null);
          setRealiseAccountId("");
        },
      }
    );
  };

  if (isLoading) {
    return (
      <main aria-label="Recurring transactions" className="app-page">
        <h1 className="page-title">Recurring</h1>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </main>
    );
  }

  const categories = snapshot?.categories.filter((c) => !c.isSystemDefault) ?? [];
  const accounts = snapshot?.accounts.filter((a) => a.isActive) ?? [];
  const recurringItems = snapshot?.recurringItems ?? [];

  return (
    <main aria-label="Recurring transactions" className="app-page">
      <div className="page-head">
        <div>
          <p className="page-kicker">Planning</p>
          <h1 className="page-title">Recurring</h1>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Add Recurring
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Recurring Item</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              {createError != null && (
                <p role="alert" className="text-destructive text-sm">{createError}</p>
              )}
              <div className="space-y-2">
                <Label htmlFor="recur-label">Label</Label>
                <Input
                  id="recur-label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g., Rent, Salary"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="recur-category">Category</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger id="recur-category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.length === 0 ? (
                      <SelectEmptyState>No categories yet. Create one in Manage.</SelectEmptyState>
                    ) : (
                      categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="recur-amount">Amount ($)</Label>
                <Input
                  id="recur-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="recur-direction">Direction</Label>
                  <Select value={direction} onValueChange={(v) => setDirection(v as "expense" | "income")}>
                    <SelectTrigger id="recur-direction">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="expense">Expense</SelectItem>
                      <SelectItem value="income">Income</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="recur-frequency">Frequency</Label>
                  <Select value={frequency} onValueChange={(v) => setFrequency(v as "weekly" | "monthly" | "yearly")}>
                    <SelectTrigger id="recur-frequency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="yearly">Yearly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="recur-start">Start Date</Label>
                <Input
                  id="recur-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" disabled={createItem.isPending} className="w-full">
                {createItem.isPending ? "Creating…" : "Create Recurring Item"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {recurringItems.length === 0 && (
        <div className="empty-state">
          <Repeat className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p>No recurring items. Add rent, subscriptions, or salary to track predictable transactions.</p>
        </div>
      )}

      <div className="panel-grid">
        {recurringItems.map((item) => {
          const cat = categories.find((c) => c.id === item.categoryId);
          return (
            <Card key={item.id} className="interactive-surface">
              <CardContent className="pt-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {cat?.name ?? "Unknown"} &middot; {item.frequency}
                    </p>
                  </div>
                  <span className={`text-sm font-medium ${item.direction === "income" ? "text-green-600" : "text-red-500"}`}>
                    {item.direction === "income" ? "+" : "-"}
                    {formatMoney(item.amount.minorUnits, item.amount.currency)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    Started {formatDate(item.startDate)}
                    {item.lastRealised != null && <span> &middot; Last: {formatDate(item.lastRealised)}</span>}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setRealiseDialog({
                        itemId: item.id,
                        categoryId: item.categoryId,
                        label: item.label,
                        amount: item.amount,
                        direction: item.direction,
                      });
                      setRealiseAccountId(accounts[0]?.id ?? "");
                    }}
                  >
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Realise
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Realise dialog - pick account */}
      <Dialog
        open={realiseDialog != null}
        onOpenChange={(open) => {
          if (!open) {
            setRealiseDialog(null);
            setRealiseAccountId("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Realise Occurrence</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {realiseDialog != null && (
              <>
                <p className="text-sm text-muted-foreground">
                  Record this {realiseDialog.direction === "income" ? "income" : "expense"} for{" "}
                  <strong>{realiseDialog.label}</strong> ({formatMoney(realiseDialog.amount.minorUnits, realiseDialog.amount.currency)})
                </p>
                <div className="space-y-2">
                  <Label htmlFor="realise-account">Account</Label>
                  <Select value={realiseAccountId} onValueChange={setRealiseAccountId}>
                    <SelectTrigger id="realise-account">
                      <SelectValue placeholder="Select account" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.length === 0 ? (
                        <SelectEmptyState>No accounts yet. Create one in Manage.</SelectEmptyState>
                      ) : (
                        accounts.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name} ({formatMoney(a.balance.minorUnits, a.balance.currency)})
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={() => handleRealise(realiseDialog.categoryId)}
                  disabled={!realiseAccountId || realise.isPending}
                  className="w-full"
                >
                  {realise.isPending ? "Recording…" : "Record Occurrence"}
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
