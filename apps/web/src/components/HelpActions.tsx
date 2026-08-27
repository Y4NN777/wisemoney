import { Download, HelpCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { openHelp } from "../help/navigation.ts";
import { usePwaInstall } from "../pwa/install.tsx";
import { Button } from "./ui/button.tsx";

type HelpActionsProps = {
  compact?: boolean;
};

export default function HelpActions({ compact = false }: HelpActionsProps) {
  const { t } = useTranslation();
  const install = usePwaInstall();

  const handleInstall = () => {
    if (install.canPrompt) {
      void install.promptInstall().catch(() => openHelp("installation"));
      return;
    }
    openHelp("installation");
  };

  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="outline"
        size={compact ? "icon" : "sm"}
        className={compact ? "h-9 w-9" : "gap-2"}
        onClick={() => openHelp()}
        aria-label={t("helpPage.open")}
      >
        <HelpCircle className="h-4 w-4" />
        {!compact && <span className="hidden lg:inline">{t("helpPage.shortLabel")}</span>}
      </Button>
      {!install.installed && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-ocean-primary"
          onClick={handleInstall}
          aria-label={install.canPrompt ? t("helpPage.install.prompt") : t("helpPage.install.instructions")}
          title={install.canPrompt ? t("helpPage.install.prompt") : t("helpPage.install.instructions")}
        >
          <Download className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
