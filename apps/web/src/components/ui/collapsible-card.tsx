import { useEffect, useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./card.tsx";
import { cn } from "@/lib/utils.ts";

type CollapsibleCardProps = {
  /** The title row; put its icon here. */
  title: ReactNode;
  /** Shown only while the card is open, so a folded card stays one line. */
  description?: ReactNode;
  /** Opens (never closes) the card, e.g. so an error inside it is not hidden. */
  forceOpen?: boolean;
  defaultOpen?: boolean;
  className?: string;
  contentClassName?: string;
  children: ReactNode;
};

/** A card whose header folds and unfolds its body from a chevron at the right corner. */
export function CollapsibleCard({
  title,
  description,
  forceOpen = false,
  defaultOpen = false,
  className,
  contentClassName,
  children,
}: CollapsibleCardProps) {
  const [open, setOpen] = useState(defaultOpen || forceOpen);
  const bodyId = useId();

  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);

  return (
    <Card className={className}>
      <CardHeader className={open ? undefined : "py-2"}>
        <CardTitle className="text-base">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => setOpen((current) => !current)}
            className="flex min-h-11 w-full items-center justify-between gap-4 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex min-w-0 items-center gap-2">{title}</span>
            <ChevronDown
              className={cn("h-5 w-5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
              aria-hidden="true"
            />
          </button>
        </CardTitle>
        {open && description != null && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      {open && (
        <CardContent id={bodyId} className={contentClassName}>
          {children}
        </CardContent>
      )}
    </Card>
  );
}
