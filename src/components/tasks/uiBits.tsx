export function TmSkeleton({ rows = 4, testId }: { rows?: number; testId?: string }) {
  return (
    <div className="space-y-2" data-testid={testId ?? 'tm-skeleton'} aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-xl bg-white/[0.06]" />
      ))}
    </div>
  );
}

export function TmEmpty({ children, testId }: { children: React.ReactNode; testId?: string }) {
  return (
    <p className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/35" data-testid={testId}>
      {children}
    </p>
  );
}

export function initials(name: string | null | undefined) {
  return (name ?? '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}
