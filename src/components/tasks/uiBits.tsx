import { User } from 'lucide-react';
import { nameWords, personInitials } from '@/lib/tasks/names';

export function OwnerChip({
  name,
  className = 'h-5 w-5 text-[9px]',
}: {
  name?: string | null;
  className?: string;
}) {
  const hasName = nameWords(name).length > 0;
  return (
    <span
      title={name ?? ''}
      className={`inline-flex items-center justify-center rounded-full bg-[#2a2a2a] font-semibold text-[#C6A664] ${className}`}
    >
      {hasName ? personInitials(name) : <User className="h-3 w-3 text-white/50" aria-hidden />}
    </span>
  );
}

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

export { personInitials as initials } from '@/lib/tasks/names';
