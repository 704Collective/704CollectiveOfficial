'use client';

import { cn } from '@/lib/utils';

export type SubscriptionVisualKind =
  | 'active'
  | 'inactive'
  | 'canceled'
  | 'past_due'
  | 'trialing'
  | 'paused'
  | 'deactivated';

/** Map DB / Stripe-ish status + soft-delete to a display kind for dots & labels. */
export function resolveSubscriptionVisualKind(
  subscriptionStatus: string | null | undefined,
  options?: { deletedAt?: string | null; subscriptionDeactivated?: boolean }
): SubscriptionVisualKind {
  if (options?.deletedAt) return 'deactivated';
  if (options?.subscriptionDeactivated || subscriptionStatus === 'deactivated') return 'deactivated';
  const s = (subscriptionStatus || 'inactive').toLowerCase();
  if (s === 'active') return 'active';
  if (s === 'canceled' || s === 'cancelled') return 'canceled';
  if (s === 'past_due') return 'past_due';
  if (s === 'trialing') return 'trialing';
  if (s === 'paused') return 'paused';
  return 'inactive';
}

const DOT_LABEL: Record<
  SubscriptionVisualKind,
  { dotClass: string; label: string }
> = {
  active: { dotClass: 'bg-green-500', label: 'Active' },
  inactive: { dotClass: 'bg-muted-foreground/50', label: 'Inactive' },
  canceled: { dotClass: 'bg-orange-500', label: 'Canceled' },
  past_due: { dotClass: 'bg-yellow-500', label: 'Past due' },
  trialing: { dotClass: 'bg-blue-500', label: 'Trial' },
  paused: { dotClass: 'bg-muted-foreground/50', label: 'Paused' },
  deactivated: { dotClass: 'bg-destructive', label: 'Deactivated' },
};

/** 8×8 dot + text label (reference portal). */
export function MemberStatusDotLabel({
  kind,
  className,
}: {
  kind: SubscriptionVisualKind;
  className?: string;
}) {
  const cfg = DOT_LABEL[kind];
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span className={cn('w-2 h-2 rounded-full shrink-0', cfg.dotClass)} aria-hidden />
      <span className="text-sm capitalize text-foreground">
        {cfg.label}
      </span>
    </span>
  );
}

/** Pill for cards / profile panels (default dark surface). */
export function MemberStatusPill({
  kind,
  variant = 'default',
  className,
}: {
  kind: SubscriptionVisualKind;
  variant?: 'default' | 'slideInPanel';
  className?: string;
}) {
  if (kind === 'deactivated') {
    return (
      <span className={cn('px-3 py-1 rounded-full text-sm bg-red-500/10 text-red-500', className)}>
        Deactivated
      </span>
    );
  }
  if (kind === 'active') {
    if (variant === 'slideInPanel') {
      return (
        <span className={cn('px-3 py-1 rounded-full text-sm bg-primary text-primary-foreground', className)}>
          Active
        </span>
      );
    }
    return (
      <span className={cn('px-3 py-1 rounded-full text-sm bg-green-500/10 text-green-500', className)}>
        Active
      </span>
    );
  }
  if (kind === 'canceled') {
    return (
      <span className={cn('px-3 py-1 rounded-full text-sm bg-yellow-500/10 text-yellow-500', className)}>
        Canceling
      </span>
    );
  }
  const label = DOT_LABEL[kind].label;
  return (
    <span className={cn('px-3 py-1 rounded-full text-sm bg-muted text-muted-foreground', className)}>
      {label}
    </span>
  );
}
