'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminLayout } from '@/components/AdminLayout';
import { useAuth } from '@/hooks/useAuth';
import { usePageTitle } from '@/hooks/usePageTitle';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  createPartnerInvoiceDraft,
  waivePartnerInvoice,
  sendPartnerStripeInvoice,
} from '@/app/actions/adminInvoiceActions';
import { Loader2, Plus, Search } from 'lucide-react';

function listingCompany(pl: unknown): string | null {
  if (!pl) return null;
  if (Array.isArray(pl)) return pl[0]?.company_name ?? null;
  if (typeof pl === 'object' && pl !== null && 'company_name' in pl) {
    return String((pl as { company_name?: string }).company_name ?? '') || null;
  }
  return null;
}

type InvoiceRow = {
  id: string;
  partner_id: string;
  event_id: string | null;
  amount: number;
  description: string;
  status: string;
  due_date: string | null;
  created_at: string;
  stripe_invoice_id: string | null;
  stripe_invoice_url: string | null;
  profiles: { full_name: string | null; email: string | null; partner_listings: unknown } | null;
  events: { title: string } | null;
};

type PartnerPick = {
  id: string;
  full_name: string | null;
  email: string | null;
  company_name: string | null;
};

type EventPick = { id: string; title: string };

function statusBadge(status: string) {
  const variant =
    status === 'paid'
      ? 'default'
      : status === 'sent'
        ? 'secondary'
        : status === 'waived'
          ? 'outline'
          : 'outline';
  return <Badge variant={variant as 'default' | 'secondary' | 'outline'}>{status}</Badge>;
}

