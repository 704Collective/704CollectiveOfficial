'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { CreditCard, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { createListingBillingPortal } from '@/app/actions/networkPortalActions';
import type { PortalListing } from '@/lib/network/portal';
import { HUB_COPY } from '@/lib/network/hubs';
import { cn } from '@/lib/utils';

const GOLD = '#C6A664';
const STATUS: Record<string, { label: string; cls: string }> = {
  active: { label: 'Active', cls: 'bg-emerald-500/20 text-emerald-300' },
  past_due: { label: 'Past due', cls: 'bg-amber-500/20 text-amber-300' },
  canceled: { label: 'Canceled', cls: 'bg-rose-500/20 text-rose-300' },
};

export function BillingPanel({ listings }: { listings: PortalListing[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [portalUrl, setPortalUrl] = useState<string | null>(null);

  const manage = async (id: string) => {
    setBusy(id);
    const r = await createListingBillingPortal(id);
    setBusy(null);
    if (!r.ok) { toast.error(r.error); return; }
    setPortalUrl(r.url);
    window.location.assign(r.url);
  };

  return (
    <section className="space-y-6" data-testid="billing">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Billing</h1>
        <p className="mt-1 text-sm text-white/55">Your listing subscription, in plain terms.</p>
      </div>
      {listings.length === 0 && <p className="text-sm text-white/50">No listings on this account.</p>}
      {listings.map((l) => {
        const st = STATUS[l.billing_status ?? ''] ?? { label: l.billing_status ?? 'Not billed yet', cls: 'bg-white/10 text-white/70' };
        const rate = l.rate_cents != null ? `$${(l.rate_cents / 100).toFixed(0)}` : '$150';
        return (
          <div key={l.id} className="rounded-xl border border-white/[0.08] bg-[#222] p-4 sm:p-6" data-testid="billing-card" data-billing-status={l.billing_status ?? ''}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{l.company_name}</h2>
                <p className="text-xs text-white/50">{l.kind === 'seat' ? 'Exclusive seat' : 'Vetted spotlight'} · {HUB_COPY[l.hub].name}</p>
              </div>
              <span className={cn('rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider', st.cls)} data-testid="billing-status">{st.label}</span>
            </div>
            <p className="mt-4 text-base text-white/85" data-testid="billing-terms">
              <strong className="text-white">{rate}/month</strong>
              {l.rate_locked_until ? <> - rate locked until <strong className="text-white">{format(new Date(l.rate_locked_until), 'MMMM d, yyyy')}</strong>.</> : '.'}
              {' '}Month to month, 30-day notice.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button type="button" disabled={busy === l.id || !l.stripe_customer_id} onClick={() => void manage(l.id)} className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-black disabled:opacity-50" style={{ backgroundColor: GOLD }} data-testid="btn-manage-billing">
                <CreditCard className="h-4 w-4" />{busy === l.id ? 'Opening…' : 'Manage billing'}
              </button>
              <span className="text-xs text-white/45">Update your card, download invoices or give notice - all in Stripe's secure portal.</span>
            </div>
            {portalUrl && <a href={portalUrl} className="mt-3 inline-flex items-center gap-1 text-xs" style={{ color: GOLD }} data-testid="portal-link">If you were not redirected, open the billing portal <ExternalLink className="h-3 w-3" /></a>}
          </div>
        );
      })}
    </section>
  );
}
