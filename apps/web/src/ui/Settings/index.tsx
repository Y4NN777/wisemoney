import ExportImportSection from "../ExportImport/index.tsx";
import BYOKeySettings from "../BYOKeySettings/index.tsx";
import DevicesSection from "./DevicesSection.tsx";
import CurrencySection from "./CurrencySection.tsx";
import { Separator } from "../../components/ui/separator.tsx";
import { useTranslation } from "react-i18next";

export default function Settings() {
  const { t } = useTranslation();
  return (
    <main aria-label={t("settings.title")} className="app-page">
      <div className="page-head">
        <div>
          <p className="page-kicker">{t("settings.system")}</p>
          <h1 className="page-title">{t("settings.title")}</h1>
        </div>
      </div>

      <section aria-label={t("settings.devices.title")} className="motion-enter">
        <DevicesSection />
      </section>

      <Separator />

      <section aria-label={t("settings.currency.title")} className="motion-enter">
        <CurrencySection />
      </section>

      <Separator />

      <section aria-label={t("exportImport.export.title")} className="motion-enter">
        <ExportImportSection />
      </section>

      <Separator />

      <section aria-label={t("byoKey.title")} className="motion-enter">
        <BYOKeySettings />
      </section>
    </main>
  );
}