export default function AdminInvoicesPage() {
  const router = useRouter();
  const { isAdmin, loading } = useAuth();
  usePageTitle('Partner invoices');

  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [partnerQ, setPartnerQ] = useState('');
  const [partnerHits, setPartnerHits] = useState<PartnerPick[]>([]);
  const [partnerPick, setPartnerPick] = useState<PartnerPick | null>(null);
  const [eventQ, setEventQ] = useState('');
  const [eventHits, setEventHits] = useState<EventPick[]>([]);
  const [eventPick, setEventPick] = useState<EventPick | null>(null);
  const [amountStr, setAmountStr] = useState('');
  const [desc, setDesc] = useState('');
  const [dueStr, setDueStr] = useState('');
  const [creating, setCreating] = useState(false);

  const [detail, setDetail] = useState<InvoiceRow | null>(null);

  const load = useCallback(async () => {
    setLoadingData(true);
    const { data, error } = await supabase
      .from('partner_invoices')
      .select(
        `id, partner_id, event_id, amount, description, status, due_date, created_at, stripe_invoice_id, stripe_invoice_url,
         profiles:profiles!partner_invoices_partner_id_fkey(full_name, email, partner_listings(company_name)),
         events(title)`
      )
      .order('created_at', { ascending: false });
    if (error) {
      toast.error(error.message);
      setRows([]);
    } else {
      setRows((data ?? []) as unknown as InvoiceRow[]);
    }
    setLoadingData(false);
  }, []);

  useEffect(() => {
    if (!loading && !isAdmin) router.replace('/admin');
  }, [loading, isAdmin, router]);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  const searchPartners = useCallback(async (q: string) => {
    const t = q.trim();
    if (t.length < 2) {
      setPartnerHits([]);
      return;
    }
    const safe = t.replace(/%/g, '\\%');
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, partner_listings(company_name)')
      .eq('member_type', 'partner')
      .eq('partner_status', 'approved')
      .or(`full_name.ilike.%${safe}%,email.ilike.%${safe}%`)
      .limit(25);
    if (error) {
      toast.error(error.message);
      return;
    }
    const list: PartnerPick[] = (data ?? []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      full_name: (r.full_name as string | null) ?? null,
      email: (r.email as string | null) ?? null,
      company_name: listingCompany(r.partner_listings),
    }));
    setPartnerHits(list);
  }, []);

  const searchEvents = useCallback(async (q: string) => {
    const t = q.trim();
    if (t.length < 2) {
      setEventHits([]);
      return;
    }
    const safe = t.replace(/%/g, '\\%');
    const { data, error } = await supabase
      .from('events')
      .select('id, title')
      .ilike('title', `%${safe}%`)
      .limit(25);
    if (error) {
      toast.error(error.message);
      return;
    }
    setEventHits((data ?? []) as EventPick[]);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void searchPartners(partnerQ), 200);
    return () => clearTimeout(t);
  }, [partnerQ, searchPartners]);

  useEffect(() => {
    const t = setTimeout(() => void searchEvents(eventQ), 200);
    return () => clearTimeout(t);
  }, [eventQ, searchEvents]);

  const partnerLabel = (p: PartnerPick) => p.company_name || p.full_name || p.email || p.id;

  const submitCreate = async () => {
    if (!partnerPick) {
      toast.error('Select a partner');
      return;
    }
    const amount = Number(amountStr);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Invalid amount');
      return;
    }
    setCreating(true);
    try {
      const r = await createPartnerInvoiceDraft({
        partnerId: partnerPick.id,
        eventId: eventPick?.id ?? null,
        amount,
        description: desc,
        dueDate: dueStr ? new Date(dueStr).toISOString() : null,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success('Draft invoice created');
      setCreateOpen(false);
      setPartnerPick(null);
      setEventPick(null);
      setAmountStr('');
      setDesc('');
      setDueStr('');
      setPartnerQ('');
      setEventQ('');
      await load();
    } finally {
      setCreating(false);
    }
  };

  const doWaive = async (id: string) => {
    setBusyId(id);
    try {
      const r = await waivePartnerInvoice(id);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success('Invoice waived');
      await load();
      setDetail((d) => (d?.id === id ? { ...d, status: 'waived' } : d));
    } finally {
      setBusyId(null);
    }
  };

  const doSend = async (id: string) => {
    setBusyId(id);
    try {
      const r = await sendPartnerStripeInvoice(id);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success('Invoice sent via Stripe');
      await load();
    } finally {
      setBusyId(null);
    }
  };

  if (loading || !isAdmin) {
    return (
      <AdminLayout title="Invoices">
        <div className="flex items-center justify-center min-h-[40vh] text-muted-foreground">
          {loading ? <Loader2 className="h-8 w-8 animate-spin" /> : null}
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Partner invoices">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Partner invoices</h1>
            <p className="text-sm text-muted-foreground mt-1">Draft, send via Stripe, and waive partner invoices.</p>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="gap-2 shrink-0">
            <Plus className="h-4 w-4" />
            Create invoice
          </Button>
        </div>

        <div className="rounded-xl border border-border bg-card overflow-x-auto">
          {loadingData ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Partner</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                      No invoices yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((inv) => {
                    const company =
                      listingCompany(inv.profiles?.partner_listings) ||
                      inv.profiles?.full_name ||
                      inv.profiles?.email ||
                      '—';
                    return (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium">{company}</TableCell>
                        <TableCell className="text-muted-foreground">{inv.events?.title ?? '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          ${Number(inv.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell>{statusBadge(inv.status)}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {inv.due_date ? format(new Date(inv.due_date), 'MMM d, yyyy') : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-wrap justify-end gap-2">
                            <Button type="button" variant="outline" size="sm" onClick={() => setDetail(inv)}>
                              View
                            </Button>
                            {inv.status !== 'waived' && inv.status !== 'paid' && (
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                disabled={busyId === inv.id}
                                onClick={() => void doWaive(inv.id)}
                              >
                                Mark waived
                              </Button>
                            )}
                            {inv.status === 'draft' && (
                              <Button
                                type="button"
                                size="sm"
                                disabled={busyId === inv.id}
                                onClick={() => void doSend(inv.id)}
                              >
                                Send invoice
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create invoice</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Partner</Label>
              <div className="relative mt-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  className="pl-8"
                  value={partnerPick ? partnerLabel(partnerPick) : partnerQ}
                  onChange={(e) => {
                    setPartnerPick(null);
                    setPartnerQ(e.target.value);
                  }}
                  placeholder="Search approved partners…"
                />
              </div>
              {!partnerPick && partnerHits.length > 0 && (
                <div className="mt-1 rounded-md border max-h-36 overflow-y-auto divide-y">
                  {partnerHits.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                      onClick={() => {
                        setPartnerPick(p);
                        setPartnerQ('');
                        setPartnerHits([]);
                      }}
                    >
                      {partnerLabel(p)}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <Label>Event (optional)</Label>
              <div className="relative mt-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  className="pl-8"
                  value={eventPick ? eventPick.title : eventQ}
                  onChange={(e) => {
                    setEventPick(null);
                    setEventQ(e.target.value);
                  }}
                  placeholder="Search events…"
                />
              </div>
              {!eventPick && eventHits.length > 0 && (
                <div className="mt-1 rounded-md border max-h-36 overflow-y-auto divide-y">
                  {eventHits.map((ev) => (
                    <button
                      key={ev.id}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                      onClick={() => {
                        setEventPick(ev);
                        setEventQ('');
                        setEventHits([]);
                      }}
                    >
                      {ev.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <Label>Amount (USD)</Label>
              <Input
                className="mt-1"
                inputMode="decimal"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea className="mt-1" value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} />
            </div>
            <div>
              <Label>Due date</Label>
              <Input className="mt-1" type="date" value={dueStr} onChange={(e) => setDueStr(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void submitCreate()} disabled={creating}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save draft'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invoice</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-2 text-sm">
              <p>
                <span className="text-muted-foreground">Partner: </span>
                {listingCompany(detail.profiles?.partner_listings) || detail.profiles?.full_name || detail.profiles?.email}
              </p>
              <p>
                <span className="text-muted-foreground">Event: </span>
                {detail.events?.title ?? '—'}
              </p>
              <p>
                <span className="text-muted-foreground">Amount: </span>${Number(detail.amount).toFixed(2)}
              </p>
              <p>
                <span className="text-muted-foreground">Status: </span>
                {detail.status}
              </p>
              <p>
                <span className="text-muted-foreground">Due: </span>
                {detail.due_date ? format(new Date(detail.due_date), 'PPP') : '—'}
              </p>
              <p className="whitespace-pre-wrap">
                <span className="text-muted-foreground">Description: </span>
                {detail.description}
              </p>
              {detail.stripe_invoice_url && (
                <a
                  href={detail.stripe_invoice_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline inline-block pt-2"
                >
                  Open Stripe invoice
                </a>
              )}
            </div>
          )}
          <DialogFooter>
            {detail?.status === 'draft' && (
              <Button
                type="button"
                disabled={busyId === detail?.id}
                onClick={() => detail && void doSend(detail.id)}
              >
                Send invoice
              </Button>
            )}
            {detail && detail.status !== 'waived' && detail.status !== 'paid' && (
              <Button type="button" variant="secondary" disabled={busyId === detail.id} onClick={() => void doWaive(detail.id)}>
                Mark waived
              </Button>
            )}
            <Button variant="outline" onClick={() => setDetail(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
