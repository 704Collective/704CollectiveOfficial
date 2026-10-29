'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DEFAULT_TRACKING_DESTINATION,
  TRACKING_PLACEMENTS,
  buildTrackingUrl,
  destinationAllowed,
  type TrackingPlacement,
} from '@/lib/trackingLink';

type BreakdownRow = {
  bucket: string;
  winning_type: string | null;
  winning_detail: string | null;
  n: number;
};

type SavedLink = {
  id: string;
  posted_on: string;
  campaign_text: string;
  spot: string | null;
  url: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string | null;
  created_at: string;
  new_members: number;
};

function todayIso(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function MemberSourcesPanel() {
  const [from, setFrom] = useState('2026-10-01');
  const [to, setTo] = useState(todayIso());
  const [rows, setRows] = useState<BreakdownRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [postedOn, setPostedOn] = useState<TrackingPlacement>('instagram');
  const [campaign, setCampaign] = useState('');
  const [spot, setSpot] = useState('');
  const [destination, setDestination] = useState(DEFAULT_TRACKING_DESTINATION);
  const [links, setLinks] = useState<SavedLink[]>([]);
  const [saving, setSaving] = useState(false);

  const preview = useMemo(
    () => buildTrackingUrl({ postedOn, campaign, spot, destination }),
    [postedOn, campaign, spot, destination],
  );

  const loadBreakdown = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('member_source_breakdown', { p_from: from, p_to: to });
    if (error) {
      toast.error(error.message);
      setRows([]);
    } else {
      setRows((data ?? []) as BreakdownRow[]);
    }
    setLoading(false);
  }, [from, to]);

  const loadLinks = useCallback(async () => {
    const { data, error } = await supabase.rpc('list_tracking_links');
    if (error) {
      toast.error(error.message);
      return;
    }
    setLinks((data ?? []) as SavedLink[]);
  }, []);

  useEffect(() => { void loadBreakdown(); }, [loadBreakdown]);
  useEffect(() => { void loadLinks(); }, [loadLinks]);

  const news = rows.filter((r) => r.bucket === 'new');
  const rejoined = rows.find((r) => r.bucket === 'rejoined')?.n ?? 0;

  const save = async () => {
    if (!preview || !destinationAllowed(destination)) {
      toast.error('Add what the link is for, and keep the destination on 704collective.com.');
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc('save_tracking_link', {
      p_posted_on: postedOn,
      p_campaign: campaign,
      p_spot: spot,
      p_destination: destination.trim(),
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Link saved');
    setCampaign('');
    setSpot('');
    await loadLinks();
  };

  const copy = async () => {
    if (!preview) return;
    try {
      await navigator.clipboard.writeText(preview.url);
      toast.success('Link copied');
    } catch {
      toast.error('Could not copy the link');
    }
  };

  const downloadQr = async () => {
    if (!preview) return;
    const QRCode = (await import('qrcode')).default;
    const dataUrl = await QRCode.toDataURL(preview.url, { width: 512, margin: 1 });
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${preview.utm_campaign}.png`;
    a.click();
  };

  return (
    <div className="space-y-8" data-testid="source-breakdown">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Where members came from</h1>
        <p className="text-sm text-muted-foreground mt-1">New paying members in the range, by the source that won. Rejoined members are counted on their own.</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="source-from">From</Label>
          <Input id="source-from" data-testid="source-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="source-to">To</Label>
          <Input id="source-to" data-testid="source-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <Button type="button" variant="outline" onClick={() => void loadBreakdown()} disabled={loading}>
          {loading ? 'Loading…' : 'Update'}
        </Button>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Type</th>
              <th className="text-left px-4 py-2 font-medium">Detail</th>
              <th className="text-right px-4 py-2 font-medium">New members</th>
            </tr>
          </thead>
          <tbody>
            {news.length === 0 ? (
              <tr><td colSpan={3} className="px-4 py-6 text-muted-foreground">No new members in this range.</td></tr>
            ) : news.map((r) => (
              <tr key={`${r.winning_type}:${r.winning_detail}`} className="border-t border-border" data-testid="source-breakdown-row">
                <td className="px-4 py-2">{r.winning_type}</td>
                <td className="px-4 py-2">{r.winning_detail}</td>
                <td className="px-4 py-2 text-right tabular-nums">{r.n}</td>
              </tr>
            ))}
            <tr className="border-t border-border" data-testid="source-rejoined">
              <td className="px-4 py-2">Rejoined</td>
              <td className="px-4 py-2 text-muted-foreground">Paid again after an earlier first payment</td>
              <td className="px-4 py-2 text-right tabular-nums">{rejoined}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="space-y-3 rounded-lg border border-border p-4">
        <h2 className="text-lg font-semibold">Link + QR maker</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="posted-on">Where will this link be posted?</Label>
            <select
              id="posted-on"
              data-testid="tracking-posted-on"
              className="mt-1 flex h-11 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={postedOn}
              onChange={(e) => setPostedOn(e.target.value as TrackingPlacement)}
            >
              {TRACKING_PLACEMENTS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="campaign">What&apos;s it for?</Label>
            <Input id="campaign" data-testid="tracking-campaign" value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder="November Instagram bio" />
          </div>
          <div>
            <Label htmlFor="spot">Exact spot (optional)</Label>
            <Input id="spot" data-testid="tracking-spot" value={spot} onChange={(e) => setSpot(e.target.value)} placeholder="link in bio" />
          </div>
          <div>
            <Label htmlFor="destination">Destination</Label>
            <Input id="destination" data-testid="tracking-destination" value={destination} onChange={(e) => setDestination(e.target.value)} />
          </div>
        </div>
        <p className="text-sm break-all" data-testid="tracking-link-url">{preview?.url ?? 'Add what the link is for. Destination must be https://704collective.com.'}</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" data-testid="tracking-link-copy" onClick={() => void copy()} disabled={!preview}>Copy</Button>
          <Button type="button" variant="outline" data-testid="tracking-link-qr" onClick={() => void downloadQr()} disabled={!preview}>Download QR</Button>
          <Button type="button" data-testid="tracking-link-save" onClick={() => void save()} disabled={saving || !preview}>{saving ? 'Saving…' : 'Save link'}</Button>
        </div>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Link</th>
              <th className="text-right px-4 py-2 font-medium">New members</th>
            </tr>
          </thead>
          <tbody>
            {links.length === 0 ? (
              <tr><td colSpan={2} className="px-4 py-6 text-muted-foreground">No saved links yet.</td></tr>
            ) : links.map((l) => (
              <tr key={l.id} className="border-t border-border" data-testid="tracking-link-row">
                <td className="px-4 py-2 break-all">{l.url}</td>
                <td className="px-4 py-2 text-right tabular-nums" data-testid="tracking-link-count">{l.new_members}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
