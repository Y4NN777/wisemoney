import ExportImportSection from "../ExportImport/index.tsx";
import BYOKeySettings from "../BYOKeySettings/index.tsx";
import DevicesSection from "./DevicesSection.tsx";
import CurrencySection from "./CurrencySection.tsx";
import { Separator } from "../../components/ui/separator.tsx";

export default function Settings() {
  return (
    <main aria-label="Settings" className="app-page">
      <div className="page-head">
        <div>
          <p className="page-kicker">System</p>
          <h1 className="page-title">Settings</h1>
        </div>
      </div>

      <section aria-label="Device and session management" className="motion-enter">
        <DevicesSection />
      </section>

      <Separator />

      <section aria-label="Currency configuration" className="motion-enter">
        <CurrencySection />
      </section>

      <Separator />

      <section aria-label="Data export and import" className="motion-enter">
        <ExportImportSection />
      </section>

      <Separator />

      <section aria-label="AI provider configuration" className="motion-enter">
        <BYOKeySettings />
      </section>
    </main>
  );
}
