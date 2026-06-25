import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { BookOpenCheck, CheckCircle2, HelpCircle, LayoutDashboard, MessageSquare, PlusCircle, ClipboardList, Settings as SettingsIcon } from "lucide-react";
import Logo from "../components/Logo.tsx";
import { Button } from "../components/ui/button.tsx";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "../components/ui/sheet.tsx";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/capture", label: "Capture", icon: PlusCircle, exact: false },
  { to: "/assistant", label: "Assistant", icon: MessageSquare, exact: false },
  { to: "/planning", label: "Planning", icon: ClipboardList, exact: false },
  { to: "/settings", label: "Settings", icon: SettingsIcon, exact: false },
] as const;

const journeySteps = [
  { title: "Create accounts", body: "Add cash, mobile money, bank, or card accounts from Capture > Manage.", to: "/capture" },
  { title: "Record money movement", body: "Capture income, expenses, transfers, and goal contributions offline.", to: "/capture" },
  { title: "Plan the month", body: "Create budgets, goals, and recurring items to make the dashboard useful.", to: "/planning" },
  { title: "Review the dashboard", body: "Track cash flow, spending mix, alerts, and upcoming recurring payments.", to: "/" },
  { title: "Configure optional services", body: "Add AI provider keys or cloud sync only when you want those features.", to: "/settings" },
] as const;

export const Route = createRootRoute({
  component: () => (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-40 shrink-0 border-b border-border bg-background/88 backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-4 md:px-5">
          <Link to="/" className="flex items-center gap-3">
            <Logo className="h-7 w-auto" />
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.exact }}
                className="interactive-surface flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground"
                activeProps={{ className: "bg-ocean-wash text-ocean-dark shadow-sm" }}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="h-7 w-7 md:hidden" aria-hidden="true" />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 pb-20 pt-4 md:px-6 md:pb-8 md:pt-6">
        <div className="mx-auto w-full max-w-7xl">
          <Outlet />
        </div>
      </main>

      <HelpCenter />

      {/* Mobile bottom nav */}
      <nav
        aria-label="Primary navigation"
        className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/94 shadow-[0_-8px_24px_rgba(16,24,32,0.08)] backdrop-blur-xl md:hidden"
        style={{ paddingBottom: "var(--safe-area-bottom)" }}
      >
        <div className="mx-auto flex h-16 max-w-lg items-center justify-around">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.exact }}
              className="flex h-full min-w-16 flex-col items-center justify-center gap-0.5 rounded-md px-2 text-muted-foreground transition-[background-color,color,transform] duration-200 active:scale-95"
              activeProps={{ className: "text-ocean-dark bg-ocean-wash/80" }}
            >
              <item.icon className="h-5 w-5" />
              <span className="text-[10px] leading-tight font-medium">
                {item.label}
              </span>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  ),
});

function HelpCenter() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          type="button"
          size="icon"
          className="fixed bottom-20 right-4 z-40 h-11 w-11 rounded-full shadow-lg md:bottom-6"
          aria-label="Open help center"
        >
          <HelpCircle className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-[92vw] max-w-md flex-col overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <BookOpenCheck className="h-5 w-5 text-ocean-primary" />
            Help Center
          </SheetTitle>
          <SheetDescription>
            Follow the setup journey at your pace. WiseMoney works locally first; AI and sync are optional.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-5 space-y-3">
          {journeySteps.map((step, index) => (
            <SheetClose key={step.title} asChild>
              <Link
                to={step.to}
                className="interactive-surface block rounded-lg border border-border bg-card p-3"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-ocean-wash text-sm font-semibold text-ocean-dark tabular-nums">
                    {String(index + 1).padStart(2, "0")}
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{step.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{step.body}</p>
                  </div>
                </div>
              </Link>
            </SheetClose>
          ))}
        </div>

        <div className="mt-5 rounded-lg border border-border bg-accent/55 p-3">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ocean-primary" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Install the PWA from the landing page or browser menu before relying on it offline.
            </p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
