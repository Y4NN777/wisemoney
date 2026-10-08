/** Three dots while the first words arrive; still under reduced motion. */
export function TypingDots({ label }: { label: string }) {
  return (
    <p className="flex h-6 items-center gap-1" role="status" aria-label={label}>
      {[0, 1, 2].map((dot) => (
        <span key={dot} className="h-2 w-2 rounded-full bg-muted-foreground/60 motion-safe:animate-bounce" style={{ animationDelay: `${dot * 150}ms` }} />
      ))}
    </p>
  );
}
