'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { Loader2, Plus, Sparkles, MoreHorizontal, AlertTriangle } from 'lucide-react';
import { AdminLayout } from '@/components/AdminLayout';
import { useAuth } from '@/hooks/useAuth';
import { usePageTitle } from '@/hooks/usePageTitle';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { NewAmbassadorDialog } from '@/components/admin/NewAmbassadorDialog';
import { approveReferral, denyReferral, deactivateAmbassador, createAmbassadorOnboardingLink, fireAllPendingPayouts } from '@/app/actions/ambassadorActions';

type AmbassadorRow = {
  id: string;
  full_name: string;
  email: string;
  referral_code: string;
  stripe_account_status: string | null;
  is_active: boolean;
  approved_social_referrals_count: number;
};

type ReferralRow = {
  id: string;
  ambassador_id: string;
  status: string;
  tier: string;
  reward_cents: number;
  referred_email: string;
  referred_full_name: string | null;
  abuse_flags: unknown;
  paid_out_at: string | null;
  created_at: string;
};

type PayoutRow = {
  id: string;
  ambassador_id: string;
  amount_cents: number;
  status: string;
  paid_at: string | null;
};

const APPROVED_STATUSES = new Set(['approved', 'auto_approved', 'paid_out']);

function isPending(status: string) {
  return status === 'pending' || status.startsWith('flagged_');
}

