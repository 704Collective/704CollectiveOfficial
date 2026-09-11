'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { Loader2, Gift } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  createMemberPayoutOnboardingLink,
  getMyReferralPayoutState,
  syncMyPayoutAccountStatus,
  type ReferralPayoutState,
  type ReferralRowView,
} from '@/app/actions/memberPayoutActions';

/**
 * Referrer-facing view of the referrals ledger (read through the existing
 * referrals_party_read policy via a server action scoped to auth.uid()).
 * Renders nothing when the member has never referred anyone. The
 * "Set up payouts" CTA appears only when money is owed and no usable Connect
 * account exists (own or ambassador).
 */

type RowState = 'pending' | 'earned_setup' | 'earned_waiting' | 'paid';

function rowState(r: ReferralRowView, needsSetup: boolean): RowState {
  if (r.status === 'paid' || r.payout_status === 'sent') return 'paid';
  if (r.status === 'converted' || r.status === 'owed') return needsSetup ? 'earned_setup' : 'earned_waiting';
  return 'pending';
}

const STATE_LABEL: Record<RowState, string> = {
  pending: 'Pending their second payment',
  earned_setup: 'Earned - set up payouts to receive it',
  earned_waiting: 'Earned - pays out Monday',
  paid: 'Paid',
};

export function ReferralEarningsCard() {
  const searchParams = useSearchParams();
  const [state, setState] = useState<ReferralPayoutState | null>(null);
  const [loading, setLoading] = useState(true);
  const [ctaBusy, setCtaBusy] = useState(false);
  const [ctaError, setCtaError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await getMyReferralPayoutState();
    if (res.ok) setState(res.state);
    setLoading(false);
  }, []);

  useEffect(() => {
    const flag = searchParams.get('payout_setup');
    (async () => {
      if (flag === 'complete' || flag === 'refresh') {
        await syncMyPayoutAccountStatus().catch(() => null);
      }
      await load();
    })();
  }, [searchParams, load]);

  const startSetup = async () => {
    setCtaBusy(true);
    setCtaError(null);
    try {
      const res = await createMemberPayoutOnboardingLink();
      if (!res.ok) {
        setCtaError(res.error === 'nothing_owed' ? 'Nothing is owed yet.' : 'Could not start payout setup. Please try again.');
        setCtaBusy(false);
        return;
      }
      window.location.href = res.url;
    } catch {
      setCtaError('Could not start payout setup. Please try again.');
      setCtaBusy(false);
    }
  };

  if (loading || !state || state.referrals.length === 0) return null;

  const owedDollars = (state.owedCents / 100).toFixed(0);

  return (
    <section
      data-testid="referral-earnings-card"
      className="rounded-xl border border-[#C6A664]/30 p-4 sm:p-5"
      style={{ background: 'linear-gradient(135deg, rgba(198,166,100,0.12) 0%, rgba(198,166,100,0.05) 100%)' }}
      aria-label="Your referrals"
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Gift className="w-4 h-4 text-[#C6A664]" aria-hidden />
          <h2 className="text-sm font-semibold text-[#C6A664] m-0">Your referrals</h2>
        </div>
        {state.needsSetup && (
          <div className="flex flex-col items-end gap-1">
            <Button
              size="sm"
              data-testid="payout-setup-cta"
              onClick={startSetup}
              disabled={ctaBusy}
              className="bg-[#C6A664] text-black hover:bg-[#d4b676]"
            >
              {ctaBusy ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Opening Stripe…</> : `Set up payouts to receive $${owedDollars}`}
            </Button>
            {ctaError && <p className="text-xs text-rose-400 m-0">{ctaError}</p>}
          </div>
        )}
      </div>

      <ul className="mt-3 space-y-2 list-none p-0 m-0">
        {state.referrals.map((r) => {
          const s = rowState(r, state.needsSetup);
          const when =
            s === 'paid' && r.payout_sent_at ? ` ${format(new Date(r.payout_sent_at), 'MMM d')}` : '';
          return (
            <li key={r.id} data-testid="referral-row" data-state={s} className="flex items-center justify-between gap-3 text-sm">
              <div className="min-w-0">
                <p className="m-0 font-medium truncate">{r.referred_name ?? 'New member'}</p>
                <p className="m-0 text-xs text-muted-foreground" data-testid="referral-state">
                  {STATE_LABEL[s]}{when}
                </p>
              </div>
              <span className={`shrink-0 font-semibold ${s === 'paid' ? 'text-green-400' : s === 'pending' ? 'text-muted-foreground' : 'text-[#C6A664]'}`}>
                ${(r.amount_cents / 100).toFixed(0)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default ReferralEarningsCard;
