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
  { dotClass: string; label: string; capitalize: string }
> = {
  active: { dotClass: 'bg-green-500', label: 'Active', capitalize: 'capitalize' },
  inactive: {
    dotClass: 'bg-muted-foreground/50',
    label: 'inactive',
    capitalize: 'capitalize',
  },
  canceled: { dotClass: 'bg-orange-500', label: 'Canceled', capitalize: 'capitalize' },
  past_due: { dotClass: 'bg-amber-500', label: 'Past due', capitalize: 'capitalize' },
  trialing: { dotClass: 'bg-blue-500', label: 'Trial', capitalize: 'capitalize' },
  paused: { dotClass: 'bg-muted-foreground/50', label: 'Paused', capitalize: 'capitalize' },
  deactivated: { dotClass: 'bg-red-500', label: 'Deactivated', capitalize: 'capitalize' },
};

/** 8×8 dot + 14px label (reference portal). */
export function MemberStatusDotLabel({
  kind,
  className,
}: {
  kind: SubscriptionVisualKind;
  className?: string;
}) {
  const cfg = DOT_LABEL[kind];
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span className={cn('h-2 w-2 shrink-0 rounded-full', cfg.dotClass)} aria-hidden />
      <span className={cn('text-sm', cfg.capitalize)} style={{ fontSize: '14px' }}>
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
      <span
        className={cn(
          'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
          'bg-red-500/10 text-red-500 border border-red-500/25',
          className
        )}
        style={{ fontSize: '12px', fontWeight: 600, borderRadius: 9999, padding: '2px 10px' }}
      >
        Deactivated
      </span>
    );
  }
  if (kind === 'active') {
    if (variant === 'slideInPanel') {
      return (
        <span
          className={cn('inline-flex items-center rounded-full text-black', className)}
          style={{
            background: 'rgb(255,255,255)',
            color: 'rgb(0,0,0)',
            borderRadius: 9999,
            fontSize: '12px',
            fontWeight: 600,
            padding: '2px 10px',
          }}
        >
          Active
        </span>
      );
    }
    return (
      <span
        className={cn('inline-flex items-center rounded-full', className)}
        style={{
          background: 'rgba(34,197,94,0.1)',
          color: 'rgb(34,197,94)',
          borderRadius: 9999,
          fontSize: '12px',
          fontWeight: 600,
          padding: '2px 10px',
        }}
      >
        Active
      </span>
    );
  }
  const label = DOT_LABEL[kind].label;
  return (
    <span
      className={cn('inline-flex items-center rounded-full border border-white/10 text-muted-foreground', className)}
      style={{ fontSize: '12px', fontWeight: 600, padding: '2px 10px', borderRadius: 9999 }}
    >
      {label}
    </span>
  );
}
