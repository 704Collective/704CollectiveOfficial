'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { format, formatDistanceToNow, isPast } from 'date-fns';
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, RefreshCw, Store } from 'lucide-react';
import { toast } from 'sonner';
import { AdminLayout } from '@/components/AdminLayout';
import { useAuth } from '@/hooks/useAuth';
import { usePageTitle } from '@/hooks/usePageTitle';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { approveAndSendPaymentLink, declineApplication, reopenApplication, waitlistApplication } from '@/app/actions/networkAdminActions';
import { HUB_COPY, isHub } from '@/lib/network/hubs';

type AppStatus = 'pending' | 'reviewing' | 'waitlisted' | 'approved' | 'declined';
type ApplicationRow = {
  id: string; business_name: string; hub: string; category_text: string; website_url: string | null; instagram: string | null; google_profile_url: string | null;
  years_in_business: string | null; why_704: string | null; heard_about: string | null; contact_name: string | null; contact_email: string; contact_phone: string | null;
  status: AppStatus; review_checklist: Record<string, boolean> | null; review_notes: string | null; decline_reason: string | null;
  approved_payment_link_sent_at: string | null; payment_link_url: string | null; payment_link_expires_at: string | null; converted_listing_id: string | null;
  utm_source: string | null; utm_campaign: string | null; landing_path: string | null; created_at: string;
};
type Conflict = { seats: { company_name: string; slug: string }[]; spotlights: { company_name: string; slug: string }[]; matchedCategories: string[] };

const PILLARS: { key: string; label: string; hint: string }[] = [
  { key: 'legitimacy', label: 'Legitimacy', hint: 'Licensed/insured where it matters, real place, real person' },
  { key: 'reputation', label: 'Reputation', hint: 'Reviews read in full, patterns weighed, complaints traced' },
  { key: 'member_signal', label: 'Member signal', hint: 'Two 704 members who paid them, contacted' },
  { key: 'transparency', label: 'Transparency', hint: 'Pricing findable, terms readable, no bait' },
  { key: 'responsiveness', label: 'Responsiveness', hint: 'Replies to an intro inside 48h (tested)' },
];

const STATUS_STYLE: Record<AppStatus, string> = {
  pending: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  reviewing: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  waitlisted: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
  approved: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  declined: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
};

const hubLabel = (h: string) => (isHub(h) ? HUB_COPY[h].name : h);
const extUrl = (v: string | null, kind: 'web' | 'ig' | 'google') => {
  if (!v) return null;
  if (kind === 'ig') return v.startsWith('http') ? v : `https://instagram.com/${v.replace(/^@/, '')}`;
  return v.startsWith('http') ? v : `https://${v}`;
};

