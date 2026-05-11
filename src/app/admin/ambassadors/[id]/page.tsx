'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ArrowLeft, Loader2, ChevronDown, ChevronRight, Save } from 'lucide-react';
import { AdminLayout } from '@/components/AdminLayout';
import { useAuth } from '@/hooks/useAuth';
import { usePageTitle } from '@/hooks/usePageTitle';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { updateAmbassador, createAmbassadorOnboardingLink, fireAmbassadorPayout, churnReferral } from '@/app/actions/ambassadorActions';

type Ambassador = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  referral_code: string;
  stripe_account_id: string | null;
  stripe_account_status: string | null;
  stripe_onboarding_completed_at: string | null;
  social_reward_cents: number;
  business_reward_cents: number;
  is_active: boolean;
  notes: string | null;
  approved_social_referrals_count: number;
  created_at: string;
};

type Referral = {
  id: string;
  status: string;
  tier: string;
  reward_cents: number;
  referred_email: string;
  referred_full_name: string | null;
  signup_ip: string | null;
  signup_user_agent: string | null;
  abuse_flags: unknown;
  paid_out_at: string | null;
  created_at: string;
};

type Payout = {
  id: string;
  amount_cents: number;
  status: string;
  stripe_transfer_id: string | null;
  stripe_payout_id: string | null;
  failure_reason: string | null;
  created_at: string;
  sent_at: string | null;
  paid_at: string | null;
  failed_at: string | null;
};

const APPROVED_STATUSES = new Set([
  'approved',
  'auto_approved',
  'paid_out',
  'converted',
]);
const CHURN_ELIGIBLE = new Set(['pending', 'signed_up', 'approved', 'auto_approved', 'converted']);
const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'signed_up', label: 'Signed up' },
  { value: 'approved', label: 'Approved' },
  { value: 'converted', label: 'Converted' },
  { value: 'denied', label: 'Denied' },
  { value: 'paid_out', label: 'Paid out' },
  { value: 'churned', label: 'Churned' },
] as const;

function dollars(cents: number | null | undefined): string {
  const n = Number(cents ?? 0) / 100;
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function isPending(status: string) {
  return status === 'pending' || status === 'signed_up' || status.startsWith('flagged_');
}

function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  if (s === 'approved' || s === 'auto_approved') {
    return <Badge variant="outline" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 capitalize">{s.replace('_', ' ')}</Badge>;
  }
  if (s === 'converted') {
    return <Badge variant="outline" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">converted</Badge>;
  }
  if (s === 'paid_out') {
    return <Badge variant="outline" className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40">paid out</Badge>;
  }
  if (s === 'denied') {
    return <Badge variant="outline" className="bg-rose-500/15 text-rose-400 border-rose-500/30">denied</Badge>;
  }
  if (s === 'churned') {
    return <Badge variant="outline" className="bg-muted text-muted-foreground border-border">churned</Badge>;
  }
  if (s.startsWith('flagged_')) {
    return <Badge variant="outline" className="bg-amber-500/15 text-amber-400 border-amber-500/30">{s.replace('flagged_', 'flag: ')}</Badge>;
  }
  if (s === 'signed_up') {
    return <Badge variant="outline" className="bg-blue-500/15 text-blue-400 border-blue-500/30">signed up</Badge>;
  }
  if (s === 'pending') {
    return <Badge variant="outline" className="bg-muted text-muted-foreground">pending</Badge>;
  }
  return <Badge variant="outline" className="capitalize">{s.replace('_', ' ')}</Badge>;
}

function PayoutStatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  if (s === 'paid') return <Badge variant="outline" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">paid</Badge>;
  if (s === 'sent') return <Badge variant="outline" className="bg-amber-500/15 text-amber-400 border-amber-500/30">sent</Badge>;
  if (s === 'failed') return <Badge variant="outline" className="bg-rose-500/15 text-rose-400 border-rose-500/30">failed</Badge>;
  return <Badge variant="outline" className="capitalize">{s}</Badge>;
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
  return <Badge variant="outline" className={`capitalize ${styles}`}>{s}</Badge>;
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

