'use client';

// Wave H5/H6 — /admin/network → Listings: every listing with kind/hub/category/
// status/billing/verified/next-review; admin actions (status with seat-conflict
// surfacing, re-verify with score, hub/category reassignment) via server
// actions; pending-edit review side by side; re-send invite.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { format, formatDistanceToNow, isPast } from 'date-fns';
import { AlertTriangle, Clock, Loader2, Mail, RefreshCw, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { applyPendingContent, discardPendingContent, getAdminListings, markListingReverified, resendListingInvite, setListingStatus, updateListingAssignment } from '@/app/actions/networkAdminActions';
import { LISTING_FIELD_LABELS, type ListingContentField } from '@/lib/network/portal';
import { LISTING_STATUSES, MAX_SCORE, PASS_SCORE, type AdminListing, type ListingStatus } from '@/lib/network/admin';
import { HUB_ACCENTS, HUB_COPY, VISIBLE_HUBS, isHub } from '@/lib/network/hubs';
import { cn } from '@/lib/utils';

type Cat = { id: string; hub: string; label: string; slug: string };
const hubLabel = (h: string) => (isHub(h) ? HUB_COPY[h].name : h);
const show = (v: unknown) => (Array.isArray(v) ? (v.length ? v.join(', ') : '—') : (v as string | null) || '—');
const STATUS_STYLE: Record<ListingStatus, string> = {
  draft: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30', pending_review: 'bg-sky-500/15 text-sky-300 border-sky-500/30', live: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', paused: 'bg-amber-500/15 text-amber-300 border-amber-500/30', removed: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
};
type Filter = 'pending' | 'all' | ListingStatus;

export function NetworkListingsPanel({ focusListingId, onFocused }: { focusListingId?: string | null; onFocused?: () => void }) {
  const [rows, setRows] = useState<AdminListing[]>([]);
  const [cats, setCats] = useState<Cat[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [status, setStatus] = useState<ListingStatus>('draft');
  const [score, setScore] = useState('');
  const [assign, setAssign] = useState<{ hub: string; category_id: string }>({ hub: 'nest', category_id: '' });
  const [conflict, setConflict] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await getAdminListings();
    if (!r.ok) toast.error(`Could not load listings: ${r.error}`); else { setRows(r.listings); setCats(r.categories); }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (focusListingId) { setFilter('all'); setSelectedId(focusListingId); onFocused?.(); } }, [focusListingId, onFocused]);

  const sel = rows.find((r) => r.id === selectedId) ?? null;
  useEffect(() => { if (sel) { setStatus(sel.status); setScore(sel.review_score?.toString() ?? ''); setAssign({ hub: sel.hub, category_id: sel.category_id }); setConflict(null); setReason(''); } }, [sel?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = useMemo(() => rows.filter((r) => (filter === 'pending' ? !!r.pending_content : filter === 'all' ? true : r.status === filter)), [rows, filter]);
  const pendingCount = rows.filter((r) => r.pending_content).length;
  const catsForHub = cats.filter((c) => c.hub === assign.hub);

  const run = async (label: string, fn: () => Promise<{ ok: boolean; error?: string; conflict?: { holder: string; holderStatus: string } }>, opts?: { keepSelection?: boolean }) => {
    setBusy(label); setConflict(null);
    const r = await fn();
    setBusy(null);
    if (!r.ok) { if (r.conflict) setConflict(r.error ?? 'Seat conflict'); toast.error(r.error ?? `${label} failed`); return; }
    toast.success(`${label} done`);
    setReason('');
    await load();
    if (!opts?.keepSelection) return;
  };

  const replace = (l: AdminListing) => setRows((prev) => prev.map((r) => (r.id === l.id ? l : r)));

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]" data-testid="admin-listings">
      <div className="space-y-3 min-w-0">
        <div className="flex gap-2 flex-wrap" role="tablist">
          {([['all', `All ${rows.length}`], ['pending', `Pending edits ${pendingCount}`], ['live', `Live ${rows.filter((r) => r.status === 'live').length}`], ['draft', `Draft ${rows.filter((r) => r.status === 'draft').length}`], ['paused', `Paused ${rows.filter((r) => r.status === 'paused').length}`], ['removed', `Removed ${rows.filter((r) => r.status === 'removed').length}`]] as const).map(([k, label]) => (
            <Button key={k} role="tab" aria-selected={filter === k} size="sm" variant={filter === k ? 'default' : 'outline'} onClick={() => { setFilter(k); setSelectedId(null); }} data-testid={`listings-filter-${k}`}>{label}</Button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading} className="ml-auto"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></Button>
        </div>
        <Card><CardContent className="p-0 divide-y divide-border" data-testid="listing-list">
          {loading && <div className="p-6 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Loading…</div>}
          {!loading && visible.length === 0 && <div className="p-6 text-sm text-muted-foreground">{filter === 'pending' ? 'No pending edits.' : 'No listings.'}</div>}
          {visible.map((r) => {
            const overdue = r.next_review_at ? isPast(new Date(r.next_review_at)) : false;
            return (
              <button key={r.id} type="button" onClick={() => setSelectedId(r.id)} className={`w-full text-left p-4 hover:bg-muted/40 transition-colors ${selectedId === r.id ? 'bg-muted/50' : ''}`} data-testid="listing-row" data-pending={!!r.pending_content} data-status={r.status} data-slug={r.slug}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium truncate flex items-center gap-2"><span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: HUB_ACCENTS[r.hub].accent }} />{r.company_name}</span>
                  <div className="flex gap-1 shrink-0">
                    {r.pending_content && <Badge variant="outline" className="text-[10px] uppercase tracking-wider bg-amber-500/15 text-amber-300 border-amber-500/30">edit</Badge>}
                    {overdue && r.status !== 'removed' && <Badge variant="outline" className="text-[10px] uppercase tracking-wider bg-rose-500/15 text-rose-300 border-rose-500/30">review due</Badge>}
                    <Badge variant="outline" className={`text-[10px] uppercase tracking-wider ${STATUS_STYLE[r.status]}`}>{r.status.replace('_', ' ')}</Badge>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground mt-1 truncate">{hubLabel(r.hub)} · {r.kind} · {r.category?.label ?? '—'} · billing {r.billing_status ?? '—'}{r.verified_at ? ` · verified ${format(new Date(r.verified_at), 'MMM d')}` : ''}{r.next_review_at ? ` · next ${format(new Date(r.next_review_at), 'MMM d, yyyy')}` : ''}</div>
              </button>
            );
          })}
        </CardContent></Card>
      </div>

      <Card className="min-w-0"><CardContent className="p-5 space-y-5 min-w-0" data-testid="listing-detail">
        {!sel && <p className="text-sm text-muted-foreground">Select a listing.</p>}
        {sel && (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-xl font-semibold flex flex-wrap items-center gap-2 break-words">{sel.company_name}<Badge variant="outline" className={`text-[10px] uppercase tracking-wider ${STATUS_STYLE[sel.status]}`} data-testid="detail-status">{sel.status.replace('_', ' ')}</Badge></h2>
                <p className="text-sm text-muted-foreground break-words">{hubLabel(sel.hub)} · {sel.kind} · {sel.category?.label ?? '—'} · billing {sel.billing_status ?? '—'} · <span className="break-all">/{sel.hub}/{sel.slug}</span></p>
                <p className="text-xs text-muted-foreground mt-1 break-words">Owner: {sel.owner ? `${sel.owner.full_name ?? '—'} · ${sel.owner.email ?? '—'} · ${sel.owner.member_type ?? '—'}` : 'no owner account'}</p>
              </div>
              {sel.owner?.member_type === 'listing' && (
                <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void run('Re-send invite', () => resendListingInvite(sel.id))} data-testid="btn-resend-invite"><Mail className="w-4 h-4 mr-1" />Re-send invite</Button>
              )}
            </div>

            {/* management */}
            <div className="grid gap-3 sm:grid-cols-3" data-testid="listing-manage">
              <div className="rounded-lg border border-border p-3 space-y-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</div>
                <select value={status} onChange={(e) => setStatus(e.target.value as ListingStatus)} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" data-testid="status-select">
                  {LISTING_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                </select>
                <Button size="sm" className="w-full" disabled={!!busy || status === sel.status} onClick={() => void run('Set status', async () => { const r = await setListingStatus(sel.id, status); if (r.ok) replace(r.listing); return r; })} data-testid="btn-set-status">Apply status</Button>
              </div>
              <div className="rounded-lg border border-border p-3 space-y-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">704 Review</div>
                <div className="text-xs text-muted-foreground">{sel.verified_at ? `Verified ${format(new Date(sel.verified_at), 'MMM d, yyyy')}` : 'Never verified'}{sel.next_review_at ? ` · next ${format(new Date(sel.next_review_at), 'MMM d, yyyy')}` : ''}{sel.next_review_at && isPast(new Date(sel.next_review_at)) ? <span className="text-rose-300 font-semibold"> · overdue</span> : null}</div>
                <div className="flex items-center gap-2">
                  <input type="number" min={0} max={MAX_SCORE} value={score} onChange={(e) => setScore(e.target.value)} placeholder="score" className="w-20 rounded-md border border-border bg-background px-2 py-1.5 text-sm" data-testid="score-input" />
                  <span className="text-[11px] text-muted-foreground">/ {MAX_SCORE} · pass ≥ {PASS_SCORE}{score !== '' ? <span className={cn('ml-1 font-semibold', Number(score) >= PASS_SCORE ? 'text-emerald-300' : 'text-rose-300')} data-testid="score-verdict">{Number(score) >= PASS_SCORE ? 'pass' : 'fail'}</span> : sel.review_score != null ? <span className="ml-1">(last {sel.review_score})</span> : null}</span>
                </div>
                <Button size="sm" variant="outline" className="w-full" disabled={!!busy} onClick={() => void run('Mark re-verified', async () => { const r = await markListingReverified(sel.id, score === '' ? null : Number(score)); if (r.ok) replace(r.listing); return r; })} data-testid="btn-reverify"><ShieldCheck className="w-4 h-4 mr-1" />Mark re-verified</Button>
              </div>
              <div className="rounded-lg border border-border p-3 space-y-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Hub · category</div>
                <select value={assign.hub} onChange={(e) => setAssign({ hub: e.target.value, category_id: '' })} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" data-testid="assign-hub">
                  {VISIBLE_HUBS.map((h) => <option key={h} value={h}>{HUB_COPY[h].name}</option>)}
                </select>
                <select value={assign.category_id} onChange={(e) => setAssign({ ...assign, category_id: e.target.value })} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" data-testid="assign-category">
                  <option value="">Choose category…</option>
                  {catsForHub.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
                <Button size="sm" variant="outline" className="w-full" disabled={!!busy || !assign.category_id || (assign.hub === sel.hub && assign.category_id === sel.category_id)} onClick={() => void run('Reassign', async () => { const r = await updateListingAssignment(sel.id, assign); if (r.ok) replace(r.listing); return r; })} data-testid="btn-assign">Save assignment</Button>
              </div>
            </div>
            {conflict && (
              <div className="rounded-lg border border-rose-500/50 bg-rose-500/10 p-3 text-sm flex items-start gap-2" role="alert" data-testid="seat-conflict"><AlertTriangle className="w-4 h-4 text-rose-300 mt-0.5 shrink-0" /><span><strong className="text-rose-300 uppercase tracking-wider text-xs">Seat conflict</strong><br />{conflict}</span></div>
            )}

            {sel.pending_content ? (
              <div className="space-y-4" data-testid="pending-review">
                <p className="inline-flex items-center gap-2 text-sm font-medium text-amber-300"><Clock className="w-4 h-4" />Pending edit · submitted {sel.pending_submitted_at ? format(new Date(sel.pending_submitted_at), 'MMM d, h:mm a') : '—'}</p>
                <div className="rounded-lg border border-border overflow-hidden">
                  <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)_minmax(0,1.6fr)] text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/40 px-3 py-2"><span>Field</span><span>Current</span><span>Pending</span></div>
                  {(Object.keys(sel.pending_content) as ListingContentField[]).map((k) => (
                    <div key={k} className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)_minmax(0,1.6fr)] gap-3 px-3 py-2.5 text-sm border-t border-border" data-testid={`diff-${k}`}>
                      <span className="text-muted-foreground">{LISTING_FIELD_LABELS[k]}</span>
                      <span className="text-muted-foreground line-through decoration-muted-foreground/50 break-words">{show((sel as unknown as Record<string, unknown>)[k])}</span>
                      <span className="break-words">{show((sel.pending_content as Record<string, unknown>)[k])}</span>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2 items-start">
                  <Button size="sm" disabled={!!busy} onClick={() => void run('Apply', () => applyPendingContent(sel.id))} data-testid="btn-apply">{busy === 'Apply' ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}Apply to live listing</Button>
                  <div className="flex-1 min-w-[220px] space-y-2">
                    <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for discarding (sent to the owner, optional)" data-testid="discard-reason" />
                    <Button size="sm" variant="destructive" disabled={!!busy} onClick={() => void run('Discard', () => discardPendingContent(sel.id, reason))} data-testid="btn-discard">Discard + notify owner</Button>
                  </div>
                </div>
              </div>
            ) : <p className="text-sm text-muted-foreground">No pending edit on this listing.</p>}

            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm border-t border-border pt-4">
              {(['hook', 'description', 'neighborhood', 'website_url', 'instagram_url', 'phone', 'logo_url', 'photo_urls'] as const).map((k) => (
                <div key={k} className={k === 'description' ? 'sm:col-span-2' : ''}><dt className="text-xs uppercase tracking-wider text-muted-foreground">{LISTING_FIELD_LABELS[k]}</dt><dd className="break-words whitespace-pre-wrap">{show(sel[k])}</dd></div>
              ))}
              <div className="sm:col-span-2 text-xs text-muted-foreground">Created {format(new Date(sel.created_at), 'MMM d, yyyy')} · updated {formatDistanceToNow(new Date(sel.updated_at), { addSuffix: true })}{sel.review_score != null ? ` · last score ${sel.review_score}/${MAX_SCORE}` : ''}</div>
            </dl>
          </>
        )}
      </CardContent></Card>
    </div>
  );
}
