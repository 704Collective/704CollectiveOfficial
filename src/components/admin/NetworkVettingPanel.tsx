'use client';

// Wave H6 — /admin/network → Vetting: overdue re-reviews + reply-pledge laggards.
import { format, formatDistanceToNow } from 'date-fns';
import { AlertTriangle, CalendarClock, ExternalLink } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { fmtHours } from '@/components/admin/NetworkAttributionPanel';
import type { VettingAlerts } from '@/lib/network/admin';
import { HUB_ACCENTS, HUB_COPY } from '@/lib/network/hubs';

export function NetworkVettingPanel({ data, onOpenListing }: { data: VettingAlerts | null; onOpenListing: (id: string) => void }) {
  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>;
  return (
    <div className="grid gap-4 lg:grid-cols-2" data-testid="admin-vetting">
      <Card><CardContent className="p-0" data-testid="vetting-overdue">
        <div className="flex items-center justify-between border-b border-border px-4 py-3"><span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"><CalendarClock className="h-4 w-4" />Overdue re-review</span><span className="text-xs tabular-nums text-muted-foreground">{data.counts.overdue}</span></div>
        {data.overdue.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No listing is past its review date.</p> : (
          <ul className="divide-y divide-border">
            {data.overdue.map(({ listing, daysOverdue }) => (
              <li key={listing.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm" data-testid="overdue-row" data-listing={listing.slug}>
                <div><button type="button" onClick={() => onOpenListing(listing.id)} className="font-medium underline-offset-2 hover:underline">{listing.company_name}</button><div className="text-[11px] text-muted-foreground"><span className="inline-block h-2 w-2 rounded-full mr-1 align-middle" style={{ backgroundColor: HUB_ACCENTS[listing.hub].accent }} />{HUB_COPY[listing.hub].name} · {listing.kind} · {listing.status} · due {listing.next_review_at ? format(new Date(listing.next_review_at), 'MMM d, yyyy') : '—'}</div></div>
                <div className="flex items-center gap-2"><span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-xs font-semibold text-rose-300 tabular-nums" data-testid="overdue-days">{daysOverdue}d overdue</span><a href={`/${listing.hub}/${listing.slug}`} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground" aria-label="Open public profile"><ExternalLink className="h-4 w-4" /></a></div>
              </li>
            ))}
          </ul>
        )}
      </CardContent></Card>
      <Card><CardContent className="p-0" data-testid="vetting-laggards">
        <div className="flex items-center justify-between border-b border-border px-4 py-3"><span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"><AlertTriangle className="h-4 w-4" />Reply-pledge laggards</span><span className="text-xs tabular-nums text-muted-foreground">{data.counts.laggards}</span></div>
        {data.laggards.length === 0 ? <p className="p-4 text-sm text-muted-foreground">Every open intro is inside the 2-business-day pledge.</p> : (
          <ul className="divide-y divide-border">
            {data.laggards.map((b) => (
              <li key={b.listing.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm" data-testid="laggard-row" data-listing={b.listing.slug}>
                <div><button type="button" onClick={() => onOpenListing(b.listing.id)} className="font-medium underline-offset-2 hover:underline">{b.listing.company_name}</button><div className="text-[11px] text-muted-foreground">{HUB_COPY[b.listing.hub].name} · avg reply {fmtHours(b.avgReplyHours)}{b.lastNudgeAt ? ` · nudge sent ${formatDistanceToNow(new Date(b.lastNudgeAt), { addSuffix: true })}` : ' · not nudged yet'}</div></div>
                <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-300 tabular-nums" data-testid="laggard-count">{b.openFlags} waiting</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent></Card>
    </div>
  );
}