export default function AdminAmbassadorDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { isAdmin, isSuperAdmin, loading: authLoading } = useAuth();
  const isAdminOrSuper = isAdmin || isSuperAdmin;

  const id = typeof params.id === 'string' ? params.id : '';
  usePageTitle('Ambassador');

  const [loadingData, setLoadingData] = useState(true);
  const [amb, setAmb] = useState<Ambassador | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [filter, setFilter] = useState<(typeof STATUS_FILTERS)[number]['value']>('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  // Settings form state.
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    referral_code: '',
    social_dollars: '0',
    business_dollars: '0',
    is_active: true,
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [firingPayoutId, setFiringPayoutId] = useState<string | null>(null);
  const [churningId, setChurningId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoadingData(true);
    const [ambRes, refRes, payRes] = await Promise.all([
      supabase
        .from('ambassadors')
        .select('id, full_name, email, phone, referral_code, stripe_account_id, stripe_account_status, stripe_onboarding_completed_at, social_reward_cents, business_reward_cents, is_active, notes, approved_social_referrals_count, created_at')
        .eq('id', id)
        .maybeSingle(),
      supabase
        .from('ambassador_referrals')
        .select('id, status, tier, reward_cents, referred_email, referred_full_name, signup_ip, signup_user_agent, abuse_flags, paid_out_at, created_at')
        .eq('ambassador_id', id)
        .order('created_at', { ascending: false }),
      supabase
        .from('ambassador_payouts')
        .select('id, amount_cents, status, stripe_transfer_id, stripe_payout_id, failure_reason, created_at, sent_at, paid_at, failed_at')
        .eq('ambassador_id', id)
        .order('created_at', { ascending: false }),
    ]);

    if (ambRes.error) toast.error(`Ambassador: ${ambRes.error.message}`);
    if (refRes.error) toast.error(`Referrals: ${refRes.error.message}`);
    if (payRes.error) toast.error(`Payouts: ${payRes.error.message}`);

    const a = (ambRes.data as Ambassador | null) ?? null;
    setAmb(a);
    setReferrals((refRes.data ?? []) as Referral[]);
    setPayouts((payRes.data ?? []) as Payout[]);
    if (a) {
      setForm({
        full_name: a.full_name ?? '',
        email: a.email ?? '',
        phone: a.phone ?? '',
        referral_code: a.referral_code ?? '',
        social_dollars: ((a.social_reward_cents ?? 0) / 100).toFixed(2),
        business_dollars: ((a.business_reward_cents ?? 0) / 100).toFixed(2),
        is_active: !!a.is_active,
        notes: a.notes ?? '',
      });
    }
    setLoadingData(false);
  }, [id]);

  useEffect(() => {
    if (isAdminOrSuper) void load();
  }, [isAdminOrSuper, load]);

  const stats = useMemo(() => {
    const totalReferrals = referrals.filter((r) => APPROVED_STATUSES.has(r.status)).length;
    const pendingCount = referrals.filter((r) => isPending(r.status)).length;
    const earnedCents = referrals
      .filter((r) => APPROVED_STATUSES.has(r.status))
      .reduce((sum, r) => sum + Number(r.reward_cents ?? 0), 0);
    const paidOutCents = payouts
      .filter((p) => p.status === 'paid')
      .reduce((sum, p) => sum + Number(p.amount_cents ?? 0), 0);
    return { totalReferrals, pendingCount, earnedCents, paidOutCents };
  }, [referrals, payouts]);

  const filteredReferrals = useMemo(() => {
    if (filter === 'all') return referrals;
    if (filter === 'pending') return referrals.filter((r) => isPending(r.status));
    if (filter === 'signed_up') return referrals.filter((r) => r.status === 'signed_up');
    if (filter === 'approved') return referrals.filter((r) => r.status === 'approved' || r.status === 'auto_approved');
    if (filter === 'converted') return referrals.filter((r) => r.status === 'converted');
    if (filter === 'denied') return referrals.filter((r) => r.status === 'denied');
    if (filter === 'paid_out') return referrals.filter((r) => r.status === 'paid_out');
    if (filter === 'churned') return referrals.filter((r) => r.status === 'churned');
    return referrals;
  }, [filter, referrals]);

  const handleSave = async () => {
    if (!amb) return;
    const social = Math.round(Number(form.social_dollars) * 100);
    const business = Math.round(Number(form.business_dollars) * 100);
    setSaving(true);
    try {
      const r = await updateAmbassador(amb.id, {
        full_name: form.full_name,
        email: form.email,
        phone: form.phone || null,
        referral_code: form.referral_code,
        social_reward_cents: social,
        business_reward_cents: business,
        is_active: form.is_active,
        notes: form.notes || null,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success('Ambassador updated');
      setEditing(false);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateOnboardingLink = async (ambassador: Ambassador) => {
    setGeneratingLink(true);
    try {
      const result = await createAmbassadorOnboardingLink(ambassador.id);
      await navigator.clipboard.writeText(result.url);
      window.open(result.url, '_blank');
      if (result.emailSent) {
        toast.success(`Onboarding link emailed to ${ambassador.email} (also copied to clipboard).`);
      } else {
        toast.warning(`Link generated and copied \u2014 email failed. Please send manually to ${ambassador.email}.`);
      }
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate onboarding link');
    } finally {
      setGeneratingLink(false);
    }
  };

  const handleFirePayout = async (referralId: string, rewardCents: number) => {
    if (!amb) return;
    if (!window.confirm(`Send ${dollars(rewardCents)} to ${amb.full_name}?`)) return;
    setFiringPayoutId(referralId);
    try {
      const result = await fireAmbassadorPayout(referralId);
      toast.success(`Payout sent! Transfer ID: ${result.transfer_id}`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Payout failed');
    } finally {
      setFiringPayoutId(null);
    }
  };

  const handleChurn = async (referralId: string) => {
    const reason = window.prompt(
      'Mark this referral as churned? This means no commission will be paid.\n\nOptional reason (press OK to confirm):'
    );
    if (reason === null) return; // cancelled
    setChurningId(referralId);
    try {
      const result = await churnReferral(referralId, reason.trim() || undefined);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success('Referral marked as churned');
      await load();
    } finally {
      setChurningId(null);
    }
  };

  if (authLoading || !isAdminOrSuper) {
    return (
      <AdminLayout title="Ambassador">
        <div className="flex items-center justify-center min-h-[40vh] text-muted-foreground">
          {authLoading ? <Loader2 className="h-8 w-8 animate-spin" /> : 'Forbidden.'}
        </div>
      </AdminLayout>
    );
  }

  if (loadingData) {
    return (
      <AdminLayout title="Ambassador">
        <div className="flex items-center justify-center min-h-[40vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  if (!amb) {
    return (
      <AdminLayout title="Ambassador">
        <div className="space-y-4">
          <Link
            href="/admin/ambassadors"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to ambassadors
          </Link>
          <p className="text-muted-foreground">Ambassador not found.</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title={amb.full_name}>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <Link
            href="/admin/ambassadors"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to ambassadors
          </Link>
          <div className="mt-3 flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight">{amb.full_name}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                <span>{amb.email}</span>
                {amb.phone && (
                  <>
                    <span className="text-muted-foreground/50">·</span>
                    <span>{amb.phone}</span>
                  </>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="font-mono text-amber-400 text-base">{amb.referral_code}</span>
                <StripeStatusBadge status={amb.stripe_account_status} />
                {!amb.is_active && (
                  <Badge variant="outline" className="border-rose-500/30 text-rose-400 bg-rose-500/10">
                    inactive
                  </Badge>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {(amb.stripe_account_status ?? 'pending') === 'active' ? (
                  <>
                    <Badge variant="outline" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                      Stripe Connect Active
                    </Badge>
                    {amb.stripe_account_id && (
                      <span className="text-xs text-muted-foreground font-mono">{amb.stripe_account_id}</span>
                    )}
                  </>
                ) : (amb.stripe_account_status ?? 'pending') === 'restricted' ? (
                  <>
                    <Badge variant="outline" className="bg-rose-500/15 text-rose-400 border-rose-500/30">
                      Update Required
                    </Badge>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={generatingLink}
                      onClick={() => void handleGenerateOnboardingLink(amb)}
                      className="h-7 text-xs gap-1"
                    >
                      {generatingLink ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                      Regenerate link
                    </Button>
                  </>
                ) : (amb.stripe_account_status ?? 'pending') === 'onboarding' ? (
                  <Button
                    type="button"
                    size="sm"
                    disabled={generatingLink}
                    onClick={() => void handleGenerateOnboardingLink(amb)}
                    className="h-7 text-xs gap-1 bg-amber-500 hover:bg-amber-600 text-black"
                  >
                    {generatingLink ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                    Resend onboarding link
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    disabled={generatingLink}
                    onClick={() => void handleGenerateOnboardingLink(amb)}
                    className="h-7 text-xs gap-1 bg-amber-500 hover:bg-amber-600 text-black"
                  >
                    {generatingLink ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                    Create onboarding link
                  </Button>
                )}
              </div>
            </div>
            <div className="shrink-0">
              <Button type="button" variant="outline" onClick={() => router.push(`/admin/ambassadors/${amb.id}?tab=settings`)}>
                Edit
              </Button>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Total referrals" value={String(stats.totalReferrals)} hint="Approved + paid out" />
          <StatCard label="Pending review" value={String(stats.pendingCount)} hint="Awaiting your review" />
          <StatCard label="Total earned" value={dollars(stats.earnedCents)} hint="Approved + paid out" />
          <StatCard label="Total paid out" value={dollars(stats.paidOutCents)} hint={`${payouts.filter((p) => p.status === 'paid').length} payouts`} />
        </div>

        {/* Tabs */}
        <Tabs defaultValue="referrals">
          <TabsList>
            <TabsTrigger value="referrals">Referrals</TabsTrigger>
            <TabsTrigger value="payouts">Payouts</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          {/* Referrals tab */}
          <TabsContent value="referrals" className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{filteredReferrals.length} referral{filteredReferrals.length === 1 ? '' : 's'}</p>
              <div className="w-44">
                <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filter" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_FILTERS.map((f) => (
                      <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Date</TableHead>
                    <TableHead>Referred</TableHead>
                    <TableHead>Tier</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Reward</TableHead>
                    <TableHead>Payout</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredReferrals.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                        No referrals match this filter.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredReferrals.map((r) => {
                      const isOpen = expanded === r.id;
                      const flagsArr = (() => {
                        const f = r.abuse_flags;
                        if (!f) return [] as string[];
                        if (Array.isArray(f)) return f.map(String);
                        if (typeof f === 'object') return Object.entries(f as Record<string, unknown>).map(([k, v]) => `${k}=${String(v)}`);
                        return [String(f)];
                      })();
                      const hasDetail = flagsArr.length > 0 || r.signup_ip || r.signup_user_agent;
                      return (
                        <>
                          <TableRow
                            key={r.id}
                            className={hasDetail ? 'cursor-pointer' : undefined}
                            onClick={() => hasDetail && setExpanded(isOpen ? null : r.id)}
                          >
                            <TableCell>
                              {hasDetail ? (
                                isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              ) : null}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                              {format(new Date(r.created_at), 'MMM d, yyyy')}
                            </TableCell>
                            <TableCell>
                              <div className="font-medium">{r.referred_full_name ?? '-'}</div>
                              <div className="text-xs text-muted-foreground">{r.referred_email}</div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="capitalize">{r.tier}</Badge>
                            </TableCell>
                            <TableCell><StatusBadge status={r.status} /></TableCell>
                            <TableCell className="text-right tabular-nums">{dollars(r.reward_cents)}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {r.paid_out_at ? format(new Date(r.paid_out_at), 'MMM d') : '-'}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-1 items-start">
                                {APPROVED_STATUSES.has(r.status) && !r.paid_out_at ? (
                                  amb.stripe_account_status === 'active' ? (
                                    <Button
                                      type="button"
                                      size="sm"
                                      disabled={firingPayoutId === r.id}
                                      onClick={(e) => { e.stopPropagation(); void handleFirePayout(r.id, r.reward_cents); }}
                                      className="h-7 text-xs bg-amber-500 hover:bg-amber-600 text-black gap-1"
                                    >
                                      {firingPayoutId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                                      Fire payout
                                    </Button>
                                  ) : (
                                    <span className="text-xs text-muted-foreground" title="Ambassador must complete Stripe onboarding first">
                                      Pending onboarding
                                    </span>
                                  )
                                ) : null}
                                {CHURN_ELIGIBLE.has(r.status) && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={churningId === r.id}
                                    onClick={(e) => { e.stopPropagation(); void handleChurn(r.id); }}
                                    className="h-7 text-xs text-amber-400 border-amber-500/30 hover:bg-amber-500/10 gap-1"
                                  >
                                    {churningId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                                    Mark churned
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                          {isOpen && hasDetail && (
                            <TableRow key={`${r.id}-detail`} className="bg-muted/30 hover:bg-muted/30">
                              <TableCell />
                              <TableCell colSpan={6} className="text-sm">
                                <div className="space-y-1.5 py-2">
                                  {flagsArr.length > 0 && (
                                    <div>
                                      <span className="text-muted-foreground">Abuse flags:</span>{' '}
                                      <span className="text-rose-400">{flagsArr.join(', ')}</span>
                                    </div>
                                  )}
                                  {r.signup_ip && (
                                    <div>
                                      <span className="text-muted-foreground">IP:</span>{' '}
                                      <span className="font-mono">{r.signup_ip}</span>
                                    </div>
                                  )}
                                  {r.signup_user_agent && (
                                    <div className="break-all">
                                      <span className="text-muted-foreground">User agent:</span>{' '}
                                      <span className="font-mono text-xs">{r.signup_user_agent}</span>
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* Payouts tab */}
          <TabsContent value="payouts" className="mt-4">
            <div className="rounded-xl border border-border bg-card overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Stripe transfer</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payouts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-10">
                        No payouts yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    payouts.map((p) => {
                      const dateStr = p.paid_at ?? p.sent_at ?? p.failed_at ?? p.created_at;
                      return (
                        <TableRow key={p.id}>
                          <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                            {format(new Date(dateStr), 'MMM d, yyyy')}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-medium">{dollars(p.amount_cents)}</TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {p.stripe_transfer_id ?? p.stripe_payout_id ?? '-'}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <PayoutStatusBadge status={p.status} />
                              {p.failure_reason && (
                                <span className="text-xs text-rose-400">{p.failure_reason}</span>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* Settings tab */}
          <TabsContent value="settings" className="mt-4">
            <Card>
              <CardContent className="p-6 space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="set-name">Full name</Label>
                    <Input
                      id="set-name"
                      value={form.full_name}
                      onChange={(e) => { setForm((f) => ({ ...f, full_name: e.target.value })); setEditing(true); }}
                    />
                  </div>
                  <div>
                    <Label htmlFor="set-email">Email</Label>
                    <Input
                      id="set-email"
                      type="email"
                      value={form.email}
                      onChange={(e) => { setForm((f) => ({ ...f, email: e.target.value })); setEditing(true); }}
                    />
                  </div>
                  <div>
                    <Label htmlFor="set-phone">Phone</Label>
                    <Input
                      id="set-phone"
                      type="tel"
                      value={form.phone}
                      onChange={(e) => { setForm((f) => ({ ...f, phone: e.target.value })); setEditing(true); }}
                    />
                  </div>
                  <div>
                    <Label htmlFor="set-code">Referral code</Label>
                    <Input
                      id="set-code"
                      value={form.referral_code}
                      onChange={(e) => { setForm((f) => ({ ...f, referral_code: e.target.value.replace(/\s+/g, '').toUpperCase() })); setEditing(true); }}
                      className="font-mono"
                    />
                  </div>
                  <div>
                    <Label htmlFor="set-social">Social reward ($)</Label>
                    <Input
                      id="set-social"
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.social_dollars}
                      onChange={(e) => { setForm((f) => ({ ...f, social_dollars: e.target.value })); setEditing(true); }}
                    />
                  </div>
                  <div>
                    <Label htmlFor="set-business">Business reward ($)</Label>
                    <Input
                      id="set-business"
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.business_dollars}
                      onChange={(e) => { setForm((f) => ({ ...f, business_dollars: e.target.value })); setEditing(true); }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <p className="text-sm font-medium">Active</p>
                    <p className="text-xs text-muted-foreground">
                      Inactive ambassadors are hidden from the leaderboard and stop attributing new referrals. Existing data is preserved.
                    </p>
                  </div>
                  <Switch
                    checked={form.is_active}
                    onCheckedChange={(v) => { setForm((f) => ({ ...f, is_active: v })); setEditing(true); }}
                  />
                </div>

                <div>
                  <Label htmlFor="set-notes">Notes</Label>
                  <Textarea
                    id="set-notes"
                    value={form.notes}
                    onChange={(e) => { setForm((f) => ({ ...f, notes: e.target.value })); setEditing(true); }}
                    rows={4}
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void load()}
                    disabled={!editing || saving}
                  >
                    Reset
                  </Button>
                  <Button type="button" onClick={() => void handleSave()} disabled={saving} className="gap-2">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save changes
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}