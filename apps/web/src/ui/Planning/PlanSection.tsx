import { Link } from "@tanstack/react-router";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatMoney } from "../../types/money.ts";
import type { PlanRow, PlanSection as PlanSectionModel } from "./planSections.ts";

/**
 * One Plan section: a header row that is also the link into the full page (its accessible
 * name is "<label> <status>", the same as the former hub tile), and, when the section has
 * anything, an open-by-default details list. An empty section is just the quiet header row.
 * The label is deliberately not a heading: the sub-pages own the page headings.
 */
export default function PlanSection({
  section,
  label,
  status,
  icon: Icon,
}: {
  section: PlanSectionModel;
  label: string;
  status: string;
  icon: LucideIcon;
}) {
  const { t, i18n } = useTranslation();
  const labelId = `plan-${section.id}-label`;
  const formatDue = (timestamp: number) => new Date(timestamp).toLocaleDateString(i18n.language, { month: "short", day: "numeric" });
  const rowMeta = (row: PlanRow): string => {
    const parts: string[] = [];
    if (row.detailKey != null) parts.push(t(row.detailKey));
    if (row.dueAt != null) parts.push(formatDue(row.dueAt));
    return parts.join(" · ");
  };
  return (
    <section aria-labelledby={labelId} className="rounded-lg border border-border bg-card">
      <div className="flex min-h-14 items-center gap-3 px-4 py-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-ocean-wash text-ocean-primary">
          <Icon className="h-5 w-5" />
        </span>
        <Link to={section.to} className="interactive-surface min-w-0 flex-1 rounded-md">
          <span id={labelId} className="block text-sm font-semibold">{label}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">{status}</span>
        </Link>
        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </div>
      {section.count > 0 && (
        <details open className="border-t border-border">
          <summary className="cursor-pointer list-none px-4 py-2 text-xs font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset">
            {t("planning.section.toggle", { count: section.count })}
          </summary>
          <ul className="divide-y divide-border">
            {section.rows.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 px-4 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm">{row.label}</span>
                  {rowMeta(row) !== "" && <span className="block text-xs text-muted-foreground">{rowMeta(row)}</span>}
                </span>
                {row.amount != null && (
                  <span className="shrink-0 text-sm tabular-nums">
                    {formatMoney(row.amount)}
                    {row.secondary != null && <span className="text-muted-foreground"> / {formatMoney(row.secondary)}</span>}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {section.count > section.rows.length && (
            <Link to={section.to} className="interactive-surface block px-4 py-2 text-xs font-medium text-ocean-primary">
              {t("planning.section.seeAll", { count: section.count })}
            </Link>
          )}
        </details>
      )}
    </section>
  );
}
