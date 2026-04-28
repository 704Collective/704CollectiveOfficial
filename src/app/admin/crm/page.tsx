'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/integrations/supabase/client';
import {
  Users, DollarSign, GitPullRequest,
  Mail, Calendar, Activity, ArrowUpRight, ArrowDownRight,
  Clock, CheckCircle2,
} from 'lucide-react';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';

/* ─── Types ─── */
interface StatCard {
  label: string;
  value: string | number;
  sub?: string;
  trend?: number;
  icon: React.ElementType;
  iconColor: string;
  href?: string;
}

interface ActivityItem {
  id: string;
  title: string;
  description: string | null;
  activity_type: string;
  created_at: string;
}

interface DealStage {
  stage: string;
  count: number;
}

interface MonthlyData {
  month: string;
  members?: number;
  revenue?: number;
}

interface CampaignStat {
  name: string;
  sent_count: number;
  open_count: number;
  click_count: number;
  sent_at: string;
}

interface ScheduledEmail {
  id: string;
  to_email: string;
  subject: string;
  scheduled_for: string;
}

/* ─── Helpers ─── */
const STAGE_LABELS: Record<string, string> = {
  applied: 'Applied',
  screening: 'Screening',
  interviewed: 'Interviewed',
  approved: 'Approved',
  active: 'Active',
  denied: 'Denied',
  waitlisted: 'Waitlisted',
  lost: 'Lost',
};

const STAGE_COLORS: Record<string, string> = {
  applied: 'bg-blue-500/20 text-blue-400',
  screening: 'bg-yellow-500/20 text-yellow-400',
  interviewed: 'bg-purple-500/20 text-purple-400',
  approved: 'bg-green-500/20 text-green-400',
  active: 'bg-emerald-500/20 text-emerald-400',
  denied: 'bg-red-500/20 text-red-400',
  waitlisted: 'bg-orange-500/20 text-orange-400',
  lost: 'bg-gray-500/20 text-gray-400',
};

function formatCurrency(n: number) {
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(0)}`;
}

function getActivityIcon(type: string) {
  if (type.includes('email')) return <Mail className="w-3.5 h-3.5" />;
  if (type.includes('event')) return <Calendar className="w-3.5 h-3.5" />;
  if (type.includes('deal') || type.includes('pipeline')) return <GitPullRequest className="w-3.5 h-3.5" />;
  if (type.includes('join') || type.includes('member')) return <CheckCircle2 className="w-3.5 h-3.5" />;
  return <Activity className="w-3.5 h-3.5" />;
}

/* ─── Stat Card ─── */
function StatCardWidget({ card }: { card: StatCard }) {
  const router = useRouter();
  const Icon = card.icon;
  const isUp = (card.trend ?? 0) >= 0;

  return (
    <button
      type="button"
      onClick={() => card.href && router.push(card.href)}
      className={`
        w-full text-left bg-card border border-border rounded-xl p-5
        transition-all duration-200
        ${card.href ? 'hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 cursor-pointer' : 'cursor-default'}
      `}
    >
      <div className="flex items-start justify-between mb-4">
        <div className={`p-2 rounded-lg ${card.iconColor}`}>
          <Icon className="w-4 h-4" />
        </div>
        {card.trend !== undefined && (
          <span className={`flex items-center gap-1 text-xs font-medium ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
            {isUp ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
            {Math.abs(card.trend)}%
          </span>
        )}
      </div>
      <div className="text-2xl font-bold text-foreground mb-1">{card.value}</div>
      <div className="text-xs text-muted-foreground">{card.label}</div>
      {card.sub && <div className="text-xs text-muted-foreground/60 mt-0.5">{card.sub}</div>}
    </button>
  );
}

/* ─── Section Header ─── */
function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {action && (
        <button type="button" onClick={onAction} className="text-xs text-primary hover:underline">
          {action}
        </button>
      )}
    </div>
  );
}

/* ─── Custom Tooltip ─── */
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-muted-foreground mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }} className="font-medium">
          {p.name}: {p.name === 'Revenue' ? formatCurrency(p.value) : p.value}
        </p>
      ))}
    </div>
  );
}

