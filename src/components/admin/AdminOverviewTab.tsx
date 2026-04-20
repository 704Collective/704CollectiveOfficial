'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfDay,
  endOfDay,
  subDays,
} from 'date-fns';
import {
  Calendar,
  DollarSign,
  Users,
  UserPlus,
  Clock,
  Settings as SettingsIcon,
  Mail,
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import type { AdminSection } from '@/components/AdminLayout';
import { cn } from '@/lib/utils';

const STALE_TIME = 5 * 60 * 1000;

interface FinancialsPayload {
  mrr: { total: number; social: number; business: number };
  revenue: {
    last30: { social: number; business: number; total: number };
    last60: { social: number; business: number; total: number };
  };
}

export interface DashboardSnapshot {
  lowCapacityEventCount: number;
  pastDueCount: number;
  mrr: number | null;
  last30RevenueDollars: number | null;
  momPercent: number | null;
  financialsUnavailable: boolean;
  upcomingEvents: Array<{ id: string; title: string; start_time: string; rsvpCount: number }>;
  activeMembers: number;
  payingMembers: number;
  compedMembers: number;
  newMembersWeek: number;
  canceledMembersWeek: number;
  recentMembers: Array<{ full_name: string | null; email: string; member_type: string | null; created_at: string }>;
  eventsToday: number;
  eventsThisWeek: number;
}

async function fetchFinancials(): Promise<FinancialsPayload | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) return null;
    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!baseUrl || !anonKey) return null;
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/functions/v1/admin-financials`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        apikey: anonKey,
      },
      body: JSON.stringify({}),
    });
    const json = await res.json();
    if (!res.ok || json?.error) return null;
    return json as FinancialsPayload;
  } catch {
    return null;
  }
}

async function fetchDashboardSnapshot(): Promise<DashboardSnapshot> {
  const now = new Date();
  const sod = startOfDay(now);
  const eod = endOfDay(now);
  const ws = startOfWeek(now, { weekStartsOn: 1 });
  const we = endOfWeek(now, { weekStartsOn: 1 });
  const weekAgo = subDays(now, 7).toISOString();
  const nowIso = now.toISOString();

  const financialsP = fetchFinancials();

  const [
    todayEv,
    weekEv,
    activeMembersQ,
    payingQ,
    compedQ,
    newWeekQ,
    canceledWeekQ,
    recentList,
    upcomingList,
    weekUpcomingEvents,
    pastDueQ,
  ] = await Promise.all([
    supabase.from('events').select('*', { count: 'exact', head: true })
      .gte('start_time', sod.toISOString())
      .lte('start_time', eod.toISOString()),
    supabase.from('events').select('*', { count: 'exact', head: true })
      .gte('start_time', ws.toISOString())
      .lte('start_time', we.toISOString()),
    supabase.from('profiles').select('*', { count: 'exact', head: true })
      .is('deleted_at', null)
      .in('subscription_status', ['active', 'trialing']),
    supabase.from('profiles').select('*', { count: 'exact', head: true })
      .is('deleted_at', null)
      .in('subscription_status', ['active', 'trialing'])
      .not('subscription_id', 'is', null),
    supabase.from('profiles').select('*', { count: 'exact', head: true })
      .is('deleted_at', null)
      .in('subscription_status', ['active', 'trialing'])
      .eq('membership_override', true),
    supabase.from('profiles').select('*', { count: 'exact', head: true })
      .is('deleted_at', null)
      .gte('created_at', weekAgo),
    supabase.from('profiles').select('*', { count: 'exact', head: true })
      .is('deleted_at', null)
      .eq('subscription_status', 'canceled')
      .gte('updated_at', weekAgo),
    supabase.from('profiles')
      .select('full_name, email, member_type, created_at')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase.from('events')
      .select('id, title, start_time')
      .gte('start_time', nowIso)
      .order('start_time', { ascending: true })
      .limit(3),
    supabase.from('events')
      .select('id, capacity, start_time')
      .gte('start_time', nowIso)
      .lte('start_time', we.toISOString())
      .limit(200),
    supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('subscription_status', 'past_due'),
  ]);

  const financials = await financialsP;
  const financialsUnavailable = !financials;
  const mrr = financials ? Math.round(financials.mrr.total) : null;
  const last30 = financials?.revenue.last30.total ?? null;
  const last60 = financials?.revenue.last60.total ?? null;
  let momPercent: number | null = null;
  if (last30 != null && last60 != null) {
    const prev30 = last60 - last30;
    if (prev30 > 0) momPercent = ((last30 - prev30) / prev30) * 100;
    else if (last30 > 0) momPercent = 100;
  }
  const last30RevenueDollars = last30 != null ? Math.round(last30 / 100) : null;

  const upcoming = (upcomingList.data || []) as { id: string; title: string; start_time: string }[];
  const ids = upcoming.map((e) => e.id);
  const rsvpByEvent: Record<string, number> = {};
  if (ids.length > 0) {
    const { data: tix } = await supabase.from('tickets')
      .select('event_id')
      .in('event_id', ids)
      .in('status', ['confirmed', 'rsvp']);
    (tix || []).forEach((t: { event_id: string | null }) => {
      if (t.event_id) rsvpByEvent[t.event_id] = (rsvpByEvent[t.event_id] || 0) + 1;
    });
  }
  const upcomingEvents = upcoming.map((e) => ({
    ...e,
    rsvpCount: rsvpByEvent[e.id] || 0,
  }));

  const weekEvRows = (weekUpcomingEvents.data || []) as { id: string; capacity: number | null; start_time: string }[];
  const capIds = weekEvRows.filter((e) => e.capacity && e.capacity > 0).map((e) => e.id);
  let lowCapacityEventCount = 0;
  if (capIds.length > 0) {
    const { data: capTix } = await supabase.from('tickets')
      .select('event_id')
      .in('event_id', capIds)
      .in('status', ['confirmed', 'rsvp']);
    const cnt: Record<string, number> = {};
    (capTix || []).forEach((t: { event_id: string | null }) => {
      if (t.event_id) cnt[t.event_id] = (cnt[t.event_id] || 0) + 1;
    });
    for (const ev of weekEvRows) {
      const cap = ev.capacity;
      if (!cap || cap <= 0) continue;
      const c = cnt[ev.id] || 0;
      if (c / cap < 0.5) lowCapacityEventCount += 1;
    }
  }

  return {
    lowCapacityEventCount,
    pastDueCount: pastDueQ.count || 0,
    mrr,
    last30RevenueDollars,
    momPercent,
    financialsUnavailable,
    upcomingEvents,
    activeMembers: activeMembersQ.count || 0,
    payingMembers: payingQ.count || 0,
    compedMembers: compedQ.count || 0,
    newMembersWeek: newWeekQ.count || 0,
    canceledMembersWeek: canceledWeekQ.count || 0,
    recentMembers: (recentList.data || []) as DashboardSnapshot['recentMembers'],
    eventsToday: todayEv.count || 0,
    eventsThisWeek: weekEv.count || 0,
  };
}

interface AdminOverviewTabProps {
  onSectionChange: (section: AdminSection) => void;
  onFilterChange: (filter: string) => void;
  isSuperAdmin?: boolean;
}

export function AdminOverviewTab({
  onSectionChange,
  onFilterChange: _onFilterChange,
  isSuperAdmin = false,
}: AdminOverviewTabProps) {
  void _onFilterChange;
  const queryClient = useQueryClient();
  const router = useRouter();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-dashboard-overview'],
    queryFn: fetchDashboardSnapshot,
    staleTime: STALE_TIME,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-dashboard-overview'] });

  if (isError) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-destructive mb-3">Failed to load dashboard data.</p>
        <Button variant="outline" size="sm" onClick={() => invalidate()}>Retry</Button>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-full max-w-md" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-48 w-full rounded-xl" />)}
        </div>
        <Skeleton className="h-14 w-full rounded-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  const momUp = data.momPercent != null && data.momPercent >= 0;
  const momDown = data.momPercent != null && data.momPercent < 0;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">OVERVIEW</p>
        <h2 className="text-3xl font-bold text-foreground">Dashboard</h2>
      </div>

      {data.pastDueCount > 0 && (
        <button
          type="button"
          onClick={() => onSectionChange('contacts')}
          className="w-full text-left rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 flex items-center justify-between gap-3 hover:bg-red-500/15 transition-colors"
        >
          <div className="flex items-center gap-3 min-w-0">
            <DollarSign className="w-5 h-5 text-red-400 shrink-0" aria-hidden />
            <p className="text-sm text-foreground">
              <span className="font-semibold text-red-400">{data.pastDueCount}</span> past-due subscription{data.pastDueCount === 1 ? '' : 's'} — billing failed
            </p>
          </div>
          <span className="text-sm font-medium text-red-400 shrink-0 inline-flex items-center gap-0.5">
            View <ArrowRight className="w-4 h-4" />
          </span>
        </button>
      )}

      {data.lowCapacityEventCount > 0 && (
        <button
          type="button"
          onClick={() => onSectionChange('events')}
          className="w-full text-left rounded-xl border border-destructive/25 bg-destructive/10 px-4 py-3 flex items-center justify-between gap-3 hover:bg-destructive/15 transition-colors"
        >
          <div className="flex items-center gap-3 min-w-0">
            <Calendar className="w-5 h-5 text-destructive shrink-0" aria-hidden />
            <p className="text-sm text-foreground">
              {data.lowCapacityEventCount} event{data.lowCapacityEventCount === 1 ? '' : 's'} this week below 50% capacity
            </p>
          </div>
          <span className="text-sm font-medium text-destructive shrink-0 inline-flex items-center gap-0.5">
            View <ArrowRight className="w-4 h-4" />
          </span>
        </button>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Financials */}
        <div className="rounded-xl border border-border bg-card p-5 flex flex-col min-h-[220px]">
          <div className="flex items-start justify-between mb-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">FINANCIALS</p>
            <DollarSign className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden />
          </div>
          {data.financialsUnavailable ? (
            <p className="text-sm text-muted-foreground flex-1">Financial data unavailable.</p>
          ) : (
            <>
              <p className="text-3xl font-bold tabular-nums">
                {data.mrr != null ? `$${data.mrr.toLocaleString()}` : '—'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Monthly recurring revenue</p>
              <div className="mt-4 flex items-center gap-2 text-sm flex-wrap">
                <span className="text-muted-foreground">Last 30 days</span>
                <span className="font-medium text-foreground">
                  {data.last30RevenueDollars != null ? `$${data.last30RevenueDollars.toLocaleString()}` : '—'}
                </span>
                {data.momPercent != null && (
                  <span
                    className={cn(
                      'inline-flex items-center gap-0.5 font-medium',
                      momUp ? 'text-green-400' : momDown ? 'text-destructive' : 'text-muted-foreground',
                    )}
                  >
                    {momUp && <ArrowUpRight className="w-3.5 h-3.5" />}
                    {momDown && <ArrowDownRight className="w-3.5 h-3.5" />}
                    {data.momPercent >= 0 ? '+' : ''}
                    {data.momPercent.toFixed(1)}% MoM
                  </span>
                )}
              </div>
            </>
          )}
          {isSuperAdmin && (
            <button
              type="button"
              onClick={() => onSectionChange('financials')}
              className="mt-auto pt-4 text-sm text-muted-foreground hover:underline inline-flex items-center gap-0.5"
            >
              View full financials <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Events */}
        <div className="rounded-xl border border-border bg-card p-5 flex flex-col min-h-[220px]">
          <div className="flex items-start justify-between mb-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">EVENTS</p>
            <Calendar className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden />
          </div>
          {data.upcomingEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground flex-1">No upcoming events.</p>
          ) : (
            <ul className="space-y-3 flex-1">
              {data.upcomingEvents.map((e) => (
                <li key={e.id} className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{e.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {format(new Date(e.start_time), 'MMM d, h:mm a')}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0 tabular-nums">
                    {e.rsvpCount}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => onSectionChange('events')}
            className="mt-auto pt-4 text-sm text-muted-foreground hover:underline inline-flex items-center gap-0.5"
          >
            View all events <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* Members */}
        <div className="rounded-xl border border-border bg-card p-5 flex flex-col min-h-[220px]">
          <div className="flex items-start justify-between mb-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">MEMBERS</p>
            <Users className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden />
          </div>
          <p className="text-3xl font-bold tabular-nums">{data.activeMembers}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {data.payingMembers} paying · {data.compedMembers} comp&apos;d
          </p>
          <p className="mt-3 text-sm inline-flex items-center gap-1.5 text-green-400 font-semibold">
            <UserPlus className="w-4 h-4 shrink-0" aria-hidden />
            +{data.newMembersWeek} this week
          </p>
          <p className="text-xs uppercase tracking-wider text-muted-foreground mt-5 mb-2">RECENT</p>
          <ul className="space-y-2 flex-1">
            {data.recentMembers.length === 0 ? (
              <li className="text-sm text-muted-foreground">No recent joins.</li>
            ) : (
              data.recentMembers.map((m, i) => {
                const t = (m.member_type || 'social').toLowerCase();
                const label = t === 'business' ? 'Business' : 'Social';
                return (
                  <li key={`${m.email}-${i}`} className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium text-foreground truncate min-w-0">{m.full_name || m.email}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {label}
                      </span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {m.created_at ? format(new Date(m.created_at), 'MMM d') : '—'}
                      </span>
                    </div>
                  </li>
                );
              })
            )}
          </ul>
          <Link
            href="/admin/contacts"
            className="mt-auto pt-4 text-sm text-muted-foreground hover:underline inline-flex items-center gap-0.5"
          >
            View all contacts <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-stretch rounded-full border border-border bg-muted/40 dark:bg-muted/20 px-4 py-3 gap-3 sm:gap-0 sm:divide-x sm:divide-border text-sm">
        <div className="flex items-center gap-2 sm:flex-1 sm:justify-center">
          <Clock className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden />
          <span className="text-muted-foreground">Today:</span>
          <span className="font-bold text-foreground tabular-nums">{data.eventsToday}</span>
        </div>
        <div className="flex items-center gap-2 sm:flex-1 sm:justify-center">
          <Calendar className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden />
          <span className="text-muted-foreground">This week:</span>
          <span className="font-bold text-foreground tabular-nums">{data.eventsThisWeek}</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap sm:flex-1 sm:justify-center">
          <Users className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden />
          <span className="text-green-400 font-bold tabular-nums">+{data.newMembersWeek} new</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-destructive font-bold tabular-nums">-{data.canceledMembersWeek} canceled</span>
        </div>
      </div>

      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">QUICK ACTIONS</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Button
            type="button"
            variant="outline"
            className="rounded-full h-11 gap-2"
            onClick={() => router.push('/admin?section=events&create_event=1')}
          >
            <Calendar className="w-4 h-4 shrink-0" />
            Create Event
          </Button>
          <Button
            type="button"
            variant="outline"
            className="rounded-full h-11 gap-2"
            onClick={() => router.push('/admin/contacts?add=1')}
          >
            <UserPlus className="w-4 h-4 shrink-0" />
            Add Contact
          </Button>
          <Button type="button" variant="outline" className="rounded-full h-11 gap-2" asChild>
            <Link href="/admin/crm/campaigns/new">
              <Mail className="w-4 h-4 shrink-0" />
              Compose Email
            </Link>
          </Button>
          <Button type="button" variant="outline" className="rounded-full h-11 gap-2" asChild>
            <Link href="/admin/settings">
              <SettingsIcon className="w-4 h-4 shrink-0" />
              Settings
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
