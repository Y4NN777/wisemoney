import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * Everything Home shows beyond the first viewport lives under this fold. The content
 * mounts only while open, so charts do not lay out on first paint and the transaction
 * list inside never duplicates the recent-movement rows for assistive tech.
 */
export default function HomeFold({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <section aria-label={t("dashboard.fold.aria")}>
      <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)} className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset">
          {t(open ? "dashboard.fold.less" : "dashboard.fold.more")}
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        {open && <div className="mt-4 space-y-4">{children}</div>}
      </details>
    </section>
  );
}
