'use client';

// Wave H6 — /admin/network → Attribution: hub filter, 4 tiles, by-business table
// (laggards highlighted), by-source bars, flags panel. 90d default, 30/year.

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { getAttribution } from '@/app/actions/networkAdminActions';
import { LEADS_RANGES, type LeadsRange } from '@/lib/network/portal';
import { PLEDGE_HOURS, type AdminHubFilter, type Attribution } from '@/lib/network/admin';
import { HUB_ACCENTS, HUB_COPY, VISIBLE_HUBS } from '@/lib/network/hubs';
import { cn } from '@/lib/utils';

export const fmtHours = (h: number | null) => (h === null ? '—' : h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `${h.toFixed(h < 10 ? 1 : 0)} h` : `${(h / 24).toFixed(1)} bd`);

function Tile({ label, value, sub, warn }: { label: string; value: number | string; sub?: string; warn?: boolean }) {
  return (
    <Card className={cn(warn && 'border-amber-500/40')}><CardContent className="p-4" data-testid="attr-tile" data-label={label}>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn('mt-1 text-3xl font-bold tabular-nums', warn && 'text-amber-300')} data-testid="attr-tile-value">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </CardContent></Card>
  );
}

export function NetworkAttributionPanel() {
  const [range, setRange] = useState<LeadsRange>('90');
  const [hub, setHub] = useState<AdminHubFilter>('all');
  const [data, setData] = useState<Attribution | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getAttribution(range, hub).then((r) => { if (cancelled) return; if (!r.ok) toast.error(r.error); else setData(r.data); setLoading(false); });
    return () => { cancelled = true; };
  }, [range, hub]);

  const maxSrc = Math.max(1, ...(data?.bySource.map((s) => s.count) ?? [1]));
  const rangeLabel = LEADS_RANGES.find((r) => r.value === range)?.label.toLowerCase();

  return (
    <div className="space-y-5" data-testid="admin-attribution" data-range={range} data-hub={hub}>
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs text-muted-foreground">Hub
          <select value={hub} onChange={(e) => setHub(e.target.value as AdminHubFilter)} className="ml-2 rounded-md border border-border bg-background px-2 py-1.5 text-sm" data-testid="attr-hub">
            <option value="all">All hubs</option>
            {VISIBLE_HUBS.map((h) => <option key={h} value={h}>{HUB_COPY[h].name}</option>)}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">Range
          <select value={range} onChange={(e) => setRange(e.target.value as LeadsRange)} className="ml-2 rounded-md border border-border bg-background px-2 py-1.5 text-sm" data-testid="attr-range">
            {LEADS_RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </label>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        <span className="ml-auto text-xs text-muted-foreground">Pledge: reply within 2 business days ({PLEDGE_HOURS} business hours)</span>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="attr-tiles">
        <Tile label="Leads delivered" value={data?.tiles.leads ?? '…'} sub={rangeLabel} />
        <Tile label="Marked won" value={data?.tiles.won ?? '…'} sub={data && data.tiles.leads ? `${Math.round((data.tiles.won / data.tiles.leads) * 100)}% of leads` : undefined} />
        <Tile label="Tracked clicks" value={data?.tiles.clicks ?? '…'} sub="website · instagram · phone" />
        <Tile label="Awaiting-reply flags" value={data?.tiles.flags ?? '…'} sub="unanswered > 2 business days" warn={(data?.tiles.flags ?? 0) > 0} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <Card><CardContent className="p-0" data-testid="attr-by-business">
          <div className="border-b border-border px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">By business</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground"><th className="px-4 py-2">Business</th><th className="px-2 py-2">Hub</th><th className="px-2 py-2 text-right">Leads</th><th className="px-2 py-2 text-right">Won</th><th className="px-4 py-2 text-right">Avg reply</th></tr></thead>
              <tbody>
                {!data || data.byBusiness.length === 0 ? <tr><td colSpan={5} className="px-4 py-6 text-muted-foreground">{loading ? 'Loading…' : 'No listings on this hub.'}</td></tr> : data.byBusiness.map((b) => (
                  <tr key={b.listing.id} className={cn('border-t border-border', b.laggard && 'bg-amber-500/10')} data-testid="attr-biz-row" data-laggard={b.laggard} data-listing={b.listing.slug}>
                    <td className="px-4 py-2.5"><div className="flex items-center gap-2"><span className="font-medium">{b.listing.company_name}</span>{b.laggard && <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300"><AlertTriangle className="h-3 w-3" />{b.laggardWhy.includes('open-flags') ? `${b.openFlags} waiting` : 'slow replies'}</span>}</div><div className="text-[11px] text-muted-foreground">{b.listing.kind} · {b.listing.status}</div></td>
                    <td className="px-2 py-2.5"><span className="inline-flex items-center gap-1.5 text-xs"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: HUB_ACCENTS[b.listing.hub].accent }} />{HUB_COPY[b.listing.hub].name}</span></td>
                    <td className="px-2 py-2.5 text-right tabular-nums" data-testid="biz-leads">{b.leads}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums" data-testid="biz-won">{b.won}</td>
                    <td className={cn('px-4 py-2.5 text-right tabular-nums', b.avgReplyHours !== null && b.avgReplyHours > PLEDGE_HOURS && 'text-amber-300 font-semibold')} data-testid="biz-avg">{fmtHours(b.avgReplyHours)}{b.replied ? <span className="ml-1 text-[10px] text-muted-foreground">({b.replied})</span> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent></Card>

        <div className="space-y-4">
          <Card><CardContent className="p-4" data-testid="attr-by-source">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">By lead source</div>
            <ul className="mt-3 space-y-2.5">
              {(data?.bySource ?? []).map((s) => (
                <li key={s.bucket} data-testid={`src-${s.bucket.replace(' ', '-')}`}>
                  <div className="flex items-center justify-between text-xs"><span className="capitalize">{s.bucket}</span><span className="tabular-nums" data-testid="src-count">{s.count}</span></div>
                  <div className="mt-1 h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${s.count ? Math.max(4, (s.count / maxSrc) * 100) : 0}%` }} /></div>
                </li>
              ))}
            </ul>
          </CardContent></Card>

          <Card className={cn((data?.flags.length ?? 0) > 0 && 'border-amber-500/40')}><CardContent className="p-4" data-testid="attr-flags">
            <div className="flex items-center justify-between"><span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Flags</span><span className="text-xs text-muted-foreground">{data?.flags.length ?? 0} business{data?.flags.length === 1 ? '' : 'es'}</span></div>
            {!data || data.flags.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">Everyone is inside the pledge.</p> : (
              <ul className="mt-3 divide-y divide-border">
                {data.flags.map((f) => (
                  <li key={f.listing.id} className="flex items-start justify-between gap-3 py-2 text-sm" data-testid="flag-row" data-listing={f.listing.slug}>
                    <div><div className="font-medium">{f.listing.company_name}</div><div className="text-[11px] text-muted-foreground">{HUB_COPY[f.listing.hub].name}{f.lastNudgeAt ? ` · nudge sent ${format(new Date(f.lastNudgeAt), 'MMM d')}` : ' · not nudged yet'}</div></div>
                    <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-300 tabular-nums" data-testid="flag-count">{f.openFlags} open</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent></Card>
        </div>
      </div>
      <div className="flex justify-end"><Button size="sm" variant="ghost" onClick={() => { setRange((r) => r); setHub((h) => h); setLoading(true); getAttribution(range, hub).then((r) => { if (r.ok) setData(r.data); setLoading(false); }); }}><RefreshCw className="h-4 w-4 mr-1" />Refresh</Button></div>
    </div>
  );
}
