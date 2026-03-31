'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, TrendingUp, TrendingDown, Users, DollarSign, RefreshCw, AlertTriangle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface FinancialsData {
  revenue: {
    last30: { social: number; business: number; total: number };
    last60: { social: number; business: number; total: number };
    last90: { social: number; business: number; total: number };
  };
  mrr: { total: number; social: number; business: number };
  arpm: number;
  revenueTrend: Array<{ month: string; social: number; business: number; total: number }>;
  members: {
    totalActive: number;
    newThisMonth: number;
    canceledThisMonth: number;
    netGrowth: number;
    pendingCancellations: number;
    byStatus: Record<string, number>;
  };
  churn: {
    rateThisMonth: number;
    rateLastMonth: number;
    avgLifetimeMonths: number;
    revenueChurn: number;
  };
  pastDue: { count: number; amount: number };
  recentPayments: Array<{ email: string; name: string; amount: number; created: number; status: string }>;
  cached?: boolean;
  last_updated?: string;
}

function StatCard({ label, value, sub, icon: Icon, trend }: { label: string; value: string; sub?: string; icon: React.ElementType; trend?: 'up' | 'down' | 'neutral' }) {
  return (
    <div className="card-elevated p-4 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
        <Icon className="w-4 h-4 text-muted-foreground" />
      </div>
      <p className="text-2xl font-bold">{value}</p>
      {sub && <p className={`text-xs ${trend === 'up' ? 'text-green-500' : trend === 'down' ? 'text-red-400' : 'text-muted-foreground'}`}>{sub}</p>}
    </div>
  );
}

interface AdminFinancialsTabProps {
  onNavigateToDashboard: () => void;
}

export function AdminFinancialsTab({ onNavigateToDashboard }: AdminFinancialsTabProps) {
  const [data, setData] = useState<FinancialsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async (bust = false) => {
    try {
      setError(null);
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) throw new Error('Not authenticated');
      const res = await fetch(
        'https://bnmtynevbuplqpuqvmna.supabase.co/functions/v1/admin-financials',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubXR5bmV2YnVwbHFwdXF2bW5hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzk0NzQyMjQsImV4cCI6MjA1NTA1MDIyNH0.o3-rHiEhpQdi1gSNrKZQKjU7o5QkLGaEECoSNAP7hRE',
          },
          body: JSON.stringify(bust ? { force_refresh: true } : {}),
        }
      );
      const json = await res.json();
      if (!res.ok || json?.error) throw new Error(json?.error || `HTTP ${res.status}`);
      setData(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load financials');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleRefresh = () => { setRefreshing(true); fetchData(true); };

  if (loading) {
    return (
      <div className="space-y-4 animate-in fade-in-0 duration-200">
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="icon" aria-label="Back to admin overview" onClick={onNavigateToDashboard}><ArrowLeft className="w-4 h-4" /></Button>
          <h2 className="text-xl font-semibold">Financials</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="animate-in fade-in-0 duration-200">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" aria-label="Back to admin overview" onClick={onNavigateToDashboard}><ArrowLeft className="w-4 h-4" /></Button>
          <h2 className="text-xl font-semibold">Financials</h2>
        </div>
        <div className="text-center py-12">
          <AlertTriangle className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground mb-4">{error || 'Could not load financial data'}</p>
          <Button variant="outline" size="sm" onClick={() => { setLoading(true); fetchData(); }}>Try Again</Button>
        </div>
      </div>
    );
  }

  const trendData = data.revenueTrend?.slice(-6).map(t => ({
    month: t.month.slice(0, 7),
    total: Math.round(t.total / 100),
    social: Math.round(t.social / 100),
  })) ?? [];

  return (
    <div className="space-y-6 animate-in fade-in-0 duration-200">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" aria-label="Back to admin overview" onClick={onNavigateToDashboard}><ArrowLeft className="w-4 h-4" /></Button>
          <div>
            <h2 className="text-xl font-semibold">Financials</h2>
            {data.last_updated && (
              <p className="text-xs text-muted-foreground">
                {data.cached ? 'Cached · ' : ''}Updated {format(new Date(data.last_updated), 'MMM d h:mm a')}
              </p>
            )}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={`w-3.5 h-3.5 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="MRR"
          value={`$${Math.round(data.mrr.total).toLocaleString()}`}
          sub={`ARPM: $${data.arpm}`}
          icon={DollarSign}
        />
        <StatCard
          label="Active Members"
          value={data.members.totalActive.toString()}
          sub={`+${data.members.newThisMonth} this month`}
          icon={Users}
          trend="up"
        />
        <StatCard
          label="Net Growth"
          value={(data.members.netGrowth >= 0 ? '+' : '') + data.members.netGrowth}
          sub={`${data.members.canceledThisMonth} canceled`}
          icon={data.members.netGrowth >= 0 ? TrendingUp : TrendingDown}
          trend={data.members.netGrowth >= 0 ? 'up' : 'down'}
        />
        <StatCard
          label="Churn Rate"
          value={`${(data.churn.rateThisMonth * 100).toFixed(1)}%`}
          sub={`Avg lifetime: ${data.churn.avgLifetimeMonths}mo`}
          icon={TrendingDown}
          trend={data.churn.rateThisMonth > 0.05 ? 'down' : 'neutral'}
        />
      </div>

      {/* Revenue stats */}
      <div className="grid grid-cols-3 gap-3">
        {(['last30', 'last60', 'last90'] as const).map((period) => (
          <div key={period} className="card-elevated p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">{period === 'last30' ? 'Last 30d' : period === 'last60' ? 'Last 60d' : 'Last 90d'}</p>
            <p className="text-xl font-bold">${Math.round(data.revenue[period].total / 100).toLocaleString()}</p>
          </div>
        ))}
      </div>

      {/* Revenue trend chart */}
      {trendData.length > 0 && (
        <div className="card-elevated p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Revenue Trend (6 months)</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={trendData}>
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${v}`} />
              <Tooltip formatter={(v: number) => [`$${v}`, 'Revenue']} />
              <Bar dataKey="total" fill="#C6A664" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Alerts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {data.pastDue.count > 0 && (
          <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-4 flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium">{data.pastDue.count} past-due member{data.pastDue.count > 1 ? 's' : ''}</p>
              <p className="text-xs text-muted-foreground">${data.pastDue.amount.toFixed(2)} at risk</p>
            </div>
          </div>
        )}
        {data.members.pendingCancellations > 0 && (
          <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-4 flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-orange-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium">{data.members.pendingCancellations} pending cancellation{data.members.pendingCancellations > 1 ? 's' : ''}</p>
              <p className="text-xs text-muted-foreground">Access ends at period end</p>
            </div>
          </div>
        )}
      </div>

      {/* Recent Payments */}
      {data.recentPayments?.length > 0 && (
        <div className="card-elevated p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Recent Payments</p>
          <div className="space-y-3">
            {data.recentPayments.slice(0, 10).map((payment, i) => (
              <div key={i} className="flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium truncate">{payment.name || payment.email}</p>
                  <p className="text-xs text-muted-foreground">{format(new Date(payment.created * 1000), 'MMM d, yyyy')}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-medium">${(payment.amount / 100).toFixed(2)}</span>
                  <Badge variant={payment.status === 'succeeded' ? 'default' : 'secondary'} className="text-xs">{payment.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
