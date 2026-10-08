'use client';

// Wave H5 - "My Leads": shared between the member dashboard (/dashboard/leads)
// and the listing-only portal (/listing-account/leads). Dark portal theme.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { CheckCircle2, Clock, Loader2, MousePointerClick, Inbox, Trophy } from 'lucide-react';
import { toast } from 'sonner';
import { getLeadsDashboard, markLeadContacted, setLeadStatus } from '@/app/actions/networkPortalActions';
import { LEADS_RANGES, type LeadRow, type LeadsDashboardData, type LeadsRange } from '@/lib/network/portal';
import { HUB_ACCENTS, HUB_COPY, isHub } from '@/lib/network/hubs';
import { cn } from '@/lib/utils';

const GOLD = '#C6A664';

function fmtHours(h: number | null): string {
  if (h === null) return '—';
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${h.toFixed(h < 10 ? 1 : 0)} h`;
  return `${(h / 24).toFixed(1)} days`;
}
const sourceLabel = (l: LeadRow) => {
  const parts = [l.utm_source, l.utm_medium].filter(Boolean);
  if (parts.length) return parts.join(' / ');
  return l.source === 'network' ? 'member portal' : l.source === 'hub_page' ? 'hub page' : l.source ?? 'direct';
};

function Tile({ icon: Icon, label, value, sub, accent }: { icon: typeof Inbox; label: string; value: string | number; sub?: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#222] p-4 sm:p-5" data-testid="leads-tile">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/50">{label}</span>
        <Icon className="h-4 w-4" style={{ color: GOLD }} aria-hidden />
      </div>
      <div className={cn('mt-2 text-3xl font-bold tabular-nums', accent ? 'text-[#C6A664]' : 'text-white')}>{value}</div>
      {sub ? <div className="mt-1 text-xs text-white/50">{sub}</div> : null}
    </div>
  );
}

export function LeadsDashboard({ listingId, title = 'My Leads', intro }: { listingId?: string; title?: string; intro?: string }) {
  const [range, setRange] = useState<LeadsRange>('90');
  const [data, setData] = useState<LeadsDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (r: LeadsRange) => {
    setLoading(true);
    const res = await getLeadsDashboard(r, listingId ? { listingId } : undefined);
    if (!res.ok) { toast.error(res.error); setLoading(false); return; }
    setData(res.data); setLoading(false);
  }, [listingId]);
  useEffect(() => { void load(range); }, [range, load]);

  const listingName = useMemo(() => Object.fromEntries((data?.listings ?? []).map((l) => [l.id, l])), [data]);
  const maxSource = Math.max(1, ...(data?.sources.map((s) => s.count) ?? [1]));
  const rangeLabel = LEADS_RANGES.find((r) => r.value === range)?.label.toLowerCase() ?? '';

  const decide = async (lead: LeadRow, status: 'won' | 'lost' | 'new') => {
    setBusy(lead.id);
    const res = await setLeadStatus(lead.id, status);
    setBusy(null);
    if (!res.ok) { toast.error(res.error); return; }
    setData((d) => d ? { ...d, leads: d.leads.map((x) => (x.id === lead.id ? { ...x, ...res.lead } : x)), stats: { ...d.stats, won: d.leads.map((x) => (x.id === lead.id ? { ...x, ...res.lead } : x)).filter((x) => x.status === 'won').length } } : d);
    toast.success(status === 'new' ? 'Reopened' : `Marked ${status}`);
  };
  const contacted = async (lead: LeadRow) => {
    setBusy(lead.id);
    const res = await markLeadContacted(lead.id);
    setBusy(null);
    if (!res.ok) { toast.error(res.error); return; }
    setData((d) => d ? { ...d, leads: d.leads.map((x) => (x.id === lead.id ? { ...x, first_replied_at: res.first_replied_at } : x)) } : d);
    toast.success(res.already ? 'Already marked contacted' : 'Marked contacted');
  };

  const s = data?.stats;
  return (
    <section className="space-y-6" data-testid="leads-dashboard">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white sm:text-3xl">{title}</h1>
          <p className="mt-1 text-sm text-white/55">{intro ?? 'Every intro that came through 704, counted. Mark them Won or Lost so your renewal story writes itself.'}</p>
        </div>
        <label className="flex items-center gap-2 text-xs text-white/60">
          Range
          <select value={range} onChange={(e) => setRange(e.target.value as LeadsRange)} className="rounded-lg border border-white/15 bg-[#222] px-3 py-2 text-sm text-white outline-none focus:border-[#C6A664]" data-testid="leads-range">
            {LEADS_RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </label>
      </div>

      {/* tiles */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="leads-tiles">
        <Tile icon={Inbox} label="Intros received" value={loading ? '…' : s?.intros ?? 0} sub={rangeLabel} />
        <Tile icon={MousePointerClick} label="Profile clicks" value={loading ? '…' : s?.clicks ?? 0} sub={data ? Object.entries(data.clicksByTarget).map(([k, v]) => `${k} ${v}`).join(' · ') || 'website · instagram · phone' : undefined} />
        <Tile icon={Trophy} label="Won" value={loading ? '…' : s?.won ?? 0} accent sub={s && s.intros ? `${Math.round((s.won / s.intros) * 100)}% of intros` : undefined} />
        <Tile icon={Clock} label="Avg reply time" value={loading ? '…' : fmtHours(s?.avgReplyHours ?? null)} sub="pledge: under 2 days" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {/* table */}
        <div className="rounded-xl border border-white/[0.08] bg-[#222] overflow-hidden" data-testid="leads-table">
          <div className="border-b border-white/[0.08] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/50">Intros · {rangeLabel}</div>
          {loading ? (
            <div className="flex items-center gap-2 p-6 text-sm text-white/50"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>
          ) : !data || data.leads.length === 0 ? (
            <div className="p-6 text-sm text-white/50">No intros in this range yet. Your profile links are live and counted; intros show up here the moment someone asks.</div>
          ) : (
            <ul className="divide-y divide-white/[0.06]">
              {data.leads.map((l) => {
                const listing = listingName[l.listing_id];
                const hubAccent = listing && isHub(listing.hub) ? HUB_ACCENTS[listing.hub].soft : GOLD;
                return (
                  <li key={l.id} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] sm:items-center" data-testid="lead-row" data-status={l.status}>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-white">{l.lead_name}</span>
                        {l.status !== 'new' && <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider', l.status === 'won' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-white/60')}>{l.status}</span>}
                        {l.first_replied_at && <span className="inline-flex items-center gap-1 text-[10px] text-white/45"><CheckCircle2 className="h-3 w-3" />contacted</span>}
                      </div>
                      <div className="mt-0.5 text-sm text-white/70">{l.need ?? l.message?.slice(0, 90) ?? <span className="text-white/35">No note</span>}</div>
                      <a className="text-xs text-white/45 underline-offset-2 hover:underline" href={`mailto:${l.lead_email}`}>{l.lead_email}</a>
                      {!listingId && listing && <div className="mt-1 text-[11px]" style={{ color: hubAccent }}>{listing.company_name}</div>}
                    </div>
                    <div className="text-xs text-white/55">
                      <div><span className="text-white/35">Source</span> · {l.source === 'network' ? 'Member portal' : l.source === 'hub_page' ? 'Hub page' : l.source ?? 'Direct'}</div>
                      <div><span className="text-white/35">Came from</span> · {sourceLabel(l)}</div>
                      <div><span className="text-white/35">Date</span> · {format(new Date(l.created_at), 'MMM d, yyyy')} <span className="text-white/30">({formatDistanceToNow(new Date(l.created_at), { addSuffix: true })})</span></div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 sm:flex-col sm:items-stretch">
                      <div className="flex gap-1.5">
                        <button type="button" disabled={busy === l.id} onClick={() => void decide(l, l.status === 'won' ? 'new' : 'won')} className={cn('rounded-full px-3 py-1 text-xs font-semibold transition-colors', l.status === 'won' ? 'bg-emerald-500 text-black' : 'border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/15')} data-testid="btn-won">Won</button>
                        <button type="button" disabled={busy === l.id} onClick={() => void decide(l, l.status === 'lost' ? 'new' : 'lost')} className={cn('rounded-full px-3 py-1 text-xs font-semibold transition-colors', l.status === 'lost' ? 'bg-white/80 text-black' : 'border border-white/25 text-white/70 hover:bg-white/10')} data-testid="btn-lost">Lost</button>
                      </div>
                      {!l.first_replied_at && (
                        <button type="button" disabled={busy === l.id} onClick={() => void contacted(l)} className="text-[11px] text-white/50 underline-offset-2 hover:text-white hover:underline" data-testid="btn-contacted">Mark contacted</button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="space-y-6">
          {/* sources */}
          <div className="rounded-xl border border-white/[0.08] bg-[#222] p-4 sm:p-5" data-testid="leads-sources">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/50">Where your leads come from</h2>
            {!data || data.sources.length === 0 ? (
              <p className="mt-3 text-sm text-white/45">No intros yet in this range.</p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {data.sources.map((src) => (
                  <li key={src.key}>
                    <div className="flex items-center justify-between text-xs text-white/70"><span className="capitalize">{src.key}</span><span className="tabular-nums">{src.count}</span></div>
                    <div className="mt-1 h-2 rounded-full bg-white/[0.06]"><div className="h-2 rounded-full" style={{ width: `${Math.max(6, (src.count / maxSource) * 100)}%`, backgroundColor: GOLD }} /></div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* renewal story */}
          <div className="rounded-xl border p-4 sm:p-5" style={{ borderColor: 'rgba(198,166,100,0.35)', background: 'linear-gradient(180deg, rgba(198,166,100,0.10), rgba(198,166,100,0.03))' }} data-testid="renewal-story">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: GOLD }}>Your renewal story</h2>
            {data ? (
              <p className="mt-2 text-sm leading-relaxed text-white/85">
                In the {rangeLabel.replace('last ', 'last ')}, 704 sent you <strong className="text-white">{s?.intros ?? 0} intro{s?.intros === 1 ? '' : 's'}</strong>
                {s && s.won > 0 ? <> and <strong className="text-white">{s.won}</strong> became paying customers</> : s && s.intros > 0 ? <> - none marked won yet</> : null}.
                {' '}Members clicked through to your website, Instagram or phone <strong className="text-white">{s?.clicks ?? 0} time{s?.clicks === 1 ? '' : 's'}</strong>.
                {s?.avgReplyHours != null ? <> You replied in <strong className="text-white">{fmtHours(s.avgReplyHours)}</strong> on average{s.avgReplyHours <= 48 ? ' - inside the pledge.' : ' - the pledge is under 2 days.'}</> : ' Mark intros contacted to track your reply time.'}
              </p>
            ) : <p className="mt-2 text-sm text-white/45">Loading…</p>}
            {data && data.listings.length > 0 && (
              <p className="mt-3 text-[11px] text-white/45">{data.listings.map((l) => `${l.company_name} · ${isHub(l.hub) ? HUB_COPY[l.hub].name : l.hub}`).join(' · ')}</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
