'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminLayout } from '@/components/AdminLayout';
import { useAuth } from '@/hooks/useAuth';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Loader2 } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type Metrics = {
  configured: boolean;
  cacheHitRate: number | null;
  totalCachedKeys: number;
  rateLimitHitsToday: number;
  topIps: { ip: string; count: number }[];
  recentRateLimitEvents: { ip: string; route: string; timestamp: string; count: number }[];
};

export default function AdminUpstashPage() {
  const router = useRouter();
  const { isAdmin, loading } = useAuth();
  usePageTitle('Upstash');

  const [data, setData] = useState<Metrics | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (!loading && !isAdmin) router.replace('/admin');
  }, [loading, isAdmin, router]);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    setFetching(true);
    (async () => {
      try {
        const res = await fetch('/api/admin/upstash-metrics');
        if (!res.ok) {
          if (!cancelled) setErr('Upstash metrics unavailable - will activate after DNS cutover.');
          return;
        }
        const j = (await res.json()) as Metrics;
        if (!cancelled) {
          setData(j);
          setErr(null);
        }
      } catch {
        if (!cancelled) setErr('Upstash metrics unavailable - will activate after DNS cutover.');
      } finally {
        if (!cancelled) setFetching(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  if (loading || !isAdmin) {
    return (
      <AdminLayout title="Upstash">
        <div className="flex items-center justify-center min-h-[40vh] text-muted-foreground">
          {loading ? <Loader2 className="h-8 w-8 animate-spin" /> : null}
        </div>
      </AdminLayout>
    );
  }

  const notConfigured = data && !data.configured;

  return (
    <AdminLayout title="Upstash">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Upstash Redis</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Feed cache effectiveness, key volume, and rate-limit signals from Redis.
          </p>
        </div>

        {fetching && !data && !err ? (
          <div className="flex justify-center py-12 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : null}

        {err && <p className="text-sm text-muted-foreground">{err}</p>}

        {notConfigured && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-6 py-8 text-center space-y-2">
            <h2 className="text-lg font-semibold text-foreground">Upstash not configured</h2>
            <p className="text-sm text-muted-foreground max-w-lg mx-auto">
              Set valid <code className="text-xs bg-muted px-1 rounded">UPSTASH_REDIS_REST_URL</code> (must start with{' '}
              <code className="text-xs bg-muted px-1 rounded">https://</code>) and{' '}
              <code className="text-xs bg-muted px-1 rounded">UPSTASH_REDIS_REST_TOKEN</code> in your environment. Until
              then, feed caching and Upstash rate limiting are skipped and the app runs without Redis.
            </p>
          </div>
        )}

        {data?.configured === true && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Cache hit rate"
                value={data.cacheHitRate != null ? `${data.cacheHitRate}%` : '-'}
                hint="Feed requests served from cache vs database"
              />
              <StatCard
                label="Total cached keys"
                value={String(data.totalCachedKeys)}
                hint="Active feed:* keys in Redis"
              />
              <StatCard
                label="Rate limit hits today"
                value={String(data.rateLimitHitsToday)}
                hint="429 responses recorded today"
              />
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Top rate limited IPs</p>
                <p className="text-xs text-muted-foreground mt-1 mb-3">Today (from recent event log)</p>
                <ul className="space-y-1.5 text-sm">
                  {data.topIps.length === 0 ? (
                    <li className="text-muted-foreground">No data</li>
                  ) : (
                    data.topIps.map((r) => (
                      <li key={r.ip} className="flex justify-between gap-2 font-mono text-xs">
                        <span className="truncate">{r.ip}</span>
                        <span className="shrink-0 text-muted-foreground">{r.count}</span>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <h2 className="font-semibold text-sm">Recent rate limit events</h2>
                <p className="text-xs text-muted-foreground">Aggregated by IP and route</p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>IP</TableHead>
                    <TableHead>Route</TableHead>
                    <TableHead>Last seen</TableHead>
                    <TableHead className="text-right">Count</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recentRateLimitEvents.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        No events recorded yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.recentRateLimitEvents.map((r, i) => (
                      <TableRow key={`${r.ip}-${r.route}-${i}`}>
                        <TableCell className="font-mono text-xs">{r.ip}</TableCell>
                        <TableCell className="text-xs max-w-[200px] truncate">{r.route || '-'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {r.timestamp || '-'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{r.count}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold mt-2 tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground mt-2">{hint}</p>
    </div>
  );
}
