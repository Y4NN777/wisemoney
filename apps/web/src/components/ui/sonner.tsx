import { Toaster as Sonner } from "sonner";
import type { ComponentProps, CSSProperties } from "react";
import { useTheme } from "../../theme/ThemeProvider.tsx";

type ToasterProps = ComponentProps<typeof Sonner>;

/**
 * Toasts follow the app's theme and surfaces: card background, foreground text, border. The action
 * ("Annuler") is restyled as the app's blue text action in index.css, outside any cascade layer,
 * because the library injects its own unlayered styles.
 */
function Toaster({ ...props }: ToasterProps) {
  const { resolvedTheme } = useTheme();
  return (
    <Sonner
      theme={resolvedTheme}
      className="toaster group"
      style={{ "--normal-bg": "var(--card)", "--normal-text": "var(--foreground)", "--normal-border": "var(--border)" } as CSSProperties}
      {...props}
    />
  );
}

export { Toaster };
