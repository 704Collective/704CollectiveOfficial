'use client';

// Wave H5 - My Listing: content-only form that writes pending_content (never
// the live columns), live vs pending state, LIVE ON [HUB] chip, embed badge.

import { useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { CheckCircle2, Clock, Copy, ExternalLink, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { submitListingEdits, withdrawListingEdits } from '@/app/actions/networkPortalActions';
import { LISTING_CONTENT_FIELDS, LISTING_FIELD_LABELS, listingPublicUrl, vettedBadgeSnippet, type ListingContent, type ListingContentField, type PortalListing } from '@/lib/network/portal';
import { HUB_ACCENTS, HUB_COPY } from '@/lib/network/hubs';
import { cn } from '@/lib/utils';

const GOLD = '#C6A664';
const inputCls = 'mt-1 w-full rounded-lg border border-white/15 bg-[#222] px-3 py-2 text-sm text-white outline-none focus:border-[#C6A664] placeholder:text-white/30';

const toForm = (l: PortalListing) => ({
  company_name: l.company_name ?? '', hook: l.hook ?? '', description: l.description ?? '', neighborhood: l.neighborhood ?? '', website_url: l.website_url ?? '',
  instagram_url: l.instagram_url ?? '', phone: l.phone ?? '', logo_url: l.logo_url ?? '', photo_urls: (l.photo_urls ?? []).join('\n'),
});

export function MyListingPanel({ listing: initial, siteUrl, publicLive }: { listing: PortalListing; siteUrl: string; publicLive: boolean }) {
  const [listing, setListing] = useState(initial);
  const [form, setForm] = useState(toForm(initial));
  const [busy, setBusy] = useState(false);
  const accent = HUB_ACCENTS[listing.hub];
  const hubName = HUB_COPY[listing.hub].name;
  const isLive = listing.status === 'live';
  const profileUrl = listingPublicUrl(siteUrl, listing.hub, listing.slug);
  const pending = listing.pending_content;

  const save = async () => {
    setBusy(true);
    const content: ListingContent = {
      company_name: form.company_name, hook: form.hook, description: form.description, neighborhood: form.neighborhood, website_url: form.website_url,
      instagram_url: form.instagram_url, phone: form.phone, logo_url: form.logo_url, photo_urls: form.photo_urls.split('\n').map((s) => s.trim()).filter(Boolean),
    };
    const r = await submitListingEdits(listing.id, content);
    setBusy(false);
    if (!r.ok) { toast.error(r.error); return; }
    setListing({ ...listing, pending_content: r.pending_content, pending_submitted_at: r.pending_submitted_at });
    toast.success('Edits submitted for review');
  };
  const withdraw = async () => {
    setBusy(true);
    const r = await withdrawListingEdits(listing.id);
    setBusy(false);
    if (!r.ok) { toast.error(r.error); return; }
    setListing({ ...listing, pending_content: null, pending_submitted_at: null });
    setForm(toForm({ ...listing, pending_content: null }));
    toast.success('Pending edit withdrawn');
  };
  const copySnippet = async () => {
    try { await navigator.clipboard.writeText(vettedBadgeSnippet(profileUrl, listing.company_name)); toast.success('Badge snippet copied'); }
    catch { toast.error('Could not copy - select the snippet and copy it manually.'); }
  };

  return (
    <section className="space-y-6" data-testid="my-listing" data-status={listing.status}>
      {/* header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold sm:text-3xl">{listing.company_name}</h1>
            {isLive ? (
              <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-black" style={{ backgroundColor: accent.soft }} data-testid="live-chip">
                <span className="h-1.5 w-1.5 rounded-full bg-black/70" />Live on {hubName}
              </span>
            ) : (
              <span className="rounded-full border border-white/20 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-white/70" data-testid="status-chip">{listing.status.replace('_', ' ')}</span>
            )}
          </div>
          <p className="mt-1 text-sm text-white/55">
            {listing.kind === 'seat' ? 'Exclusive seat' : 'Vetted spotlight'} · {listing.category?.label ?? '—'} · {hubName}
            {isLive && listing.verified_at ? <> · <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" style={{ color: accent.soft }} />verified {format(new Date(listing.verified_at), 'MMM d, yyyy')}</span></> : null}
          </p>
        </div>
        {isLive && publicLive && <a href={profileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm" style={{ color: GOLD }}>View live profile <ExternalLink className="h-4 w-4" /></a>}
      </div>

      {!isLive && (
        <div className="rounded-xl border border-white/10 bg-[#222] p-4 text-sm text-white/70" data-testid="draft-note">
          Your listing is in <strong className="text-white">{listing.status.replace('_', ' ')}</strong>. We finish the first version with you and flip it live; after that, edits you save here go through the same quick review.
        </div>
      )}

      {/* pending state */}
      {pending && (
        <div className="rounded-xl border p-4" style={{ borderColor: `${GOLD}66`, background: `${GOLD}14` }} data-testid="pending-state">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="inline-flex items-center gap-2 text-sm font-semibold" style={{ color: GOLD }}><Clock className="h-4 w-4" />Edits pending 704 review{listing.pending_submitted_at ? ` · submitted ${formatDistanceToNow(new Date(listing.pending_submitted_at), { addSuffix: true })}` : ''}</p>
            <button type="button" disabled={busy} onClick={() => void withdraw()} className="text-xs text-white/60 underline-offset-2 hover:text-white hover:underline" data-testid="btn-withdraw">Withdraw</button>
          </div>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            {(Object.keys(pending) as ListingContentField[]).map((k) => (
              <div key={k} className="rounded-lg bg-black/25 p-2.5">
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-white/45">{LISTING_FIELD_LABELS[k]}</dt>
                <dd className="mt-0.5 text-white/55 line-through decoration-white/30">{Array.isArray(listing[k]) ? (listing[k] as string[]).join(', ') : (listing[k] as string | null) ?? <em>empty</em>}</dd>
                <dd className="text-white" data-testid={`pending-${k}`}>{Array.isArray(pending[k]) ? (pending[k] as string[]).join(', ') : (pending[k] as string | null) ?? <em>empty</em>}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        {/* form */}
        <form className="rounded-xl border border-white/[0.08] bg-[#222] p-4 sm:p-5" onSubmit={(e) => { e.preventDefault(); void save(); }} data-testid="listing-form">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/50">Listing content</h2>
          <p className="mt-1 text-sm text-white/60">Edits go live after a quick 704 review - usually same day.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {(['company_name', 'neighborhood', 'website_url', 'instagram_url', 'phone', 'logo_url'] as const).map((k) => (
              <label key={k} className="block text-xs text-white/60">{LISTING_FIELD_LABELS[k]}
                <input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className={inputCls} data-testid={`field-${k}`} placeholder={k === 'instagram_url' ? '@handle or URL' : k === 'website_url' ? 'yourbusiness.com' : ''} />
              </label>
            ))}
            <label className="block text-xs text-white/60 sm:col-span-2">{LISTING_FIELD_LABELS.hook}
              <input value={form.hook} onChange={(e) => setForm({ ...form, hook: e.target.value })} className={inputCls} maxLength={160} data-testid="field-hook" placeholder="One line a member remembers you by" />
            </label>
            <label className="block text-xs text-white/60 sm:col-span-2">{LISTING_FIELD_LABELS.description}
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={5} className={inputCls} data-testid="field-description" />
            </label>
            <label className="block text-xs text-white/60 sm:col-span-2">{LISTING_FIELD_LABELS.photo_urls} <span className="text-white/35">(one per line, up to 8)</span>
              <textarea value={form.photo_urls} onChange={(e) => setForm({ ...form, photo_urls: e.target.value })} rows={3} className={cn(inputCls, 'font-mono text-xs')} data-testid="field-photo_urls" />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="submit" disabled={busy} className="rounded-full px-5 py-2.5 text-sm font-semibold text-black disabled:opacity-60" style={{ backgroundColor: GOLD }} data-testid="btn-save">{busy ? 'Submitting…' : pending ? 'Replace pending edit' : 'Submit edits for review'}</button>
            <span className="text-xs text-white/45">Fields: {LISTING_CONTENT_FIELDS.length} · nothing here changes your live listing until 704 applies it.</span>
          </div>
        </form>

        <div className="space-y-6">
          {/* live snapshot */}
          <div className="rounded-xl border border-white/[0.08] bg-[#222] p-4 sm:p-5" data-testid="live-snapshot">
            <h2 className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/50"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />Live right now</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div><dt className="text-[10px] uppercase tracking-wider text-white/40">Hook</dt><dd className="text-white/85" data-testid="live-hook">{listing.hook ?? <em className="text-white/35">empty</em>}</dd></div>
              <div><dt className="text-[10px] uppercase tracking-wider text-white/40">Neighborhood</dt><dd className="text-white/85">{listing.neighborhood ?? <em className="text-white/35">empty</em>}</dd></div>
              <div><dt className="text-[10px] uppercase tracking-wider text-white/40">Links</dt><dd className="text-white/85 break-all">{[listing.website_url, listing.instagram_url, listing.phone].filter(Boolean).join(' · ') || <em className="text-white/35">none</em>}</dd></div>
            </dl>
            <p className="mt-3 text-[11px] text-white/40">Last updated {formatDistanceToNow(new Date(listing.updated_at), { addSuffix: true })}</p>
          </div>

          {/* embed badge */}
          <div className="rounded-xl border border-white/[0.08] bg-[#222] p-4 sm:p-5" data-testid="embed-badge">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/50">Embed your badge</h2>
            <p className="mt-1 text-sm text-white/60">Put "704 Vetted" on your own site. It links back to your hub profile, and clicks are counted.</p>
            <div className="mt-3 rounded-lg bg-[#FAFAF8] p-3" dangerouslySetInnerHTML={{ __html: vettedBadgeSnippet(profileUrl, listing.company_name) }} />
            <textarea readOnly value={vettedBadgeSnippet(profileUrl, listing.company_name)} rows={3} className="mt-3 w-full rounded-lg border border-white/10 bg-black/30 p-2 font-mono text-[11px] text-white/70" onFocus={(e) => e.currentTarget.select()} data-testid="embed-snippet" />
            <button type="button" onClick={() => void copySnippet()} className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-white/20 px-4 py-1.5 text-xs font-semibold text-white/80 hover:text-white" data-testid="btn-copy-snippet"><Copy className="h-3.5 w-3.5" />Copy snippet</button>
            <p className="mt-2 text-[11px] text-white/40 break-all">Links to {profileUrl}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
