import { useState, useEffect } from "react";
import { useMasterKey } from "../../lib/masterKeyContext.ts";
import { storeBYOKey } from "../../crypto/keyManagement.ts";
import { db } from "../../db/schema.ts";
import { Button } from "../../components/ui/button.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card.tsx";
import { Input } from "../../components/ui/input.tsx";
import { Label } from "../../components/ui/label.tsx";
import { Badge } from "../../components/ui/badge.tsx";
import { Key, Eye, EyeOff, Check, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

type ProviderInfo = {
  id: string;
  models: string;
};

const PROVIDERS: ProviderInfo[] = [
  { id: "openai", models: "GPT-4o, GPT-4o-mini" },
  { id: "gemini", models: "Gemini 3.6 Flash" },
  { id: "deepseek", models: "DeepSeek V4 Flash" },
  { id: "openrouter", models: "OpenRouter" },
];

type ProviderKeyStatus = {
  configured: boolean;
};

export default function BYOKeySettings() {
  const { t } = useTranslation();
  const masterKey = useMasterKey();
  const [keyStatus, setKeyStatus] = useState<Record<string, ProviderKeyStatus>>({});
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [visibleProviders, setVisibleProviders] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load existing key status on mount
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const status: Record<string, ProviderKeyStatus> = {};
        const records = await db.byoProviderKeys.bulkGet(PROVIDERS.map((provider) => provider.id));
        PROVIDERS.forEach((provider, index) => {
          status[provider.id] = { configured: records[index] != null };
        });
        if (active) setKeyStatus(status);
      } catch {
        if (!active) return;
        const message = t("byoKey.errors.loadFailed");
        setError(message);
        toast.error(t("byoKey.errors.loadFailed"), { description: message });
      }
    })();
    return () => {
      active = false;
    };
  }, [masterKey, t]);

  useEffect(() => {
    if (saved == null) return;
    const timer = window.setTimeout(() => setSaved(null), 2000);
    return () => window.clearTimeout(timer);
  }, [saved]);

  const handleSave = async (providerId: string) => {
    const raw = inputValues[providerId];
    if (raw == null || raw.trim().length === 0) return;
    setError(null);
    setSaved(null);
    setSaving(providerId);
    try {
      await storeBYOKey(providerId, raw.trim(), masterKey);
      setKeyStatus((prev) => ({
        ...prev,
        [providerId]: { configured: true },
      }));
      setInputValues((prev) => ({ ...prev, [providerId]: "" }));
      setSaved(providerId);
      toast.success(t("byoKey.placeholders.configured"), { description: t(`byoKey.providers.${providerId}`) });
    } catch {
      const message = t("byoKey.errors.saveFailed");
      setError(message);
      toast.error(message);
    } finally {
      setSaving(null);
    }
  };

  const configuredCount = Object.values(keyStatus).filter((s) => s.configured).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key className="h-5 w-5" />
          {t("byoKey.title")}
        </CardTitle>
        <CardDescription>
          {t("byoKey.description")}
          {configuredCount > 0 && (
            <span className="ml-1">
              <Badge variant="secondary" className="ml-1">
                {configuredCount} {t("byoKey.configured")}
              </Badge>
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error != null && (
          <div className="flex items-center gap-2 text-destructive text-sm" role="alert">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        <div className="space-y-3">
          {PROVIDERS.map((provider) => {
            const status = keyStatus[provider.id];
            const isVisible = visibleProviders.has(provider.id);
            return (
              <div
                key={provider.id}
                className="interactive-surface space-y-3 rounded-lg border border-border bg-accent/40 p-3"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{t(`byoKey.providers.${provider.id}`)}</p>
                    <p className="text-xs text-muted-foreground">
                      {provider.id === "openrouter" ? t("byoKey.openrouterModels") : provider.models}
                    </p>
                  </div>
                  {status?.configured === true && (
                    <Badge variant="outline" className="text-xs gap-1">
                      <Check className="h-3 w-3 text-green-500" />
                      {t("byoKey.configuredBadge")}
                    </Badge>
                  )}
                </div>

                <div className="flex items-end gap-2">
                  <div className="flex-1 space-y-1">
                    <Label htmlFor={`key-${provider.id}`} className="text-xs">
                      {t("byoKey.apiKey")}
                    </Label>
                    <div className="relative">
                      <Input
                        id={`key-${provider.id}`}
                        type={isVisible ? "text" : "password"}
                        value={inputValues[provider.id] ?? ""}
                        onChange={(e) =>
                          setInputValues((prev) => ({
                            ...prev,
                            [provider.id]: e.target.value,
                          }))
                        }
                        placeholder={
                          status?.configured === true
                            ? t("byoKey.placeholders.configured")
                            : t("byoKey.placeholders.enter", { provider: t(`byoKey.providers.${provider.id}`) })
                        }
                        className="pr-8"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const next = new Set(visibleProviders);
                          if (isVisible) next.delete(provider.id);
                          else next.add(provider.id);
                          setVisibleProviders(next);
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label={isVisible ? t("byoKey.hideKey") : t("byoKey.showKey")}
                      >
                        {isVisible ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => { void handleSave(provider.id); }}
                    disabled={
                      saving != null ||
                      (inputValues[provider.id] ?? "").trim().length === 0
                    }
                  >
                    {saving === provider.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : saved === provider.id ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      t("byoKey.save")
                    )}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground">
          {t("byoKey.footnote")}
        </p>
      </CardContent>
    </Card>
  );
}
