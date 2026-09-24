import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card.tsx";
import { Badge } from "../../components/ui/badge.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Input } from "../../components/ui/input.tsx";
import { Label } from "../../components/ui/label.tsx";
import { Fingerprint, Laptop, LockKeyhole, LogOut } from "lucide-react";
import { logout, useSessionStatus } from "../../auth/session.ts";
import { isEdgeConfigured } from "../../lib/capabilities.ts";
import { useTranslation } from "react-i18next";
import { useVaultActions } from "../../lib/masterKeyContext.ts";
import { toast } from "sonner";
import {
  disableWebAuthnUnlock,
  enableWebAuthnUnlock,
  hasWebAuthnUnlock,
  isWebAuthnAvailable,
} from "../../crypto/keyManagement.ts";
import { DEVICE_UNLOCK_QUERY_KEY } from "../../components/DeviceUnlockOffer/index.tsx";

export default function DevicesSection() {
  const { t } = useTranslation();
  const { lockVault } = useVaultActions();
  const sessionStatus = useSessionStatus();

  const isAuthenticated = sessionStatus === "authenticated";
  const edgeConfigured = isEdgeConfigured();
  const statusLabel = !edgeConfigured
    ? t("settings.devices.localOnly")
    : isAuthenticated
      ? t("settings.devices.onlineReady")
      : t("settings.devices.active");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Laptop className="h-5 w-5" />
          {t("settings.devices.title")}
        </CardTitle>
        <CardDescription>
          {t("settings.devices.description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border border-border bg-accent/45 p-3">
          <p className="text-sm font-medium">{t("settings.devices.thisDevice")}</p>
          <Badge variant={isAuthenticated ? "default" : "secondary"}>
            {statusLabel}
          </Badge>
        </div>

        {!edgeConfigured && (
          <div className="rounded-lg border border-border bg-accent/50 p-3 text-sm text-muted-foreground">
            {t("settings.devices.localOnlyMessage")}
          </div>
        )}

        <DeviceUnlockRow />

        <Button variant="outline" size="sm" className="w-full gap-2" onClick={lockVault}>
          <LockKeyhole className="h-4 w-4" />
          {t("settings.devices.lock")}
        </Button>

        {edgeConfigured && (
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2 text-destructive hover:text-destructive"
            disabled={!isAuthenticated}
            onClick={() => {
              void logout()
                .then(() => window.location.reload())
                .catch(() => {
                  toast.error(t("settings.devices.signOutFailed"));
                });
            }}
          >
            <LogOut className="h-4 w-4" />
            {t("settings.devices.signOut")}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Device unlock is added after setup, never during it: the wrap needs the raw
 * master-key bytes, which only a fresh passphrase derivation can provide
 * (see enableWebAuthnUnlock), so turning it on asks for the passphrase once.
 */
function DeviceUnlockRow() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const deviceUnlockQuery = useQuery({ queryKey: DEVICE_UNLOCK_QUERY_KEY, queryFn: hasWebAuthnUnlock });
  const [passphrase, setPassphrase] = useState("");
  const [enabling, setEnabling] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isWebAuthnAvailable() || deviceUnlockQuery.data == null) return null;
  const enabled = deviceUnlockQuery.data;

  const refresh = () => queryClient.invalidateQueries({ queryKey: DEVICE_UNLOCK_QUERY_KEY });

  const handleEnable = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    void (async () => {
      try {
        await enableWebAuthnUnlock(passphrase);
        setPassphrase("");
        setEnabling(false);
        toast.success(t("settings.devices.deviceUnlock.enabledToast"));
        await refresh();
      } catch (err) {
        if (err instanceof Error && err.message.includes("incorrect passphrase")) {
          setError(t("keyUnlock.unlock.errors.incorrectPassphrase"));
        } else {
          setError(t("keyUnlock.setup.deviceUnlockUnavailable"));
        }
      } finally {
        setSubmitting(false);
      }
    })();
  };

  const handleDisable = () => {
    void disableWebAuthnUnlock()
      .then(async () => {
        toast.success(t("settings.devices.deviceUnlock.disabledToast"));
        await refresh();
      })
      .catch(() => toast.error(t("settings.devices.deviceUnlock.updateFailed")));
  };

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex items-start gap-3">
        <Fingerprint className="mt-0.5 h-4 w-4 shrink-0 text-ocean-primary" />
        <div className="flex-1">
          <p className="text-sm font-medium">{t("settings.devices.deviceUnlock.title")}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {t(enabled ? "settings.devices.deviceUnlock.enabled" : "settings.devices.deviceUnlock.description")}
          </p>
        </div>
      </div>
      {enabled ? (
        <Button variant="outline" size="sm" className="w-full" onClick={handleDisable}>
          {t("settings.devices.deviceUnlock.disable")}
        </Button>
      ) : enabling ? (
        <form onSubmit={handleEnable} className="space-y-3">
          {error != null && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="space-y-2">
            <Label htmlFor="device-unlock-passphrase">{t("settings.devices.deviceUnlock.passphrase")}</Label>
            <Input
              id="device-unlock-passphrase"
              type="password"
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
              required
              autoFocus
              autoComplete="current-password"
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => { setEnabling(false); setError(null); }}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" size="sm" disabled={submitting || passphrase.length === 0}>
              {submitting ? t("settings.devices.deviceUnlock.enabling") : t("settings.devices.deviceUnlock.confirm")}
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="outline" size="sm" className="w-full" onClick={() => setEnabling(true)}>
          {t("settings.devices.deviceUnlock.enable")}
        </Button>
      )}
    </div>
  );
}
