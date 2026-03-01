'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Copy, Crown, ExternalLink, Tag, Users } from 'lucide-react';
import { startOfMonth } from 'date-fns';

// ─── Hardcoded Stripe membership config ───────────────────────────────────────
// UPDATE THESE if the Stripe product or price changes.
const STRIPE_PRODUCT_ID = 'prod_S7hFqQl2k4qgvC';
const MEMBERSHIP_PRICE = '$30/month';
const MEMBERSHIP_BILLING = 'Monthly recurring';
const STRIPE_CHECKOUT_URL = 'https://buy.stripe.com/fZu14pctP2kz5vf0Df0Jq04';
const STRIPE_COUPONS_URL = 'https://dashboard.stripe.com/coupons';
// ─────────────────────────────────────────────────────────────────────────────

interface MemberStats {
  total: number;
  active: number;
  inactive: number;
  thisMonth: number;
}

export function MembershipSettings() {
  const [stats, setStats] = useState<MemberStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    setLoadingStats(true);
    try {
      const monthStart = startOfMonth(new Date()).toISOString();

      const [totalRes, activeRes, inactiveRes, thisMonthRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .is('deleted_at', null),
        supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .eq('subscription_status', 'active')
          .is('deleted_at', null),
        supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .neq('subscription_status', 'active')
          .is('deleted_at', null),
        supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .gte('member_since', monthStart)
          .is('deleted_at', null),
      ]);

      setStats({
        total: totalRes.count ?? 0,
        active: activeRes.count ?? 0,
        inactive: inactiveRes.count ?? 0,
        thisMonth: thisMonthRes.count ?? 0,
      });
    } catch {
      toast.error('Failed to load membership stats');
    } finally {
      setLoadingStats(false);
    }
  };

  const copyCheckoutUrl = () => {
    navigator.clipboard.writeText(STRIPE_CHECKOUT_URL);
    toast.success('Checkout URL copied');
  };

  return (
    <div className="space-y-4">
      {/* Membership Overview Card */}
      <div className="card-elevated p-4 sm:p-6 space-y-4">
        <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">Current Plan</p>

        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Crown className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold leading-tight">704 Social Membership</h3>
            <p className="text-sm text-muted-foreground mt-0.5">Standard monthly membership plan</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Price</p>
            <p className="text-sm font-semibold">{MEMBERSHIP_PRICE}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Billing</p>
            <p className="text-sm font-semibold">{MEMBERSHIP_BILLING}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Stripe Product ID</p>
            <p className="text-xs text-muted-foreground font-mono break-all">{STRIPE_PRODUCT_ID}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Checkout URL</p>
            <div className="flex items-center gap-2">
              <p className="text-xs text-muted-foreground font-mono truncate">
                {STRIPE_CHECKOUT_URL}
              </p>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={copyCheckoutUrl}
                title="Copy checkout URL"
              >
                <Copy className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Active Members Stats Card */}
      <div className="card-elevated p-4 sm:p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold">Member Stats</h3>
            <p className="text-sm text-muted-foreground">Live counts from the database</p>
          </div>
        </div>

        {loadingStats ? (
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="rounded-xl bg-muted/40 p-4 animate-pulse h-16" />
            ))}
          </div>
        ) : stats ? (
          <div className="grid grid-cols-2 gap-3">
            <StatTile label="Total Members" value={stats.total} />
            <StatTile label="Active" value={stats.active} dotColor="active" />
            <StatTile label="Inactive" value={stats.inactive} dotColor="inactive" />
            <StatTile label="This Month" value={stats.thisMonth} />
          </div>
        ) : null}
      </div>

      {/* Promo Codes Card */}
      <div className="card-elevated p-4 sm:p-6">
        <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase mb-1">Promo Codes</p>

        <div className="flex items-center gap-3 mb-4 mt-2">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Tag className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold">Active Promotions</h3>
            <p className="text-sm text-muted-foreground">Managed via Stripe Dashboard</p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            Promo codes and coupons (e.g. <span className="font-mono text-foreground">704admin</span> — 100% off) are
            created and managed directly in the Stripe Dashboard.
          </p>
          <Button variant="outline" size="sm" asChild>
            <a href={STRIPE_COUPONS_URL} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-3.5 h-3.5" />
              Manage in Stripe Dashboard
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  dotColor,
}: {
  label: string;
  value: number;
  dotColor?: 'active' | 'inactive';
}) {
  return (
    <div className="rounded-xl bg-muted/30 p-4 space-y-1">
      <div className="flex items-center gap-1.5">
        {dotColor === 'active' && (
          <span className="inline-block w-2 h-2 rounded-full bg-[hsl(142,76%,36%)]" />
        )}
        {dotColor === 'inactive' && (
          <span className="inline-block w-2 h-2 rounded-full bg-muted-foreground/50" />
        )}
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <p className="text-2xl font-bold">{value.toLocaleString()}</p>
    </div>
  );
}
