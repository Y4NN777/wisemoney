import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { LayoutDashboard, MessageSquare, PlusCircle, ClipboardList, Settings as SettingsIcon } from "lucide-react";
import Logo from "../components/Logo.tsx";
import HelpActions from "../components/HelpActions.tsx";
import LanguageSwitcher from "../components/LanguageSwitcher.tsx";
import { useTranslation } from "react-i18next";

const navItems = [
  { to: "/", labelKey: "nav.dashboard", icon: LayoutDashboard, exact: true },
  { to: "/capture", labelKey: "nav.capture", icon: PlusCircle, exact: false },
  { to: "/assistant", labelKey: "nav.assistant", icon: MessageSquare, exact: false },
  { to: "/planning", labelKey: "nav.planning", icon: ClipboardList, exact: false },
  { to: "/settings", labelKey: "nav.settings", icon: SettingsIcon, exact: false },
] as const;

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-40 shrink-0 border-b border-border bg-background/88 backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-4 md:px-5">
          <Link to="/" className="flex items-center gap-3">
            <Logo className="h-7 w-auto" />
          </Link>
          <nav aria-label={t("nav.mainAria")} className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.exact }}
                className="interactive-surface flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground"
                activeProps={{ className: "bg-ocean-wash text-ocean-dark shadow-sm" }}
              >
                <item.icon className="h-4 w-4" />
                {t(item.labelKey)}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <HelpActions />
            <LanguageSwitcher compact />
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 pb-20 pt-4 md:px-6 md:pb-8 md:pt-6">
        <div className="mx-auto w-full max-w-7xl">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav
        aria-label={t("nav.primaryAria")}
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
              <span className="text-[11px] leading-tight font-medium">
                {t(item.labelKey)}
              </span>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
