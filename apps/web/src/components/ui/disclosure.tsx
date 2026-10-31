import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils.ts";

type DisclosureProps = {
  title: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  children: ReactNode;
};

/** A section inside a card or a page that folds from a chevron at the right of its title. */
export function Disclosure({ title, defaultOpen = false, className, children }: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  return (
    <div className={className}>
      <h3 className="text-sm font-medium">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((current) => !current)}
          className="flex min-h-11 w-full items-center justify-between gap-4 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="min-w-0">{title}</span>
          <ChevronDown
            className={cn("h-5 w-5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
            aria-hidden="true"
          />
        </button>
      </h3>
      {open && <div id={bodyId} className="mt-2">{children}</div>}
    </div>
  );
}
