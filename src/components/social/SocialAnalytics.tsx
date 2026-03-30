'use client';

import { useEffect, useMemo, useState } from 'react';
import { getPostAnalytics, getSocialAccounts, getAudienceGrowth } from '@/lib/social/queries';
import { getTopPerformingPosts, getPlatformBreakdown } from '@/lib/social/analytics';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
} from 'recharts';
import { format } from 'date-fns';

export function SocialAnalytics({ workspaceId }: { workspaceId: string }) {
  const [period, setPeriod] = useState(30);
  const [plat, setPlat] = useState<string>('all');
  const [accountId, setAccountId] = useState<string>('all');
  const [accounts, setAccounts] = useState<{ id: string; platform: string; account_name: string }[]>([]);
  const [metrics, setMetrics] = useState<Record<string, unknown>[]>([]);
  const [top, setTop] = useState<Record<string, unknown>[]>([]);
  const [breakdown, setBreakdown] = useState<Record<string, { reach: number; engagement: number; posts: number }>>({});
  const [growthSeries, setGrowthSeries] = useState<{ date: string; followers: number }[]>([]);

  useEffect(() => {
    getSocialAccounts(workspaceId).then(setAccounts);
  }, [workspaceId]);

  useEffect(() => {
    (async () => {
      const m = await getPostAnalytics(workspaceId, {
        platform: plat === 'all' ? undefined : plat,
        accountId: accountId === 'all' ? undefined : accountId,
      });
      setMetrics(m);
      const t = await getTopPerformingPosts(supabase, workspaceId, period, 6).catch(() => []);
      setTop(t as Record<string, unknown>[]);
      const b = await getPlatformBreakdown(supabase, workspaceId, period).catch(() => ({}));
      setBreakdown(b as Record<string, { reach: number; engagement: number; posts: number }>);
    })();
  }, [workspaceId, period, plat, accountId]);

  useEffect(() => {
    if (accountId === 'all') {
      setGrowthSeries([]);
      return;
    }
    getAudienceGrowth(accountId, period).then(rows =>
      setGrowthSeries(
        (rows ?? []).map(r => ({
          date: r.date,
          followers: r.follower_count ?? 0,
        }))
      )
    );
  }, [accountId, period]);

  const kpis = useMemo(() => {
    let reach = 0;
    let impressions = 0;
    let eng = 0;
    for (const m of metrics) {
      reach += (m.reach as number) ?? 0;
      impressions += (m.impressions as number) ?? 0;
      eng +=
        ((m.likes as number) ?? 0) +
        ((m.comments as number) ?? 0) +
        ((m.shares as number) ?? 0) +
        ((m.saves as number) ?? 0);
    }
    const avgRate =
      metrics.length && reach
        ? (eng / reach) * 100
        : 0;
    return { reach, impressions, eng, avgRate, posts: top.length };
  }, [metrics, top.length]);

  const barData = Object.entries(breakdown).map(([name, v]) => ({
    name,
    reach: v.reach,
    engagement: v.engagement,
  }));

  const heat = useMemo(() => {
    const grid: number[][] = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
    for (const m of metrics) {
      const sync = m.last_synced_at as string | undefined;
      if (!sync) continue;
      const d = new Date(sync);
      grid[d.getUTCDay()][d.getUTCHours()] += Number(m.engagement_rate ?? 0);
    }
    return grid;
  }, [metrics]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 items-center">
        <Button type="button" size="sm" variant={period === 7 ? 'secondary' : 'ghost'} onClick={() => setPeriod(7)}>
          7d
        </Button>
        <Button type="button" size="sm" variant={period === 30 ? 'secondary' : 'ghost'} onClick={() => setPeriod(30)}>
          30d
        </Button>
        <Button type="button" size="sm" variant={period === 90 ? 'secondary' : 'ghost'} onClick={() => setPeriod(90)}>
          90d
        </Button>
        <select
          value={plat}
          onChange={e => setPlat(e.target.value)}
          className="h-8 text-xs rounded-md border border-border bg-background px-2 ml-2"
        >
          <option value="all">All platforms</option>
          {['instagram', 'facebook', 'linkedin', 'tiktok', 'youtube', 'pinterest', 'snapchat', 'twitter'].map(p => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select
          value={accountId}
          onChange={e => setAccountId(e.target.value)}
          className="h-8 text-xs rounded-md border border-border bg-background px-2"
        >
          <option value="all">All accounts</option>
          {accounts.map(a => (
            <option key={a.id} value={a.id}>
              {a.account_name}
            </option>
          ))}
        </select>
        <Button type="button" variant="outline" size="sm" className="h-8 text-xs ml-auto" disabled>
          Export PDF (placeholder)
        </Button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {[
          { label: 'Total reach', value: kpis.reach.toLocaleString() },
          { label: 'Impressions', value: kpis.impressions.toLocaleString() },
          { label: 'Engagements', value: kpis.eng.toLocaleString() },
          { label: 'Avg engagement rate', value: `${kpis.avgRate.toFixed(2)}%` },
          { label: 'Followers (selected acct)', value: growthSeries.at(-1)?.followers?.toLocaleString() ?? '—' },
          { label: 'Top posts sampled', value: String(top.length) },
        ].map(k => (
          <div key={k.label} className="border border-border rounded-xl p-4 bg-card">
            <p className="text-xs text-muted-foreground">{k.label}</p>
            <p className="text-xl font-semibold text-foreground mt-1">{k.value}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="border border-border rounded-xl p-4 bg-card h-72">
          <p className="text-sm font-medium text-foreground mb-2">Platform comparison</p>
          <ResponsiveContainer width="100%" height="85%">
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} />
              <YAxis tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} />
              <Tooltip
                contentStyle={{
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                }}
              />
              <Bar dataKey="reach" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="engagement" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="border border-border rounded-xl p-4 bg-card h-72">
          <p className="text-sm font-medium text-foreground mb-2">Engagement over syncs</p>
          <ResponsiveContainer width="100%" height="85%">
            <LineChart data={metrics.slice(0, 20).map((m, i) => ({ i, er: Number(m.engagement_rate ?? 0) }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="i" hide />
              <YAxis tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} />
              <Tooltip
                contentStyle={{
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                }}
              />
              <Line type="monotone" dataKey="er" stroke="var(--chart-3)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-foreground mb-2">Top performing posts</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {top.map(p => (
            <div key={p.id as string} className="border border-border rounded-xl overflow-hidden bg-card">
              {(p.media_urls as string[])?.[0] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={(p.media_urls as string[])[0]} alt="" className="h-28 w-full object-cover bg-muted" />
              )}
              <div className="p-3 space-y-1">
                <p className="text-xs text-muted-foreground line-clamp-2">{p.caption as string}</p>
                <p className="text-[10px] text-muted-foreground">{format(new Date(p.created_at as string), 'MMM d')}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="border border-border rounded-xl p-4 bg-card">
        <p className="text-sm font-medium text-foreground mb-2">Audience growth (selected account)</p>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={growthSeries}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="date" tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} />
            <YAxis tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} />
            <Tooltip
              contentStyle={{
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 8,
              }}
            />
            <Line type="monotone" dataKey="followers" stroke="var(--chart-4)" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="border border-border rounded-xl p-4 bg-card overflow-x-auto">
        <p className="text-sm font-medium text-foreground mb-2">Engagement heatmap (UTC hour × day)</p>
        <div className="inline-grid gap-px bg-border" style={{ gridTemplateColumns: `repeat(24, minmax(0,1fr))` }}>
          {heat.flatMap((row, di) =>
            row.map((v, hi) => (
              <div
                key={`${di}-${hi}`}
                className="h-4 w-4 sm:w-5 sm:h-5"
                style={{ background: `color-mix(in oklch, var(--chart-1) ${Math.min(100, v * 20)}%, var(--muted))` }}
                title={`d${di} h${hi}: ${v}`}
              />
            ))
          )}
        </div>
      </div>

      <div className="border border-border rounded-xl p-4 bg-card">
        <p className="text-sm font-medium text-foreground mb-2">Content type breakdown</p>
        <p className="text-xs text-muted-foreground">
          Image vs video vs carousel performance will populate as <code className="text-primary">media_types</code> and metrics sync
          from platforms.
        </p>
      </div>
    </div>
  );
}
