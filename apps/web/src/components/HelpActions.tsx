import { Download, HelpCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { openHelp } from "../help/navigation.ts";
import { usePwaInstall } from "../pwa/install.tsx";
import { Button } from "./ui/button.tsx";

type HelpActionsProps = {
  compact?: boolean;
};

/** The install action shared by the landing header and Settings: the browser prompt when it exists, the guide otherwise. */
export function useInstallAction() {
  const install = usePwaInstall();
  const run = () => {
    if (install.canPrompt) {
      void install.promptInstall().catch(() => openHelp("installation"));
      return;
    }
    openHelp("installation");
  };
  return { installed: install.installed, canPrompt: install.canPrompt, run };
}

export default function HelpActions({ compact = false }: HelpActionsProps) {
  const { t } = useTranslation();
  const install = useInstallAction();
  const handleInstall = install.run;

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size={compact ? "icon" : "sm"}
        className={compact ? "h-11 w-11 rounded-full" : "h-11 gap-2 px-3"}
        onClick={() => openHelp()}
        aria-label={t("helpPage.open")}
      >
        <HelpCircle className="h-4 w-4" />
        {!compact && <span className="hidden lg:inline">{t("helpPage.shortLabel")}</span>}
      </Button>
      {!install.installed && (
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={compact ? "h-11 w-11 rounded-full text-ocean-primary" : "h-11 w-11 text-ocean-primary"}
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
