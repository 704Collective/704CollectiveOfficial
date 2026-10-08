'use client';

// Wave H5 - The Network inside the portal: hub tabs with per-hub accents on the
// dark theme, live listings grid (EXCLUSIVE / VETTED), request-intro in place.

import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ExternalLink, Loader2, ShieldCheck, X } from 'lucide-react';
import { toast } from 'sonner';
import { getNetworkView, requestPortalIntro } from '@/app/actions/networkPortalActions';
import type { Caller, NetworkViewListing } from '@/lib/network/portal';
import { HUB_ACCENTS, HUB_COPY, VISIBLE_HUBS, type HubSlug } from '@/lib/network/hubs';
import { cn } from '@/lib/utils';

type Tab = 'all' | HubSlug;

export function NetworkView({ publicLinks = true }: { publicLinks?: boolean }) {
  const [tab, setTab] = useState<Tab>('all');
  const [listings, setListings] = useState<NetworkViewListing[] | null>(null);
  const [me, setMe] = useState<Caller | null>(null);
  const [intro, setIntro] = useState<NetworkViewListing | null>(null);
  const [form, setForm] = useState({ need: '', message: '', phone: '' });
  const [busy, setBusy] = useState(false);
  const [sentFor, setSentFor] = useState<Record<string, true>>({});
  const [publicLive, setPublicLive] = useState(false);

  useEffect(() => { (async () => { const r = await getNetworkView(); if (!r.ok) { toast.error(r.error); return; } setListings(r.listings); setMe(r.caller); setPublicLive(r.publicLive); })(); }, []);

  const visible = useMemo(() => (listings ?? []).filter((l) => tab === 'all' || l.hub === tab), [listings, tab]);
  const counts = useMemo(() => Object.fromEntries(VISIBLE_HUBS.map((h) => [h, (listings ?? []).filter((l) => l.hub === h).length])), [listings]);
  const accent = tab === 'all' ? '#C6A664' : HUB_ACCENTS[tab].accent;
  const soft = tab === 'all' ? '#C6A664' : HUB_ACCENTS[tab].soft;
  const showPublic = publicLinks && publicLive;

  const submit = async () => {
    if (!intro) return;
    setBusy(true);
    const r = await requestPortalIntro(intro.id, form);
    setBusy(false);
    if (!r.ok) { toast.error(r.error); return; }
    setSentFor((s) => ({ ...s, [intro.id]: true }));
    toast.success(`Intro sent to ${intro.company_name}`);
    setIntro(null); setForm({ need: '', message: '', phone: '' });
  };

  return (
    <section className="space-y-6" data-testid="network-view" data-tab={tab}>
      <div>
        <h1 className="text-2xl font-bold text-white sm:text-3xl">The Network</h1>
        <p className="mt-1 text-sm text-white/55">One vetted business per category on each hub. Ask for an intro here and it goes straight to them with your name on it.</p>
      </div>

      {/* hub tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide" role="tablist" aria-label="Hubs" data-testid="hub-tabs">
        {([['all', 'All hubs'] as const, ...VISIBLE_HUBS.map((h) => [h, HUB_COPY[h].name] as const)]).map(([key, label]) => {
          const active = tab === key;
          const a = key === 'all' ? '#C6A664' : HUB_ACCENTS[key].accent;
          const s = key === 'all' ? '#C6A664' : HUB_ACCENTS[key].soft;
          return (
            <button key={key} type="button" role="tab" aria-selected={active} data-testid={`hub-tab-${key}`} onClick={() => setTab(key)}
              className={cn('shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition-colors', active ? 'text-black' : 'text-white/70 hover:text-white')}
              style={active ? { backgroundColor: s, borderColor: s } : { borderColor: `${s}55` }}>
              {label}{key !== 'all' && <span className="ml-1.5 text-xs opacity-70">{counts[key] ?? 0}</span>}
            </button>
          );
        })}
      </div>

      {/* hub band */}
      {tab !== 'all' && (
        <div className="rounded-xl border p-4 sm:p-5" style={{ borderColor: `${soft}55`, background: `linear-gradient(135deg, ${accent}33, ${accent}0D)` }} data-testid="hub-band">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: soft }}>{HUB_COPY[tab].kicker}</p>
          <p className="mt-1 text-lg font-semibold text-white">{HUB_COPY[tab].h1}</p>
          <p className="mt-1 text-sm text-white/65">{HUB_COPY[tab].promise}</p>
        </div>
      )}

      {/* grid */}
      {listings === null ? (
        <div className="flex items-center gap-2 text-sm text-white/50"><Loader2 className="h-4 w-4 animate-spin" />Loading the room…</div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/15 p-8 text-center text-sm text-white/50">No live listings on this hub yet.</div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="network-grid">
          {visible.map((l) => {
            const a = HUB_ACCENTS[l.hub];
            return (
              <li key={l.id} className="flex flex-col rounded-xl border border-white/[0.08] bg-[#222] p-4" data-testid="network-card" data-kind={l.kind} data-hub={l.hub} style={{ borderTop: `3px solid ${a.accent}` }}>
                <div className="flex items-start justify-between gap-2">
                  <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em]', l.kind === 'seat' ? 'text-black' : 'border text-white/80')} style={l.kind === 'seat' ? { backgroundColor: a.soft } : { borderColor: `${a.soft}88` }} data-testid="kind-label">
                    {l.kind === 'seat' ? 'Exclusive' : 'Vetted'}
                  </span>
                  <span className="text-[11px] text-white/45">{HUB_COPY[l.hub].name}</span>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  {l.logo_url ? <img src={l.logo_url} alt="" className="h-10 w-10 rounded-lg object-cover bg-white/5" /> : <div className="flex h-10 w-10 items-center justify-center rounded-lg text-sm font-bold text-black" style={{ backgroundColor: a.soft }}>{l.company_name.slice(0, 1)}</div>}
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold text-white">{l.company_name}</h3>
                    <p className="truncate text-xs text-white/50">{l.category?.label ?? '—'}{l.neighborhood ? ` · ${l.neighborhood}` : ''}</p>
                  </div>
                </div>
                {l.hook && <p className="mt-3 text-sm text-white/70">{l.hook}</p>}
                <div className="mt-auto flex items-center justify-between gap-2 pt-4">
                  <span className="inline-flex items-center gap-1 text-[11px] text-white/45"><ShieldCheck className="h-3.5 w-3.5" style={{ color: a.soft }} />{l.verified_at ? `Verified ${format(new Date(l.verified_at), 'MMM yyyy')}` : 'Passed the 704 Review'}</span>
                  <div className="flex items-center gap-2">
                    {showPublic && <a href={`/${l.hub}/${l.slug}`} target="_blank" rel="noreferrer" className="text-white/50 hover:text-white" aria-label={`View ${l.company_name} profile`}><ExternalLink className="h-4 w-4" /></a>}
                    {sentFor[l.id] ? (
                      <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300">Intro sent</span>
                    ) : (
                      <button type="button" onClick={() => setIntro(l)} className="rounded-full px-3 py-1.5 text-xs font-semibold text-black transition-opacity hover:opacity-90" style={{ backgroundColor: a.soft }} data-testid="btn-intro">Request intro</button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* intro sheet */}
      {intro && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="intro-title" data-testid="intro-dialog" onClick={() => !busy && setIntro(null)}>
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#1F1F1F] p-5 shadow-2xl" onClick={(e) => e.stopPropagation()} style={{ borderTop: `3px solid ${HUB_ACCENTS[intro.hub].accent}` }}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: HUB_ACCENTS[intro.hub].soft }}>{HUB_COPY[intro.hub].name}</p>
                <h2 id="intro-title" className="text-lg font-bold text-white">Intro to {intro.company_name}</h2>
              </div>
              <button type="button" onClick={() => setIntro(null)} className="text-white/50 hover:text-white" aria-label="Close"><X className="h-5 w-5" /></button>
            </div>
            <p className="mt-2 text-sm text-white/60">We send this as <strong className="text-white/85">{me?.fullName || me?.email}</strong> ({me?.email}). They reply to you directly.</p>
            <div className="mt-4 space-y-3">
              <label className="block text-xs text-white/60">What do you need?
                <input value={form.need} onChange={(e) => setForm({ ...form, need: e.target.value })} placeholder="e.g. a sauna membership for two" className="mt-1 w-full rounded-lg border border-white/15 bg-[#222] px-3 py-2 text-sm text-white outline-none focus:border-[#C6A664]" data-testid="intro-need" />
              </label>
              <label className="block text-xs text-white/60">Anything they should know
                <textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} rows={3} placeholder="Timing, budget, the shape of the ask." className="mt-1 w-full rounded-lg border border-white/15 bg-[#222] px-3 py-2 text-sm text-white outline-none focus:border-[#C6A664]" data-testid="intro-message" />
              </label>
              <label className="block text-xs text-white/60">Phone (optional)
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1 w-full rounded-lg border border-white/15 bg-[#222] px-3 py-2 text-sm text-white outline-none focus:border-[#C6A664]" />
              </label>
            </div>
            <button type="button" disabled={busy} onClick={() => void submit()} className="mt-4 w-full rounded-full py-2.5 text-sm font-semibold text-black disabled:opacity-60" style={{ backgroundColor: HUB_ACCENTS[intro.hub].soft }} data-testid="intro-submit">
              {busy ? 'Sending…' : `Send intro request`}
            </button>
            <p className="mt-2 text-center text-[11px] text-white/40">Counted for them as a 704 intro.</p>
          </div>
        </div>
      )}
    </section>
  );
}