/* ─── Page ─── */
export default function CrmDashboardPage() {
  const router = useRouter();
  const { isSuperAdmin } = useAuth();

  const [totalContacts, setTotalContacts] = useState(0);
  const [activeMembers, setActiveMembers] = useState(0);
  const [mrr, setMrr] = useState(0);
  const [pipelineValue, setPipelineValue] = useState(0);
  const [memberGrowth, setMemberGrowth] = useState<MonthlyData[]>([]);
  const [revenueData, setRevenueData] = useState<MonthlyData[]>([]);
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
  const [dealStages, setDealStages] = useState<DealStage[]>([]);
  const [lastCampaign, setLastCampaign] = useState<CampaignStat | null>(null);
  const [scheduledEmails, setScheduledEmails] = useState<ScheduledEmail[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        // Row 1 stats (non-financial)
        const [
          contactsRes,
          membersRes,
          pipelineRes,
        ] = await Promise.all([
          supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('status', 'active'),
          supabase
            .from('profiles')
            .select('id', { count: 'exact', head: true })
            .is('deleted_at', null)
            .in('subscription_status', ['active', 'trialing']),
          supabase.from('crm_deals').select('value').not('stage', 'in', '("denied","lost")'),
        ]);

        setTotalContacts(contactsRes.count ?? 0);
        setActiveMembers(membersRes.count ?? 0);
        setPipelineValue((pipelineRes.data ?? []).reduce((s, r) => s + (r.value ?? 0), 0));

        // MRR — super_admin only
        if (isSuperAdmin) {
          const paymentsRes = await supabase
            .from('payments')
            .select('amount')
            .eq('status', 'succeeded')
            .gte('created_at', startOfMonth(new Date()).toISOString());
          setMrr((paymentsRes.data ?? []).reduce((s, r) => s + (r.amount ?? 0), 0));
        }

        // Member growth — last 6 months
        const months = Array.from({ length: 6 }, (_, i) => {
          const d = subMonths(new Date(), 5 - i);
          return { month: format(d, 'MMM'), start: startOfMonth(d).toISOString(), end: endOfMonth(d).toISOString() };
        });

        const growthData = await Promise.all(
          months.map(async (m) => {
            const { count } = await supabase
              .from('profiles')
              .select('id', { count: 'exact', head: true })
              .gte('created_at', m.start)
              .lte('created_at', m.end)
              .is('deleted_at', null);
            return { month: m.month, members: count ?? 0 };
          })
        );
        setMemberGrowth(growthData);

        // Revenue — super_admin only
        if (isSuperAdmin) {
          const revData = await Promise.all(
            months.map(async (m) => {
              const { data } = await supabase
                .from('payments')
                .select('amount')
                .eq('status', 'succeeded')
                .gte('created_at', m.start)
                .lte('created_at', m.end);
              const total = (data ?? []).reduce((s, r) => s + (r.amount ?? 0), 0);
              return { month: m.month, revenue: total };
            })
          );
          setRevenueData(revData);
        }

        // Recent activity
        const { data: activityData } = await supabase
          .from('contact_activity')
          .select('id, title, description, activity_type, created_at')
          .order('created_at', { ascending: false })
          .limit(10);
        setRecentActivity(activityData ?? []);

        // Deal stages
        const { data: dealsData } = await supabase
          .from('crm_deals')
          .select('stage');
        const stageCounts: Record<string, number> = {};
        (dealsData ?? []).forEach((d) => {
          stageCounts[d.stage] = (stageCounts[d.stage] ?? 0) + 1;
        });
        setDealStages(
          Object.entries(stageCounts).map(([stage, count]) => ({ stage, count }))
        );

        // Last campaign
        const { data: campaignData } = await supabase
          .from('email_campaigns')
          .select('name, sent_count, open_count, click_count, sent_at')
          .eq('status', 'sent')
          .order('sent_at', { ascending: false })
          .limit(1);
        setLastCampaign(campaignData?.[0] ?? null);

        // Upcoming scheduled emails
        const { data: scheduledData } = await supabase
          .from('email_log')
          .select('id, to_email, subject, scheduled_for')
          .eq('status', 'queued')
          .not('scheduled_for', 'is', null)
          .order('scheduled_for', { ascending: true })
          .limit(5);
        setScheduledEmails(scheduledData ?? []);

      } catch (err) {
        console.error('CRM dashboard error:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [isSuperAdmin]);

  const statCards: StatCard[] = [
    {
      label: 'Total Contacts',
      value: totalContacts.toLocaleString(),
      sub: 'Active non-member contacts',
      icon: Users,
      iconColor: 'bg-blue-500/10 text-blue-400',
      href: '/admin/crm/contacts',
    },
    {
      label: 'Active Members',
      value: activeMembers.toLocaleString(),
      sub: 'Paying subscribers',
      icon: CheckCircle2,
      iconColor: 'bg-emerald-500/10 text-emerald-400',
    },
    {
      label: 'MRR',
      value: formatCurrency(mrr),
      sub: 'This month\'s revenue',
      icon: DollarSign,
      iconColor: 'bg-yellow-500/10 text-yellow-400',
    },
    {
      label: 'Pipeline Value',
      value: formatCurrency(pipelineValue),
      sub: 'Open business applications',
      icon: GitPullRequest,
      iconColor: 'bg-purple-500/10 text-purple-400',
      href: '/admin/crm/pipeline',
    },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <div className="h-7 w-40 bg-muted animate-pulse rounded mb-1" />
          <div className="h-4 w-64 bg-muted animate-pulse rounded" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-32 bg-muted animate-pulse rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-64 bg-muted animate-pulse rounded-xl" />
          <div className="h-64 bg-muted animate-pulse rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">CRM</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {format(new Date(), 'EEEE, MMMM d, yyyy')}
          </p>
        </div>
      </div>

      {/* Row 1 — Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {statCards.filter(card => card.label !== 'MRR' || isSuperAdmin).map((card) => (
          <StatCardWidget key={card.label} card={card} />
        ))}
      </div>

      {/* Row 2 — Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Member Growth */}
        <div className="bg-card border border-border rounded-xl p-5">
          <SectionHeader title="Member Growth" action="View all" onAction={() => router.push('/admin')} />
          {memberGrowth.every(m => m.members === 0) ? (
            <div className="flex items-center justify-center h-44 text-muted-foreground text-sm">No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={176}>
              <LineChart data={memberGrowth}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={28} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="members" name="Members" stroke="#C6A664" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#C6A664' }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Revenue — super_admin only */}
        {isSuperAdmin && (
          <div className="bg-card border border-border rounded-xl p-5">
            <SectionHeader title="Revenue" action="View financials" onAction={() => router.push('/admin?section=financials')} />
            {revenueData.every(m => m.revenue === 0) ? (
              <div className="flex items-center justify-center h-44 text-muted-foreground text-sm">No data yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={176}>
                <BarChart data={revenueData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={40} tickFormatter={(v) => `$${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="revenue" name="Revenue" fill="#C6A664" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        )}
      </div>

      {/* Row 3 — Activity + Pipeline */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Recent Activity */}
        <div className="bg-card border border-border rounded-xl p-5">
          <SectionHeader title="Recent Activity" />
          {recentActivity.length === 0 ? (
            <div className="flex items-center justify-center h-44 text-muted-foreground text-sm">No activity yet</div>
          ) : (
            <div className="space-y-3">
              {recentActivity.map((item) => (
                <div key={item.id} className="flex items-start gap-3">
                  <div className="mt-0.5 p-1.5 rounded-md bg-muted text-muted-foreground shrink-0">
                    {getActivityIcon(item.activity_type)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground truncate">{item.title}</p>
                    {item.description && (
                      <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {format(new Date(item.created_at), 'MMM d')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pipeline Summary */}
        <div className="bg-card border border-border rounded-xl p-5">
          <SectionHeader title="Pipeline" action="View all" onAction={() => router.push('/admin/crm/pipeline')} />
          {dealStages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-44 gap-2">
              <p className="text-muted-foreground text-sm">No deals in pipeline</p>
              <button
                type="button"
                onClick={() => router.push('/admin/crm/pipeline')}
                className="text-xs text-primary hover:underline"
              >
                Add your first deal →
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {dealStages.map((d) => (
                <div key={d.stage} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STAGE_COLORS[d.stage] ?? 'bg-muted text-muted-foreground'}`}>
                    {STAGE_LABELS[d.stage] ?? d.stage}
                  </span>
                  <span className="text-sm font-semibold text-foreground">{d.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Row 4 — Email */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Last Campaign */}
        <div className="bg-card border border-border rounded-xl p-5">
          <SectionHeader title="Last Campaign" action="View campaigns" onAction={() => router.push('/admin/crm/campaigns')} />
          {!lastCampaign ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2">
              <p className="text-muted-foreground text-sm">No campaigns sent yet</p>
              <button
                type="button"
                onClick={() => router.push('/admin/crm/campaigns')}
                className="text-xs text-primary hover:underline"
              >
                Create your first campaign →
              </button>
            </div>
          ) : (
            <div>
              <p className="text-sm font-medium text-foreground mb-1 truncate">{lastCampaign.name}</p>
              <p className="text-xs text-muted-foreground mb-4">
                Sent {format(new Date(lastCampaign.sent_at), 'MMM d, yyyy')} · {lastCampaign.sent_count.toLocaleString()} recipients
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { label: 'Open Rate', value: lastCampaign.sent_count > 0 ? `${Math.round((lastCampaign.open_count / lastCampaign.sent_count) * 100)}%` : '—' },
                  { label: 'Click Rate', value: lastCampaign.sent_count > 0 ? `${Math.round((lastCampaign.click_count / lastCampaign.sent_count) * 100)}%` : '—' },
                  { label: 'Sent', value: lastCampaign.sent_count.toLocaleString() },
                ].map((stat) => (
                  <div key={stat.label} className="bg-muted/40 rounded-lg p-3 text-center">
                    <p className="text-lg font-bold text-foreground">{stat.value}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Scheduled Emails */}
        <div className="bg-card border border-border rounded-xl p-5">
          <SectionHeader title="Scheduled Emails" action="View all" onAction={() => router.push('/admin/crm/campaigns')} />
          {scheduledEmails.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
              No emails scheduled
            </div>
          ) : (
            <div className="space-y-3">
              {scheduledEmails.map((email) => (
                <div key={email.id} className="flex items-start gap-3">
                  <div className="mt-0.5 p-1.5 rounded-md bg-muted text-muted-foreground shrink-0">
                    <Clock className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground truncate">{email.subject}</p>
                    <p className="text-xs text-muted-foreground truncate">{email.to_email}</p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {format(new Date(email.scheduled_for), 'MMM d, h:mm a')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}