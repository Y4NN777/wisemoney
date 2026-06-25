import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card.tsx";
import { Badge } from "../../components/ui/badge.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Monitor, Smartphone, Laptop, Globe, Clock, LogOut } from "lucide-react";
import { getSessionStatus } from "../../auth/session.ts";
import { isEdgeConfigured } from "../../lib/capabilities.ts";
import { useTranslation } from "react-i18next";

type DeviceInfo = {
  userAgent: string;
  platform: string;
  language: string;
  vendor: string;
  viewport: string;
};

function detectDevice(): DeviceInfo {
  const vp = typeof window !== "undefined"
    ? `${window.innerWidth}x${window.innerHeight}`
    : "unknown";

  return {
    userAgent: navigator.userAgent ?? "unknown",
    platform: navigator.platform ?? "unknown",
    language: navigator.language ?? "unknown",
    vendor: navigator.vendor ?? "unknown",
    viewport: vp,
  };
}

function deviceIcon(platform: string) {
  const lower = platform.toLowerCase();
  if (/android|iphone|ipad|ipod/i.test(lower)) return <Smartphone className="h-5 w-5" />;
  if (/mac|win|linux/i.test(lower)) return <Laptop className="h-5 w-5" />;
  return <Monitor className="h-5 w-5" />;
}

function browserName(ua: string): string {
  if (/Edg/i.test(ua)) return "Edge";
  if (/Chrome/i.test(ua)) return "Chrome";
  if (/Firefox/i.test(ua)) return "Firefox";
  if (/Safari/i.test(ua)) return "Safari";
  return "Unknown";
}

export default function DevicesSection() {
  const { t } = useTranslation();
  const [device] = useState<DeviceInfo>(detectDevice);
  const [sessionStatus, setSessionStatus] = useState(getSessionStatus());
  const [now] = useState(() => new Date().toLocaleString());

  useEffect(() => {
    const unsub = () => {
      // subscribe to store changes
    };
    // Poll session status on mount
    const interval = setInterval(() => {
      setSessionStatus(getSessionStatus());
    }, 5000);
    return () => {
      clearInterval(interval);
      unsub();
    };
  }, []);

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
          <Monitor className="h-5 w-5" />
          {t("settings.devices.title")}
        </CardTitle>
        <CardDescription>
          {t("settings.devices.description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="interactive-surface flex items-center justify-between rounded-lg border border-border bg-accent/45 p-3">
          <div className="flex items-center gap-3">
            {deviceIcon(device.platform)}
            <div>
              <p className="text-sm font-medium">
                {browserName(device.userAgent)} — {device.platform}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("settings.devices.language")}: {device.language} &middot; {device.viewport}
              </p>
            </div>
          </div>
          <Badge variant={isAuthenticated ? "default" : "secondary"}>
            {statusLabel}
          </Badge>
        </div>

        {!edgeConfigured && (
          <div className="rounded-lg border border-border bg-accent/50 p-3 text-sm text-muted-foreground">
            {t("settings.devices.localOnlyMessage")}
          </div>
        )}

        <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
          <div className="flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5" />
            <span>{t("settings.devices.language")}: {device.language}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            <span>{t("settings.devices.session")}: {now}</span>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="w-full gap-2 text-destructive hover:text-destructive"
          disabled={!isAuthenticated}
          onClick={() => {
            void import("../../auth/session.ts").then((mod) =>
              mod.logout().then(() => {
                window.location.reload();
              })
            );
          }}
        >
          <LogOut className="h-4 w-4" />
          {t("settings.devices.signOut")}
        </Button>
      </CardContent>
    </Card>
  );
}
