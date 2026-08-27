import { Languages } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Select, SelectContent, SelectItem, SelectTrigger } from "./ui/select.tsx";

type LanguageSwitcherProps = {
  compact?: boolean;
};

const languages = [
  { code: "en", labelKey: "language.english", shortLabel: "EN" },
  { code: "fr", labelKey: "language.french", shortLabel: "FR" },
] as const;

export default function LanguageSwitcher({ compact = false }: LanguageSwitcherProps) {
  const { i18n, t } = useTranslation();
  const resolvedLanguage = i18n.resolvedLanguage ?? i18n.language ?? "en";
  const currentLanguage = resolvedLanguage.startsWith("fr") ? "fr" : "en";

  useEffect(() => {
    document.documentElement.lang = currentLanguage;
  }, [currentLanguage]);

  const changeLanguage = (language: string) => {
    void i18n.changeLanguage(language);
  };

  if (compact) {
    return (
      <Select value={currentLanguage} onValueChange={changeLanguage}>
        <SelectTrigger className="h-9 w-[76px] gap-1 px-2 shadow-none" aria-label={t("language.choose")}>
          <span className="flex items-center gap-1.5">
            <Languages className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="text-xs font-semibold uppercase">{currentLanguage}</span>
          </span>
        </SelectTrigger>
        <SelectContent align="end">
          {languages.map((language) => (
            <SelectItem key={language.code} value={language.code}>{t(language.labelKey)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <div
      className="inline-flex items-center gap-1 rounded-md border border-border bg-card p-1"
      role="group"
      aria-label={t("language.choose")}
    >
      <Languages className="mx-1 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      {languages.map((language) => (
        <button
          key={language.code}
          type="button"
          onClick={() => changeLanguage(language.code)}
          className={`min-h-8 rounded px-2 text-xs font-semibold transition-colors ${
            currentLanguage === language.code
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          }`}
          aria-pressed={currentLanguage === language.code}
          aria-label={t(language.labelKey)}
        >
          {t(language.labelKey)}
        </button>
      ))}
    </div>
  );
}
