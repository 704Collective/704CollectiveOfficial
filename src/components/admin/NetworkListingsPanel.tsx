'use client';

// Wave H5 - /admin/network -> Listings: pending-edit review (current vs pending
// side by side), Apply / Discard, and Re-send invite for listing accounts.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { Clock, Loader2, Mail, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { applyPendingContent, discardPendingContent, resendListingInvite } from '@/app/actions/networkAdminActions';
import { LISTING_FIELD_LABELS, type ListingContent, type ListingContentField } from '@/lib/network/portal';
import { HUB_COPY, isHub } from '@/lib/network/hubs';

type Row = {
  id: string; kind: 'seat' | 'spotlight'; hub: string; slug: string; status: string; billing_status: string | null; company_name: string; hook: string | null; description: string | null; neighborhood: string | null;
  website_url: string | null; instagram_url: string | null; phone: string | null; logo_url: string | null; photo_urls: string[] | null; pending_content: ListingContent | null; pending_submitted_at: string | null; updated_at: string; owner_profile_id: string | null;
  owner: { email: string | null; full_name: string | null; member_type: string | null } | null; category: { label: string } | null;
};
const hubLabel = (h: string) => (isHub(h) ? HUB_COPY[h].name : h);
const show = (v: unknown) => (Array.isArray(v) ? (v.length ? v.join(', ') : '—') : (v as string | null) || '—');

export function NetworkListingsPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('network_listings')
      .select('id, kind, hub, slug, status, billing_status, company_name, hook, description, neighborhood, website_url, instagram_url, phone, logo_url, photo_urls, pending_content, pending_submitted_at, updated_at, owner_profile_id, owner:profiles!network_listings_owner_profile_id_fkey(email, full_name, member_type), category:network_categories(label)')
      .order('pending_submitted_at', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false });
    if (error) toast.error(`Could not load listings: ${error.message}`);
    setRows(((data ?? []) as unknown as Row[]).map((r) => ({ ...r, owner: Array.isArray(r.owner) ? r.owner[0] ?? null : r.owner, category: Array.isArray(r.category) ? r.category[0] ?? null : r.category })));
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => rows.filter((r) => (filter === 'pending' ? !!r.pending_content : true)), [rows, filter]);
  const sel = rows.find((r) => r.id === selectedId) ?? null;
  const pendingCount = rows.filter((r) => r.pending_content).length;

  const run = async (label: string, fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(label);
    const r = await fn();
    setBusy(null);
    if (!r.ok) { toast.error(r.error ?? `${label} failed`); return; }
    toast.success(`${label} done`);
    setReason('');
    await load();
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]" data-testid="admin-listings">
      <div className="space-y-3">
        <div className="flex gap-2" role="tablist">
          {([['pending', `Pending edits ${pendingCount}`], ['all', `All listings ${rows.length}`]] as const).map(([k, label]) => (
            <Button key={k} role="tab" aria-selected={filter === k} size="sm" variant={filter === k ? 'default' : 'outline'} onClick={() => { setFilter(k); setSelectedId(null); }} data-testid={`listings-filter-${k}`}>{label}</Button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading} className="ml-auto"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></Button>
        </div>
        <Card><CardContent className="p-0 divide-y divide-border" data-testid="listing-list">
          {loading && <div className="p-6 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Loading…</div>}
          {!loading && visible.length === 0 && <div className="p-6 text-sm text-muted-foreground">{filter === 'pending' ? 'No pending edits.' : 'No listings.'}</div>}
          {visible.map((r) => (
            <button key={r.id} type="button" onClick={() => setSelectedId(r.id)} className={`w-full text-left p-4 hover:bg-muted/40 transition-colors ${selectedId === r.id ? 'bg-muted/50' : ''}`} data-testid="listing-row" data-pending={!!r.pending_content}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium truncate">{r.company_name}</span>
                <div className="flex gap-1">
                  {r.pending_content && <Badge variant="outline" className="text-[10px] uppercase tracking-wider bg-amber-500/15 text-amber-300 border-amber-500/30">pending edit</Badge>}
                  <Badge variant="outline" className="text-[10px] uppercase tracking-wider">{r.status}</Badge>
                </div>
              </div>
              <div className="text-xs text-muted-foreground mt-1 truncate">{hubLabel(r.hub)} · {r.kind} · {r.category?.label ?? '—'}{r.pending_submitted_at ? ` · submitted ${formatDistanceToNow(new Date(r.pending_submitted_at), { addSuffix: true })}` : ''}</div>
            </button>
          ))}
        </CardContent></Card>
      </div>

      <Card><CardContent className="p-5 space-y-5" data-testid="listing-detail">
        {!sel && <p className="text-sm text-muted-foreground">Select a listing.</p>}
        {sel && (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">{sel.company_name}</h2>
                <p className="text-sm text-muted-foreground">{hubLabel(sel.hub)} · {sel.kind} · {sel.category?.label ?? '—'} · {sel.status} · billing {sel.billing_status ?? '—'}</p>
                <p className="text-xs text-muted-foreground mt-1">Owner: {sel.owner ? `${sel.owner.full_name ?? '—'} · ${sel.owner.email ?? '—'} · ${sel.owner.member_type ?? '—'}` : 'no owner account'}</p>
              </div>
              {sel.owner?.member_type === 'listing' && (
                <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void run('Re-send invite', () => resendListingInvite(sel.id))} data-testid="btn-resend-invite"><Mail className="w-4 h-4 mr-1" />Re-send invite</Button>
              )}
            </div>

            {sel.pending_content ? (
              <div className="space-y-4" data-testid="pending-review">
                <p className="inline-flex items-center gap-2 text-sm font-medium text-amber-300"><Clock className="w-4 h-4" />Pending edit · submitted {sel.pending_submitted_at ? format(new Date(sel.pending_submitted_at), 'MMM d, h:mm a') : '—'}</p>
                <div className="rounded-lg border border-border overflow-hidden">
                  <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)_minmax(0,1.6fr)] text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/40 px-3 py-2"><span>Field</span><span>Current</span><span>Pending</span></div>
                  {(Object.keys(sel.pending_content) as ListingContentField[]).map((k) => (
                    <div key={k} className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)_minmax(0,1.6fr)] gap-3 px-3 py-2.5 text-sm border-t border-border" data-testid={`diff-${k}`}>
                      <span className="text-muted-foreground">{LISTING_FIELD_LABELS[k]}</span>
                      <span className="text-muted-foreground line-through decoration-muted-foreground/50 break-words">{show((sel as Record<string, unknown>)[k])}</span>
                      <span className="break-words">{show(sel.pending_content![k])}</span>
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
            ) : (
              <p className="text-sm text-muted-foreground">No pending edit on this listing.</p>
            )}

            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm border-t border-border pt-4">
              {(['hook', 'description', 'neighborhood', 'website_url', 'instagram_url', 'phone', 'logo_url', 'photo_urls'] as const).map((k) => (
                <div key={k} className={k === 'description' ? 'sm:col-span-2' : ''}><dt className="text-xs uppercase tracking-wider text-muted-foreground">{LISTING_FIELD_LABELS[k]}</dt><dd className="break-words whitespace-pre-wrap">{show(sel[k])}</dd></div>
              ))}
              <div className="sm:col-span-2 text-xs text-muted-foreground">Slug /{sel.hub}/{sel.slug} · updated {formatDistanceToNow(new Date(sel.updated_at), { addSuffix: true })}</div>
            </dl>
          </>
        )}
      </CardContent></Card>
    </div>
  );
}