export default function AdminNetworkPage() {
  usePageTitle('Network · Applications');
  const { isAdmin, isSuperAdmin, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<ApplicationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'open' | 'waitlisted' | 'approved' | 'declined'>('open');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [notes, setNotes] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('network_listing_applications').select('*').order('created_at', { ascending: false });
    if (error) toast.error(`Could not load applications: ${error.message}`);
    setRows((data ?? []) as ApplicationRow[]);
    setLoading(false);
  }, []);
  useEffect(() => { if (!authLoading && (isAdmin || isSuperAdmin)) void load(); }, [authLoading, isAdmin, isSuperAdmin, load]);

  const visible = useMemo(() => rows.filter((r) => filter === 'open' ? r.status === 'pending' || r.status === 'reviewing' : r.status === filter), [rows, filter]);
  const selected = rows.find((r) => r.id === selectedId) ?? null;

  // Category conflict: live seats/spotlights on this hub whose category label matches category_text (ilike).
  useEffect(() => {
    if (!selected) { setConflict(null); return; }
    setNotes(selected.review_notes ?? '');
    setDeclineReason(selected.decline_reason ?? '');
    let cancelled = false;
    (async () => {
      const needle = selected.category_text.trim();
      const { data: cats } = await supabase.from('network_categories').select('id, label').eq('hub', selected.hub).ilike('label', `%${needle}%`);
      const ids = (cats ?? []).map((c) => c.id);
      if (ids.length === 0) { if (!cancelled) setConflict({ seats: [], spotlights: [], matchedCategories: [] }); return; }
      const { data: live } = await supabase.from('network_listings').select('kind, company_name, slug').eq('hub', selected.hub).eq('status', 'live').in('category_id', ids);
      if (cancelled) return;
      const l = live ?? [];
      setConflict({ seats: l.filter((x) => x.kind === 'seat'), spotlights: l.filter((x) => x.kind === 'spotlight'), matchedCategories: (cats ?? []).map((c) => c.label) });
    })();
    return () => { cancelled = true; };
  }, [selected?.id, selected?.hub, selected?.category_text]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = async (id: string, values: Partial<ApplicationRow>) => {
    const { error } = await supabase.from('network_listing_applications').update(values).eq('id', id);
    if (error) { toast.error(error.message); return false; }
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...values } : r)));
    return true;
  };

  const toggleCheck = async (key: string) => {
    if (!selected) return;
    const next = { ...(selected.review_checklist ?? {}), [key]: !selected.review_checklist?.[key] };
    const values: Partial<ApplicationRow> = { review_checklist: next };
    if (selected.status === 'pending') values.status = 'reviewing';
    await patch(selected.id, values);
  };
  const saveNotes = async () => { if (selected) { if (await patch(selected.id, { review_notes: notes })) toast.success('Notes saved'); } };

  const run = async (label: string, fn: () => Promise<{ ok: boolean; error?: string }>) => {
    if (!selected) return;
    setBusy(label);
    const r = await fn();
    setBusy(null);
    if (!r.ok) { toast.error(r.error ?? `${label} failed`); return; }
    toast.success(`${label} done`);
    await load();
  };

  const checksPassed = selected ? PILLARS.filter((p) => selected.review_checklist?.[p.key]).length : 0;
  const linkExpired = selected?.payment_link_expires_at ? isPast(new Date(selected.payment_link_expires_at)) : false;

  if (!authLoading && !isAdmin && !isSuperAdmin) {
    return <AdminLayout title="Network"><div className="p-8 text-sm text-muted-foreground">Admin access required.</div></AdminLayout>;
  }

  return (
    <AdminLayout title="Network">
      <div className="p-4 sm:p-6 space-y-5" data-testid="admin-network">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2"><Store className="w-6 h-6" /> Network applications</h1>
            <p className="text-sm text-muted-foreground">Get Listed applications. Run the 704 Review, flag category conflicts, then approve, waitlist or decline.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />Refresh</Button>
        </div>

        <div className="flex gap-2 flex-wrap" role="tablist" aria-label="Filter">
          {([['open', 'Pending & reviewing'], ['waitlisted', 'Waitlisted'], ['approved', 'Approved'], ['declined', 'Declined']] as const).map(([k, label]) => (
            <Button key={k} role="tab" aria-selected={filter === k} variant={filter === k ? 'default' : 'outline'} size="sm" onClick={() => { setFilter(k); setSelectedId(null); }}>
              {label} <span className="ml-1.5 text-xs opacity-70">{rows.filter((r) => k === 'open' ? r.status === 'pending' || r.status === 'reviewing' : r.status === k).length}</span>
            </Button>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          {/* list */}
          <Card><CardContent className="p-0 divide-y divide-border" data-testid="app-list">
            {loading && <div className="p-6 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Loading…</div>}
            {!loading && visible.length === 0 && <div className="p-6 text-sm text-muted-foreground">Nothing here.</div>}
            {visible.map((r) => (
              <button key={r.id} type="button" onClick={() => setSelectedId(r.id)} className={`w-full text-left p-4 hover:bg-muted/40 transition-colors ${selectedId === r.id ? 'bg-muted/50' : ''}`} data-testid="app-row" data-status={r.status}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium truncate">{r.business_name}</span>
                  <Badge variant="outline" className={`text-[10px] uppercase tracking-wider ${STATUS_STYLE[r.status]}`}>{r.status === 'reviewing' && r.approved_payment_link_sent_at ? 'link sent' : r.status}</Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-1 truncate">{hubLabel(r.hub)} · {r.category_text} · {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</div>
              </button>
            ))}
          </CardContent></Card>

          {/* detail */}
          <Card><CardContent className="p-5 space-y-5" data-testid="app-detail">
            {!selected && <p className="text-sm text-muted-foreground">Select an application.</p>}
            {selected && (
              <>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-xl font-semibold">{selected.business_name}</h2>
                      <Badge variant="outline" className={`text-[10px] uppercase tracking-wider ${STATUS_STYLE[selected.status]}`}>{selected.status}</Badge>
                      {selected.converted_listing_id && <Badge variant="outline" className="text-[10px] uppercase tracking-wider bg-emerald-500/15 text-emerald-300 border-emerald-500/30">listing created</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{hubLabel(selected.hub)} · {selected.category_text} · applied {format(new Date(selected.created_at), 'MMM d, yyyy')}</p>
                  </div>
                </div>

                {/* conflict */}
                {conflict && conflict.seats.length > 0 && (
                  <div className="rounded-lg border border-rose-500/50 bg-rose-500/10 p-3 text-sm" role="alert" data-testid="conflict-seat">
                    <div className="flex items-center gap-2 font-semibold text-rose-300 uppercase tracking-wider text-xs"><AlertTriangle className="w-4 h-4" /> Category review</div>
                    <p className="mt-1">A live exclusive seat already holds this category on {hubLabel(selected.hub)}: <strong>{conflict.seats.map((s) => s.company_name).join(', ')}</strong>. This applicant can only be a spotlight, or the waitlist for the seat.</p>
                  </div>
                )}
                {conflict && conflict.seats.length === 0 && conflict.spotlights.length > 0 && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm" data-testid="conflict-spotlight">
                    <span className="font-medium">Live spotlights in this category:</span> {conflict.spotlights.map((s) => s.company_name).join(', ')}. No seat is held — the capacity call is yours.
                  </div>
                )}
                {conflict && conflict.seats.length === 0 && conflict.spotlights.length === 0 && (
                  <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground flex items-center gap-2" data-testid="conflict-none"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> No live listing matches &ldquo;{selected.category_text}&rdquo; on {hubLabel(selected.hub)}.</div>
                )}

                {/* fields */}
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  <div><dt className="text-xs uppercase tracking-wider text-muted-foreground">Contact</dt><dd>{selected.contact_name ?? '—'}<br /><a className="underline underline-offset-2" href={`mailto:${selected.contact_email}`}>{selected.contact_email}</a>{selected.contact_phone ? <><br />{selected.contact_phone}</> : null}</dd></div>
                  <div><dt className="text-xs uppercase tracking-wider text-muted-foreground">Links</dt><dd className="flex flex-col gap-1">
                    {extUrl(selected.website_url, 'web') ? <a className="inline-flex items-center gap-1 underline underline-offset-2" href={extUrl(selected.website_url, 'web')!} target="_blank" rel="noreferrer">Website <ExternalLink className="w-3 h-3" /></a> : <span className="text-muted-foreground">No website</span>}
                    {extUrl(selected.instagram, 'ig') ? <a className="inline-flex items-center gap-1 underline underline-offset-2" href={extUrl(selected.instagram, 'ig')!} target="_blank" rel="noreferrer">Instagram <ExternalLink className="w-3 h-3" /></a> : <span className="text-muted-foreground">No Instagram</span>}
                    {extUrl(selected.google_profile_url, 'google') ? <a className="inline-flex items-center gap-1 underline underline-offset-2" href={extUrl(selected.google_profile_url, 'google')!} target="_blank" rel="noreferrer">Google profile <ExternalLink className="w-3 h-3" /></a> : <span className="text-muted-foreground">No Google profile</span>}
                  </dd></div>
                  <div><dt className="text-xs uppercase tracking-wider text-muted-foreground">Years in business</dt><dd>{selected.years_in_business ?? '—'}</dd></div>
                  <div><dt className="text-xs uppercase tracking-wider text-muted-foreground">Heard about us</dt><dd>{selected.heard_about ?? '—'}</dd></div>
                  <div className="sm:col-span-2"><dt className="text-xs uppercase tracking-wider text-muted-foreground">Why 704</dt><dd className="whitespace-pre-wrap">{selected.why_704 ?? '—'}</dd></div>
                  <div className="sm:col-span-2 text-xs text-muted-foreground">Attribution: {selected.utm_source ?? '—'} / {selected.utm_campaign ?? '—'} · landed {selected.landing_path ?? '—'}</div>
                </dl>

                {/* 704 review checklist */}
                <div className="rounded-lg border border-border p-4" data-testid="review-checklist">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold">704 Review</h3>
                    <span className={`text-xs font-semibold ${checksPassed >= 4 ? 'text-emerald-400' : 'text-muted-foreground'}`}>{checksPassed}/5 pillars</span>
                  </div>
                  <div className="grid gap-2">
                    {PILLARS.map((p) => (
                      <label key={p.key} className="flex items-start gap-3 text-sm cursor-pointer">
                        <input type="checkbox" className="mt-1 accent-primary" checked={!!selected.review_checklist?.[p.key]} onChange={() => void toggleCheck(p.key)} data-testid={`check-${p.key}`} disabled={!!selected.converted_listing_id} />
                        <span><span className="font-medium">{p.label}</span><span className="block text-xs text-muted-foreground">{p.hint}</span></span>
                      </label>
                    ))}
                  </div>
                  <Textarea className="mt-3" rows={3} placeholder="Review notes (internal)" value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => void saveNotes()} data-testid="review-notes" />
                </div>

                {/* payment link state */}
                {selected.approved_payment_link_sent_at && !selected.converted_listing_id && (
                  <div className={`rounded-lg border p-3 text-sm ${linkExpired ? 'border-amber-500/40 bg-amber-500/10' : 'border-border bg-muted/30'}`} data-testid="payment-link-state">
                    Payment link sent {formatDistanceToNow(new Date(selected.approved_payment_link_sent_at), { addSuffix: true })}
                    {selected.payment_link_expires_at ? <> · {linkExpired ? <strong>expired</strong> : <>valid until {format(new Date(selected.payment_link_expires_at), 'MMM d, h:mm a')}</>}</> : null}
                    {selected.payment_link_url && !linkExpired ? <> · <a className="underline underline-offset-2" href={selected.payment_link_url} target="_blank" rel="noreferrer">open link</a></> : null}
                  </div>
                )}

                {/* actions */}
                {!selected.converted_listing_id && (
                  <div className="space-y-3">
                    <div className="flex gap-2 flex-wrap">
                      {selected.status !== 'declined' && (
                        <Button size="sm" disabled={!!busy} onClick={() => void run(selected.approved_payment_link_sent_at ? 'Re-send payment link' : 'Approve + send payment link', () => approveAndSendPaymentLink(selected.id))} data-testid="btn-approve">
                          {busy?.includes('payment link') ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}{selected.approved_payment_link_sent_at ? 'Re-send payment link' : 'Approve + send payment link'}
                        </Button>
                      )}
                      {selected.status !== 'waitlisted' && selected.status !== 'declined' && (
                        <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void run('Waitlist', () => waitlistApplication(selected.id))} data-testid="btn-waitlist">Waitlist</Button>
                      )}
                      {(selected.status === 'declined' || selected.status === 'waitlisted') && (
                        <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void run('Reopen', () => reopenApplication(selected.id))} data-testid="btn-reopen">Reopen</Button>
                      )}
                    </div>
                    {selected.status !== 'declined' && (
                      <div className="rounded-lg border border-rose-500/30 p-3 space-y-2">
                        <label className="text-xs uppercase tracking-wider text-muted-foreground" htmlFor="decline-reason">Decline reason (sent to the applicant)</label>
                        <Textarea id="decline-reason" rows={2} value={declineReason} onChange={(e) => setDeclineReason(e.target.value)} placeholder="Honest, specific, one or two sentences." data-testid="decline-reason" />
                        <Button size="sm" variant="destructive" disabled={!!busy || !declineReason.trim()} onClick={() => void run('Decline', () => declineApplication(selected.id, declineReason))} data-testid="btn-decline">Decline + send email</Button>
                      </div>
                    )}
                    {selected.status === 'declined' && selected.decline_reason && <p className="text-sm text-muted-foreground">Declined: {selected.decline_reason}</p>}
                  </div>
                )}
              </>
            )}
          </CardContent></Card>
        </div>
      </div>
    </AdminLayout>
  );
}
