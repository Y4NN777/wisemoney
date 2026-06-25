/** Reusable WiseMoney logo — full lockup or icon-only. */

type LogoProps = {
  variant?: "full" | "icon";
  className?: string;
};

export default function Logo({ variant = "full", className }: LogoProps) {
  const iconSvg = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      fill="none"
      className={className}
      aria-label="WiseMoney icon"
    >
      <rect x="2" y="2" width="96" height="96" rx="16" fill="#0077b6" />
      <path
        d="M22 70 C22 70 28 30 38 30 C44 30 46 50 50 55 C54 50 56 30 62 30 C72 30 78 70 78 70"
        stroke="white"
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M18 75 Q35 67 50 74 Q65 81 82 72"
        stroke="rgba(255,255,255,0.4)"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );

  const fullSvg = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 300 106"
      fill="none"
      className={className}
      aria-label="WiseMoney logo"
    >
      <defs>
        <linearGradient id="logo-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#023e8a" />
          <stop offset="50%" stopColor="#0077b6" />
          <stop offset="100%" stopColor="#00b4d8" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="96" height="96" rx="16" fill="url(#logo-grad)" />
      <path
        d="M22 70 C22 70 28 30 38 30 C44 30 46 50 50 55 C54 50 56 30 62 30 C72 30 78 70 78 70"
        stroke="white"
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M18 75 Q35 67 50 74 Q65 81 82 72"
        stroke="rgba(255,255,255,0.4)"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
      <text
        x="108" y="54"
        fontFamily="'Clash Display','Satoshi',ui-sans-serif,system-ui,sans-serif"
        fontSize="34"
        fontWeight="600"
        letterSpacing="-0.02em"
        fill="#0077b6"
      >
        Wise<tspan fill="#00b4d8">Money</tspan>
      </text>
    </svg>
  );

  return variant === "icon" ? iconSvg : fullSvg;
}
