'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';

interface TierSummary {
  ok: boolean;
  tier?: 'social' | 'business' | 'partner' | 'unknown';
  tierLabel?: string;
  priceCents?: number;
  priceDisplay?: string;
  interval?: string;
  status?: string;
  cancelAtPeriodEnd?: boolean;
  trialEnd?: string | null;
  currentPeriodEnd?: string | null;
  isAmbassadorPrice?: boolean;
  discount?: {
    couponName: string;
    couponCode: string | null;
    percentOff: number | null;
    amountOffCents: number | null;
    durationInMonths: number | null;
  } | null;
  membershipOverride?: boolean;
  paidThrough?: string | null;
}

const TIER_STYLES = {
  social: { bg: 'bg-[#C6A664]/10', border: 'border-[#C6A664]/30', text: 'text-[#C6A664]', dot: 'bg-[#C6A664]' },
  business: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400', dot: 'bg-blue-400' },
  partner: { bg: 'bg-muted/30', border: 'border-border', text: 'text-muted-foreground', dot: 'bg-muted-foreground' },
  unknown: { bg: 'bg-muted/30', border: 'border-border', text: 'text-muted-foreground', dot: 'bg-muted-foreground' },
} as const;

function shortTierLabel(tier: TierSummary['tier'], tierLabel?: string) {
  if (tier === 'business') return 'Business';
  if (tier === 'partner') return 'Partner';
  if (tier === 'social') return 'Social';
  return tierLabel?.replace(/ Membership$/i, '') || 'Membership';
}

export function MembershipTierBadge() {
  const [data, setData] = useState<TierSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/billing/current-subscription', {
          credentials: 'include',
          cache: 'no-store',
        });
        const json = (await res.json()) as TierSummary;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setData({ ok: false });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card/30 p-4 flex items-center gap-3 animate-pulse">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading membership...</span>
      </div>
    );
  }

  if (!data?.ok || !data.tier) {
    return null;
  }

  const style = TIER_STYLES[data.tier];
  const isExternalAnnual = typeof data.paidThrough === 'string' && !!data.paidThrough;

  // Only show a dollar amount when Stripe returned a live unit_amount-based display.
  // Never show placeholders ("-", "Comped", "Annual member") or invented fallbacks.
  const livePriceDisplay =
    !isExternalAnnual &&
    typeof data.priceCents === 'number' &&
    data.priceCents > 0 &&
    typeof data.priceDisplay === 'string' &&
    data.priceDisplay.startsWith('$')
      ? data.priceDisplay
      : null;

  const title = isExternalAnnual
    ? `${shortTierLabel(data.tier, data.tierLabel)} - Annual member`
    : data.tierLabel;

  // Build status sub-line
  let statusLine = '';
  if (isExternalAnnual) {
    statusLine = `Renews ${format(new Date(data.paidThrough!), 'MMM d, yyyy')}`;
  } else if (data.membershipOverride) {
    statusLine = 'Comped by admin';
  } else if (data.status === 'trialing' && data.trialEnd) {
    statusLine = livePriceDisplay
      ? `Trial - ${livePriceDisplay} after ${format(new Date(data.trialEnd), 'MMM d')}`
      : `Trial ends ${format(new Date(data.trialEnd), 'MMM d')}`;
  } else if (data.status === 'trialing') {
    statusLine = livePriceDisplay
      ? `Trial - ${livePriceDisplay} when trial ends`
      : 'Trial active';
  } else if (data.status === 'active' && data.cancelAtPeriodEnd && data.currentPeriodEnd) {
    statusLine = `Ends ${format(new Date(data.currentPeriodEnd), 'MMM d, yyyy')}`;
  } else if (data.status === 'active' && data.currentPeriodEnd) {
    statusLine = `Renews ${format(new Date(data.currentPeriodEnd), 'MMM d, yyyy')}`;
  } else if (data.status === 'past_due') {
    statusLine = 'Payment due - update your card';
  } else if (data.status === 'paused') {
    statusLine = 'Paused';
  } else if (data.status === 'canceled') {
    statusLine = data.currentPeriodEnd
      ? `Access until ${format(new Date(data.currentPeriodEnd), 'MMM d')}`
      : 'Canceled';
  }

  return (
    <div className={`rounded-xl border ${style.border} ${style.bg} p-4 flex items-center gap-3`}>
      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${style.dot}`} aria-hidden />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className={`text-sm font-semibold ${style.text}`}>{title}</p>
          {data.isAmbassadorPrice && (
            <span className="text-[10px] font-semibold uppercase tracking-wide bg-[#C6A664]/20 text-[#C6A664] px-1.5 py-0.5 rounded">
              Ambassador
            </span>
          )}
          {data.discount && (
            <span
              className="text-[10px] font-semibold uppercase tracking-wide bg-green-500/15 text-green-400 px-1.5 py-0.5 rounded"
              title={data.discount.couponName}
            >
              {data.discount.couponCode || 'Discount'}
            </span>
          )}
        </div>
        {statusLine && <p className="text-xs text-muted-foreground mt-0.5">{statusLine}</p>}
      </div>
      {livePriceDisplay && (
        <p className={`text-sm font-bold ${style.text} shrink-0`}>{livePriceDisplay}</p>
      )}
    </div>
  );
}
