'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format, subDays } from 'date-fns';
import {
  Plus, Loader2, RefreshCw, TrendingUp, TrendingDown,
  DollarSign, MousePointer, Eye, Target, CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, LineChart, Line,
} from 'recharts';

/* ─── Types ─── */
interface AdAccount {
  id: string;
  platform: 'facebook' | 'google';
  account_name: string;
  account_id: string;
  is_connected: boolean;
  last_sync_at: string | null;
}

interface AdPerformance {
  id: string;
  ad_account_id: string;
  campaign_name: string | null;
  date: string;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  revenue: number;
  ctr: number | null;
  cpc: number | null;
  roas: number | null;
}

/* ─── Helpers ─── */
function formatCurrency(n: number) {
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(2)}`;
}

function StatCard({
  label, value, sub, icon: Icon, trend, color,
}: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; trend?: number; color: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2 rounded-lg ${color}`}><Icon className="w-4 h-4" /></div>
        {trend !== undefined && (
          <span className={`flex items-center gap-1 text-xs font-medium ${trend >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {trend >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
            {Math.abs(trend)}%
          </span>
        )}
      </div>
      <p className="text-xl font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      {sub && <p className="text-xs text-muted-foreground/60">{sub}</p>}
    </div>
  );
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-muted-foreground mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }} className="font-medium">{p.name}: {p.name === 'Spend' || p.name === 'Revenue' ? formatCurrency(p.value) : p.value}</p>
      ))}
    </div>
  );
}

/* ─── Connect Account Dialog ─── */
function ConnectAccountDialog({ open, onClose, onConnected }: { open: boolean; onClose: () => void; onConnected: () => void }) {
  const [platform, setPlatform] = useState<'facebook' | 'google'>('facebook');
  const [accountName, setAccountName] = useState('');
  const [accountId, setAccountId] = useState('');
  const [saving, setSaving] = useState(false);

  const handleConnect = async () => {
    if (!accountName.trim() || !accountId.trim()) { toast.error('All fields required'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('crm_ad_accounts').insert({
        platform, account_name: accountName.trim(), account_id: accountId.trim(), is_connected: true, connected_at: new Date().toISOString(),
      });
      if (error) throw error;
      toast.success('Ad account connected');
      onConnected();
      onClose();
    } catch (err: any) { toast.error(err.message ?? 'Failed'); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-full max-w-sm mx-4 sm:mx-auto">
        <DialogHeader>
          <DialogTitle>Connect Ad Account</DialogTitle>
          <DialogDescription>Link your Facebook or Google Ads account</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Platform</Label>
            <Select value={platform} onValueChange={v => setPlatform(v as 'facebook' | 'google')}>
              <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="facebook">Facebook Ads</SelectItem>
                <SelectItem value="google">Google Ads</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Account Name</Label>
            <Input value={accountName} onChange={e => setAccountName(e.target.value)} placeholder="e.g. 704 Collective Facebook" className="text-sm" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Account ID</Label>
            <Input value={accountId} onChange={e => setAccountId(e.target.value)} placeholder="Your ad account ID" className="text-sm" />
          </div>
        </div>
        <DialogFooter className="gap-2 flex-col sm:flex-row">
          <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">Cancel</Button>
          <Button onClick={handleConnect} disabled={saving} className="w-full sm:w-auto gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}Connect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Page ─── */
export default function CrmAdsPage() {
  const [accounts, setAccounts] = useState<AdAccount[]>([]);
  const [performance, setPerformance] = useState<AdPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectOpen, setConnectOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<string>('all');
  const [dateRange, setDateRange] = useState('30');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [accountsRes, perfRes] = await Promise.all([
        supabase.from('crm_ad_accounts').select('*').order('platform'),
        supabase.from('crm_ad_performance').select('*')
          .gte('date', format(subDays(new Date(), parseInt(dateRange)), 'yyyy-MM-dd'))
          .order('date', { ascending: true }),
      ]);
      setAccounts(accountsRes.data ?? []);
      setPerformance(perfRes.data ?? []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [dateRange]);

  useEffect(() => { load(); }, [load]);

  const filtered = selectedAccount === 'all'
    ? performance
    : performance.filter(p => p.ad_account_id === selectedAccount);

  const totals = filtered.reduce((acc, p) => ({
    impressions: acc.impressions + p.impressions,
    clicks: acc.clicks + p.clicks,
    spend: acc.spend + p.spend,
    conversions: acc.conversions + p.conversions,
    revenue: acc.revenue + p.revenue,
  }), { impressions: 0, clicks: 0, spend: 0, conversions: 0, revenue: 0 });

  const avgCtr = totals.impressions > 0 ? ((totals.clicks / totals.impressions) * 100).toFixed(2) : '0';
  const avgRoas = totals.spend > 0 ? (totals.revenue / totals.spend).toFixed(2) : '0';

  // Chart data — group by date
  const chartData = filtered.reduce((acc: any[], p) => {
    const existing = acc.find(a => a.date === p.date);
    if (existing) {
      existing.spend += p.spend;
      existing.clicks += p.clicks;
      existing.conversions += p.conversions;
    } else {
      acc.push({ date: format(new Date(p.date), 'MMM d'), spend: p.spend, clicks: p.clicks, conversions: p.conversions });
    }
    return acc;
  }, []);

  return (
    <div className="space-y-5 pb-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Ads</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Facebook and Google ad performance</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} className="gap-2">
            <RefreshCw className="w-4 h-4" /> Sync
          </Button>
          <Button size="sm" onClick={() => setConnectOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Connect Account
          </Button>
        </div>
      </div>

      {/* Connected accounts */}
      {accounts.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setSelectedAccount('all')}
            className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-all ${selectedAccount === 'all' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>
            All Accounts
          </button>
          {accounts.map(a => (
            <button key={a.id} onClick={() => setSelectedAccount(a.id)}
              className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-all capitalize ${selectedAccount === a.id ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>
              {a.platform}: {a.account_name}
            </button>
          ))}
        </div>
      )}

      {/* Date range */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Last</span>
        {['7', '14', '30', '90'].map(d => (
          <button key={d} onClick={() => setDateRange(d)}
            className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-all ${dateRange === d ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>
            {d}d
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-28 bg-muted animate-pulse rounded-xl" />)}
        </div>
      ) : accounts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 border border-dashed border-border rounded-xl">
          <Target className="w-10 h-10 text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground text-sm mb-1">No ad accounts connected</p>
          <p className="text-xs text-muted-foreground/60 mb-4">Connect Facebook or Google Ads to track performance</p>
          <Button size="sm" onClick={() => setConnectOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Connect Ad Account
          </Button>
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Total Spend"      value={formatCurrency(totals.spend)}               icon={DollarSign}    color="bg-red-500/10 text-red-400" />
            <StatCard label="Impressions"      value={totals.impressions.toLocaleString()}         icon={Eye}           color="bg-blue-500/10 text-blue-400" />
            <StatCard label="Clicks"           value={totals.clicks.toLocaleString()}              icon={MousePointer}  color="bg-yellow-500/10 text-yellow-400" sub={`${avgCtr}% CTR`} />
            <StatCard label="Conversions"      value={totals.conversions.toLocaleString()}         icon={Target}        color="bg-emerald-500/10 text-emerald-400" sub={`${avgRoas}x ROAS`} />
          </div>

          {/* Charts */}
          {chartData.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-card border border-border rounded-xl p-5">
                <p className="text-sm font-semibold text-foreground mb-4">Daily Spend</p>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="spend" name="Spend" fill="#C6A664" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-card border border-border rounded-xl p-5">
                <p className="text-sm font-semibold text-foreground mb-4">Clicks & Conversions</p>
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Line type="monotone" dataKey="clicks" name="Clicks" stroke="#60a5fa" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="conversions" name="Conversions" stroke="#34d399" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Account cards */}
          <div className="space-y-3">
            <p className="text-sm font-semibold text-foreground">Connected Accounts</p>
            {accounts.map(a => (
              <div key={a.id} className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
                <div className={`p-2.5 rounded-lg bg-muted ${a.platform === 'facebook' ? 'text-blue-400' : 'text-red-400'}`}>
                  {a.platform === 'facebook'
                    ? <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
                    : <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                  }
                </div>
                <div className="flex-1">
                  <p className="font-medium text-foreground capitalize">{a.platform} Ads - {a.account_name}</p>
                  <p className="text-xs text-muted-foreground">ID: {a.account_id}</p>
                  {a.last_sync_at && <p className="text-xs text-muted-foreground/60">Last sync: {format(new Date(a.last_sync_at), 'MMM d, h:mm a')}</p>}
                </div>
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              </div>
            ))}
          </div>
        </>
      )}

      <ConnectAccountDialog open={connectOpen} onClose={() => setConnectOpen(false)} onConnected={load} />
    </div>
  );
}