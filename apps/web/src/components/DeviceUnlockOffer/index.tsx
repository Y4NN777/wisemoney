import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Fingerprint } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/button.tsx";
import { hasWebAuthnUnlock, isWebAuthnAvailable } from "../../crypto/keyManagement.ts";
import { dismissDeviceUnlockOffer, shouldOfferDeviceUnlock } from "../../lib/deviceUnlockOffer.ts";

export const DEVICE_UNLOCK_QUERY_KEY = ["keyMeta", "deviceUnlock"] as const;

/** One quiet Home card, from the second passphrase unlock, pointing to Settings › Security. */
export default function DeviceUnlockOffer() {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(false);
  const deviceUnlockQuery = useQuery({ queryKey: DEVICE_UNLOCK_QUERY_KEY, queryFn: hasWebAuthnUnlock });

  if (dismissed || deviceUnlockQuery.data == null) return null;
  if (!shouldOfferDeviceUnlock({ webAuthnAvailable: isWebAuthnAvailable(), hasDeviceUnlock: deviceUnlockQuery.data })) {
    return null;
  }

  return (
    <section
      aria-label={t("dashboard.deviceUnlockOffer.title")}
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-ocean-wash text-ocean-primary">
          <Fingerprint className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-sm font-semibold">{t("dashboard.deviceUnlockOffer.title")}</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t("dashboard.deviceUnlockOffer.body")}</p>
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            dismissDeviceUnlockOffer();
            setDismissed(true);
          }}
        >
          {t("dashboard.deviceUnlockOffer.dismiss")}
        </Button>
        <Button asChild size="sm">
          <Link to="/settings">{t("dashboard.deviceUnlockOffer.action")}</Link>
        </Button>
      </div>
    </section>
  );
}
