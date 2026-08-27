import { Moon, MonitorCog, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTheme } from "../theme/ThemeProvider.tsx";
import type { ThemePreference } from "../theme/theme.ts";

const options: Array<{ value: ThemePreference; icon: typeof Sun }> = [
  { value: "system", icon: MonitorCog },
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
];

export default function ThemeSettings() {
  const { t } = useTranslation();
  const { preference, setPreference } = useTheme();
  return (
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t("settings.appearance.choice")}>
      {options.map((option) => {
        const Icon = option.icon;
        const selected = preference === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setPreference(option.value)}
            className={`interactive-surface flex min-h-20 flex-col items-start justify-between border p-3 text-left ${selected ? "border-primary bg-ocean-wash text-ocean-dark" : "border-border bg-card text-foreground"}`}
          >
            <Icon className="h-4 w-4" />
            <span className="text-sm font-semibold">{t(`settings.appearance.options.${option.value}`)}</span>
          </button>
        );
      })}
    </div>
  );
}