function dollars(cents: number | null | undefined): string {
  const n = Number(cents ?? 0) / 100;
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function startOfMonthIso(): string {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function StripeStatusBadge({ status }: { status: string | null }) {
  const s = (status ?? 'pending').toLowerCase();
  const styles =
    s === 'active'
      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
      : s === 'onboarding'
        ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
        : s === 'restricted'
          ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
          : 'bg-muted text-muted-foreground border-border';
  return (
    <Badge variant="outline" className={`capitalize ${styles}`}>
      {s}
    </Badge>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wider text-muted-foreground/70">{label}</p>
        <p className="text-2xl font-semibold mt-1 tabular-nums">{value}</p>
        {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export default function AdminAmbassadorsPage() {
  const router = useRouter();
  const { isAdmin, isSuperAdmin, loading: authLoading } = useAuth();
  usePageTitle('Ambassadors');
  const isAdminOrSuper = isAdmin || isSuperAdmin;

  const [loadingData, setLoadingData] = useState(true);
  const [ambassadors, setAmbassadors] = useState<AmbassadorRow[]>([]);
  const [referrals, setReferrals] = useState<ReferralRow[]>([]);
  const [payoutsThisMonth, setPayoutsThisMonth] = useState<PayoutRow[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [generatingLinkFor, setGeneratingLinkFor] = useState<string | null>(null);
  const [firingAll, setFiringAll] = useState(false);
  const [fireAllResult, setFireAllResult] = useState<{ total: number; success: number; failed: { id: string; error: string }[] } | null>(null);

  const load = useCallback(async () => {
    setLoadingData(true);
    const [ambRes, refRes, payRes] = await Promise.all([
      supabase
        .from('ambassadors')
        .select('id, full_name, email, referral_code, stripe_account_status, is_active, approved_social_referrals_count')
        .order('created_at', { ascending: false }),
      supabase
        .from('ambassador_referrals')
        .select('id, ambassador_id, status, tier, reward_cents, referred_email, referred_full_name, abuse_flags, paid_out_at, created_at')
        .order('created_at', { ascending: false }),
      supabase
        .from('ambassador_payouts')
        .select('id, ambassador_id, amount_cents, status, paid_at')
        .eq('status', 'paid')
        .gte('paid_at', startOfMonthIso()),
    ]);

    if (ambRes.error) toast.error(`Ambassadors: ${ambRes.error.message}`);
    if (refRes.error) toast.error(`Referrals: ${refRes.error.message}`);
    if (payRes.error) toast.error(`Payouts: ${payRes.error.message}`);

    setAmbassadors((ambRes.data ?? []) as AmbassadorRow[]);
    setReferrals((refRes.data ?? []) as ReferralRow[]);
    setPayoutsThisMonth((payRes.data ?? []) as PayoutRow[]);
    setLoadingData(false);
  }, []);

  useEffect(() => {
    if (isAdminOrSuper) void load();
  }, [isAdminOrSuper, load]);

  const ambassadorMap = useMemo(() => {
    const m = new Map<string, AmbassadorRow>();
    for (const a of ambassadors) m.set(a.id, a);
    return m;
  }, [ambassadors]);

  const pendingReferrals = useMemo(
    () => referrals.filter((r) => isPending(r.status)),
    [referrals]
  );

  // Per-ambassador aggregations.
  const perAmbassador = useMemo(() => {
    const map = new Map<string, { total: number; pending: number; earnedCents: number }>();
    for (const a of ambassadors) {
      map.set(a.id, { total: 0, pending: 0, earnedCents: 0 });
    }
    for (const r of referrals) {
      const cur = map.get(r.ambassador_id);
      if (!cur) continue;
      if (APPROVED_STATUSES.has(r.status)) {
        cur.total += 1;
        cur.earnedCents += Number(r.reward_cents ?? 0);
      }
      if (isPending(r.status)) cur.pending += 1;
    }
    return map;
  }, [ambassadors, referrals]);

  // Top-row stats.
  const totals = useMemo(() => {
    const activeCount = ambassadors.filter((a) => a.is_active).length;
    const totalReferred = referrals.filter((r) => APPROVED_STATUSES.has(r.status)).length;
    const paidOutCents = payoutsThisMonth.reduce(
      (sum, p) => sum + Number(p.amount_cents ?? 0),
      0
    );
    const ambMap = new Map(ambassadors.map((a) => [a.id, a]));
    const pendingPayoutCount = referrals.filter(
      (r) => (r.status === 'approved' || r.status === 'auto_approved') &&
        !r.paid_out_at &&
        ambMap.get(r.ambassador_id)?.stripe_account_status === 'active'
    ).length;
    return {
      activeCount,
      pendingCount: pendingReferrals.length,
      totalReferred,
      paidOutCents,
      pendingPayoutCount,
    };
  }, [ambassadors, referrals, payoutsThisMonth, pendingReferrals.length]);

  const handleGenerateOnboardingLinkForRow = async (ambassador: AmbassadorRow) => {
    setGeneratingLinkFor(ambassador.id);
    try {
      const result = await createAmbassadorOnboardingLink(ambassador.id);
      await navigator.clipboard.writeText(result.url);
      window.open(result.url, '_blank');
      toast.success(`Onboarding link generated and copied. Send to ${ambassador.email}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate onboarding link');
    } finally {
      setGeneratingLinkFor(null);
    }
  };

  const handleFireAllPayouts = async () => {
    if (!window.confirm(`Fire all ${totals.pendingPayoutCount} pending payout(s)?`)) return;
    setFiringAll(true);
    setFireAllResult(null);
    try {
      const result = await fireAllPendingPayouts();
      setFireAllResult(result);
      if (result.failed.length === 0) {
        toast.success(`All ${result.success} payout(s) fired successfully.`);
      } else {
        toast.error(`${result.success}/${result.total} payouts succeeded. ${result.failed.length} failed.`);
      }
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Bulk payout failed');
    } finally {
      setFiringAll(false);
    }
  };

  const doApprove = async (refId: string) => {
    setBusyId(refId);
    try {
      const r = await approveReferral(refId);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success('Referral approved');
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const doDeny = async (refId: string) => {
    const reason = window.prompt('Reason for denial?');
    if (!reason || !reason.trim()) return;
    setBusyId(refId);
    try {
      const r = await denyReferral(refId, reason.trim());
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success('Referral denied');
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const doDeactivate = async (id: string, name: string) => {
    if (!window.confirm(`Deactivate ${name}? They will be hidden from the leaderboard and no new referrals will attribute to them. Existing data is preserved.`)) {
      return;
    }
    setBusyId(id);
    try {
      const r = await deactivateAmbassador(id);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`${name} deactivated`);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  if (authLoading || !isAdminOrSuper) {
    return (
      <AdminLayout title="Ambassadors">
        <div className="flex items-center justify-center min-h-[40vh] text-muted-foreground">
          {authLoading ? <Loader2 className="h-8 w-8 animate-spin" /> : 'Forbidden.'}
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Ambassadors">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-400" />
              Ambassadors
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage your referral partners and review pending referrals.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            {totals.pendingPayoutCount > 0 && (
              <Button
                onClick={() => void handleFireAllPayouts()}
                disabled={firingAll}
                variant="outline"
                className="gap-2"
              >
                {firingAll
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : null}
                Fire all pending payouts ({totals.pendingPayoutCount})
              </Button>
            )}
            <Button
              onClick={() => setCreateOpen(true)}
              className="gap-2 bg-amber-500 hover:bg-amber-600 text-black"
            >
              <Plus className="h-4 w-4" />
              New ambassador
            </Button>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Active ambassadors" value={String(totals.activeCount)} hint={`${ambassadors.length} total`} />
          <StatCard label="Pending referrals" value={String(totals.pendingCount)} hint="Awaiting your review" />
          <StatCard label="Total referred members" value={String(totals.totalReferred)} hint="Approved + paid out" />
          <StatCard label="Paid out this month" value={dollars(totals.paidOutCents)} hint={format(new Date(), 'MMMM yyyy')} />
        </div>

        {/* Pending review queue */}
        {pendingReferrals.length > 0 && (
          <Card className="border-amber-500/30 bg-amber-500/[0.04]">
            <CardContent className="p-0">
              <div className="flex items-center justify-between px-4 py-3 border-b border-amber-500/20">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-400" />
                  <h2 className="text-sm font-semibold">Pending review</h2>
                  <Badge variant="outline" className="bg-amber-500/15 text-amber-400 border-amber-500/30">
                    {pendingReferrals.length}
                  </Badge>
                </div>
              </div>
              <div className="divide-y divide-border">
                {pendingReferrals.map((r) => {
                  const amb = ambassadorMap.get(r.ambassador_id);
                  const flagged = r.status.startsWith('flagged_');
                  const flagsArr = (() => {
                    const f = r.abuse_flags;
                    if (!f) return [] as string[];
                    if (Array.isArray(f)) return f.map(String);
                    if (typeof f === 'object') return Object.keys(f as Record<string, unknown>);
                    return [String(f)];
                  })();
                  return (
                    <div key={r.id} className="px-4 py-3 flex flex-col md:flex-row md:items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-medium">{amb?.full_name ?? 'Unknown ambassador'}</span>
                          <span className="text-muted-foreground">→</span>
                          <span>{r.referred_full_name ?? r.referred_email}</span>
                          <span className="text-xs text-muted-foreground">{r.referred_email}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted-foreground">
                          <Badge variant="outline" className="capitalize">{r.tier}</Badge>
                          <span className="tabular-nums">{dollars(r.reward_cents)}</span>
                          <span>·</span>
                          <span>{format(new Date(r.created_at), 'MMM d, yyyy')}</span>
                          {flagged && (
                            <Badge variant="outline" className="bg-rose-500/15 text-rose-400 border-rose-500/30">
                              {r.status.replace('flagged_', 'flag: ')}
                            </Badge>
                          )}
                          {flagsArr.length > 0 && (
                            <span className="text-rose-400">flags: {flagsArr.join(', ')}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busyId === r.id}
                          onClick={() => void doDeny(r.id)}
                        >
                          Deny
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700 text-white"
                          disabled={busyId === r.id}
                          onClick={() => void doApprove(r.id)}
                        >
                          Approve
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Ambassadors table */}
        <div className="rounded-xl border border-border bg-card overflow-x-auto">
          {loadingData ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Referrals</TableHead>
                  <TableHead className="text-right">Pending</TableHead>
                  <TableHead className="text-right">Earned</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {ambassadors.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                      No ambassadors yet. Click <span className="font-semibold">New ambassador</span> to add one.
                    </TableCell>
                  </TableRow>
                ) : (
                  ambassadors.map((a) => {
                    const stats = perAmbassador.get(a.id) ?? { total: 0, pending: 0, earnedCents: 0 };
                    return (
                      <TableRow
                        key={a.id}
                        className="cursor-pointer"
                        onClick={() => router.push(`/admin/ambassadors/${a.id}`)}
                      >
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {a.full_name}
                            {!a.is_active && (
                              <Badge variant="outline" className="text-[10px] border-rose-500/30 text-rose-400 bg-rose-500/10">
                                inactive
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{a.email}</TableCell>
                        <TableCell>
                          <span className="font-mono text-amber-400">{a.referral_code}</span>
                        </TableCell>
                        <TableCell>
                          <StripeStatusBadge status={a.stripe_account_status} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{stats.total}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {stats.pending > 0 ? (
                            <span className="text-amber-400 font-medium">{stats.pending}</span>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{dollars(stats.earnedCents)}</TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                aria-label="Row actions"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  router.push(`/admin/ambassadors/${a.id}`);
                                }}
                              >
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={generatingLinkFor === a.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleGenerateOnboardingLinkForRow(a);
                                }}
                              >
                                {generatingLinkFor === a.id ? 'Generating...' : 'Resend onboarding link'}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                disabled={!a.is_active || busyId === a.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void doDeactivate(a.id, a.full_name);
                                }}
                                className="text-rose-400 focus:text-rose-400"
                              >
                                Deactivate
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      <NewAmbassadorDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => void load()}
      />
    </AdminLayout>
  );
}
