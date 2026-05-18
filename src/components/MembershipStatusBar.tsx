'use client';

import Link from 'next/link';
import { SOCIAL_TIER } from '@/lib/pricing';
import { format } from 'date-fns';
import { Check, Crown, CreditCard, Loader2, Settings, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MemberStatusPill, resolveSubscriptionVisualKind } from '@/lib/memberSubscriptionStatus';

interface MembershipStatusBarProps {
  isActiveMember: boolean;
  memberSince: string | null;
  subscriptionEnd: string | null;
  subscriptionEndsAt?: string | null;
  cancelAtPeriodEnd?: boolean;
  membershipOverride: boolean;
  subscriptionStatus?: string;
  onManageBilling: () => void;
  isPortalLoading: boolean;
}

export function MembershipStatusBar({
  isActiveMember,
  memberSince,
  subscriptionEnd,
  subscriptionEndsAt,
  cancelAtPeriodEnd,
  membershipOverride,
  subscriptionStatus,
  onManageBilling,
  isPortalLoading,
}: MembershipStatusBarProps) {
  const isCanceling = cancelAtPeriodEnd === true;
  const endDate = subscriptionEndsAt || subscriptionEnd;
  const statusKind = resolveSubscriptionVisualKind(subscriptionStatus, { deletedAt: null });

  if (!isActiveMember) {
    return (
      <div className="card-elevated p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:justify-between">
        <div className="flex items-center gap-3">
          <Crown className="w-5 h-5 text-primary" />
          <div>
            <p className="font-medium text-sm">Unlock Member Benefits</p>
            <p className="text-xs text-muted-foreground">Join for {SOCIAL_TIER.monthlyPriceFull} - events, perks & more</p>
          </div>
        </div>
        <Button variant="hero" size="sm" asChild>
          <Link href="/join">
            <Crown className="w-3.5 h-3.5" />
            Become a Member
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="card-elevated p-4 sm:p-5 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="inline-flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5 text-green-500 shrink-0" aria-hidden />
            <MemberStatusPill kind={statusKind} />
          </span>
          {memberSince && (
            <span className="text-sm text-muted-foreground">
              Member since {format(new Date(memberSince), 'MMM yyyy')}
            </span>
          )}
          {endDate && !membershipOverride && !isCanceling && (
            <span className="text-xs text-muted-foreground">
              Renews {format(new Date(endDate), 'MMM d, yyyy')}
            </span>
          )}
          {membershipOverride && (
            <span className="text-xs text-muted-foreground italic">Admin-managed</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!membershipOverride && (
            <Button variant="outline" size="sm" onClick={onManageBilling} disabled={isPortalLoading}>
              {isPortalLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CreditCard className="w-3.5 h-3.5" />}
              Billing
            </Button>
          )}
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/settings">
              <Settings className="w-3.5 h-3.5" />
              Settings
            </Link>
          </Button>
        </div>
      </div>
      {isCanceling && (
        <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.5)', marginTop: '8px' }}>
          Your membership ends{' '}
          {subscriptionEndsAt ? format(new Date(subscriptionEndsAt), 'MMMM d, yyyy') : 'at the end of your billing period'}
          {' - '}
          <button
            type="button"
            onClick={onManageBilling}
            style={{ color: '#C6A664', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8125rem', padding: 0, textDecoration: 'underline' }}
          >
            stay?
          </button>
        </p>
      )}
    </div>
  );
}
