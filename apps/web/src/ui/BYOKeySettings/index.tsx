import { useState, useEffect } from "react";
import { useMasterKey } from "../../lib/masterKeyContext.ts";
import { storeBYOKey, decryptBYOKey } from "../../crypto/keyManagement.ts";
import { Button } from "../../components/ui/button.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card.tsx";
import { Input } from "../../components/ui/input.tsx";
import { Label } from "../../components/ui/label.tsx";
import { Badge } from "../../components/ui/badge.tsx";
import { Key, Eye, EyeOff, Check, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

type ProviderInfo = {
  id: string;
  name: string;
  models: string;
};

const PROVIDERS: ProviderInfo[] = [
  { id: "openai", name: "OpenAI", models: "GPT-4o, GPT-4o-mini" },
  { id: "gemini", name: "Google Gemini", models: "Gemini 2.0 Flash" },
  { id: "nvidia_nim", name: "NVIDIA NIM", models: "Llama 3.1 405B" },
  { id: "openrouter", name: "OpenRouter", models: "Any available model" },
];

type ProviderKeyStatus = {
  configured: boolean;
  /** first few chars of the configured key for identification */
  prefix: string;
};

export default function BYOKeySettings() {
  const masterKey = useMasterKey();
  const [keyStatus, setKeyStatus] = useState<Record<string, ProviderKeyStatus>>({});
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [visibleProviders, setVisibleProviders] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load existing key status on mount
  useEffect(() => {
    void (async () => {
      const status: Record<string, ProviderKeyStatus> = {};
      for (const p of PROVIDERS) {
        try {
          const key = await decryptBYOKey(p.id, masterKey);
          status[p.id] = { configured: true, prefix: key.substring(0, 8) };
        } catch {
          status[p.id] = { configured: false, prefix: "" };
        }
      }
      setKeyStatus(status);
    })();
  }, [masterKey]);

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
        [providerId]: { configured: true, prefix: raw.trim().substring(0, 8) },
      }));
      setInputValues((prev) => ({ ...prev, [providerId]: "" }));
      setSaved(providerId);
      toast.success("Key saved", { description: PROVIDERS.find((provider) => provider.id === providerId)?.name ?? providerId });
      setTimeout(() => setSaved(null), 2000);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save key";
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
          BYO AI Provider Keys
        </CardTitle>
        <CardDescription>
          Configure your own API keys to use AI features directly.
          {configuredCount > 0 && (
            <span className="ml-1">
              <Badge variant="secondary" className="ml-1">{configuredCount} configured</Badge>
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
                    <p className="text-sm font-medium">{provider.name}</p>
                    <p className="text-xs text-muted-foreground">{provider.models}</p>
                  </div>
                  {status?.configured === true && (
                    <Badge variant="outline" className="text-xs gap-1">
                      <Check className="h-3 w-3 text-green-500" />
                      Configured
                    </Badge>
                  )}
                </div>

                <div className="flex items-end gap-2">
                  <div className="flex-1 space-y-1">
                    <Label htmlFor={`key-${provider.id}`} className="text-xs">
                      API Key
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
                            ? `····${status.prefix}····`
                            : `Enter ${provider.name} API key`
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
                        aria-label={isVisible ? "Hide key" : "Show key"}
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
                      "Save"
                    )}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground">
          Your API keys are encrypted at rest and decrypted in memory only during AI calls.
        </p>
      </CardContent>
    </Card>
  );
}
