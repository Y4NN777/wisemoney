import { GraduationCap } from "lucide-react";
import Logo from "./Logo.tsx";

const SIZES = {
  sm: { box: "h-9 w-9", logo: "h-6 w-6", badge: "h-4 w-4 -right-0.5 -top-0.5", hat: "h-2.5 w-2.5" },
  md: { box: "h-14 w-14", logo: "h-9 w-9", badge: "h-6 w-6 -right-1 -top-1", hat: "h-3.5 w-3.5" },
} as const;

/** The WiseMoney logo with a graduation hat on its top-right corner (Y4NN, 2026-10-08). Decorative. */
export default function WiseLearnMark({ size = "md", ring = "ring-background" }: { size?: keyof typeof SIZES; ring?: string }) {
  const s = SIZES[size];
  return (
    <span className={`relative inline-flex shrink-0 items-center justify-center rounded-full bg-ocean-wash ${s.box}`} aria-hidden="true">
      <Logo variant="icon" className={s.logo} />
      <span className={`absolute flex items-center justify-center rounded-full bg-ocean-primary text-white ring-2 ${ring} ${s.badge}`}>
        <GraduationCap className={s.hat} />
      </span>
    </span>
  );
}
