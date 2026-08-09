import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card.tsx";
import { Badge } from "../../components/ui/badge.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Laptop, LockKeyhole, LogOut } from "lucide-react";
import { logout, useSessionStatus } from "../../auth/session.ts";
import { isEdgeConfigured } from "../../lib/capabilities.ts";
import { useTranslation } from "react-i18next";
import { useVaultActions } from "../../lib/masterKeyContext.ts";
import { toast } from "sonner";

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
