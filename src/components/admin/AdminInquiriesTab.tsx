'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { Loader2, CheckCircle, XCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { createPartnerInvoiceDraft, sendPartnerStripeInvoice } from '@/app/actions/adminInvoiceActions';

type InquiryRow = {
  id: string;
  inquiry_type: string;
  status: string;
  message: string;
  amount_offering: number | null;
  created_at: string;
  updated_at: string;
  event_id: string | null;
  partner_id: string;
  events: { title: string; sponsor_slot_price: number | null; vendor_slot_price: number | null; host_slot_price: number | null } | null;
  profiles: { full_name: string | null; email: string | null } | null;
};

function statusBadgeClass(s: string) {
  switch (s) {
    case 'approved': return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25';
    case 'denied': return 'bg-red-500/15 text-red-400 border-red-500/25';
    case 'reviewing': return 'bg-amber-500/15 text-amber-400 border-amber-500/25';
    default: return 'bg-white/10 text-white/70 border-white/15';
  }
}

function slotPriceForType(inquiry: InquiryRow): number | null {
  if (!inquiry.events) return null;
  switch (inquiry.inquiry_type) {
    case 'sponsor': return inquiry.events.sponsor_slot_price;
    case 'vendor': return inquiry.events.vendor_slot_price;
    case 'venue': return inquiry.events.host_slot_price;
    default: return null;
  }
}

interface Props {
  onNavigateToDashboard: () => void;
}

export function AdminInquiriesTab({ onNavigateToDashboard }: Props) {
  const [rows, setRows] = useState<InquiryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [denyNote, setDenyNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('event_inquiries')
      .select(`
        id, inquiry_type, status, message, amount_offering, created_at, updated_at, event_id, partner_id,
        events(title, sponsor_slot_price, vendor_slot_price, host_slot_price),
        profiles:profiles!event_inquiries_partner_id_fkey(full_name, email)
      `)
      .order('created_at', { ascending: false });
    if (error) {
      toast.error('Could not load inquiries');
      setRows([]);
    } else {
      setRows((data ?? []) as unknown as InquiryRow[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const approve = async (inquiry: InquiryRow) => {
    setBusyId(inquiry.id);
    try {
      const price = slotPriceForType(inquiry) ?? inquiry.amount_offering ?? 0;

      // Update inquiry status
      const { error: updateErr } = await supabase
        .from('event_inquiries')
        .update({ status: 'approved', updated_at: new Date().toISOString() })
        .eq('id', inquiry.id);
      if (updateErr) throw updateErr;

      // Create draft invoice
      const invoiceResult = await createPartnerInvoiceDraft({
        partnerId: inquiry.partner_id,
        eventId: inquiry.event_id ?? null,
        amount: price,
        description: `${inquiry.inquiry_type.charAt(0).toUpperCase() + inquiry.inquiry_type.slice(1)} slot - ${inquiry.events?.title ?? 'Event'}`,
        dueDate: null,
      });
      if (!invoiceResult.ok) throw new Error(invoiceResult.error);

      // Send invoice via Stripe immediately
      if (invoiceResult.id) {
        const sendResult = await sendPartnerStripeInvoice(invoiceResult.id);
        if (!sendResult.ok) {
          toast.warning('Inquiry approved and invoice created, but Stripe send failed - send manually from Invoices.');
        } else {
          toast.success('Inquiry approved and invoice sent to partner via Stripe.');
        }
      } else {
        toast.success('Inquiry approved and invoice draft created.');
      }

      await load();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      toast.error(msg);
    } finally {
      setBusyId(null);
    }
  };

  const deny = async (inquiry: InquiryRow) => {
    setBusyId(inquiry.id);
    try {
      const { error } = await supabase
        .from('event_inquiries')
        .update({ status: 'denied', updated_at: new Date().toISOString() })
        .eq('id', inquiry.id);
      if (error) throw error;

      if (denyNote.trim()) {
        await supabase.from('event_inquiry_messages').insert({
          inquiry_id: inquiry.id,
          sender_id: (await supabase.auth.getUser()).data.user?.id,
          content: denyNote.trim(),
        });
      }

      toast.success('Inquiry denied.');
      setDenyNote('');
      setExpandedId(null);
      await load();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      toast.error(msg);
    } finally {
      setBusyId(null);
    }
  };

  const pending = rows.filter(r => r.status === 'pending' || r.status === 'reviewing');
  const resolved = rows.filter(r => r.status === 'approved' || r.status === 'denied');

  if (loading) {
    return (
      <div className="space-y-3">
        {[1,2,3].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
    );
  }

  const renderInquiry = (inquiry: InquiryRow) => {
    const expanded = expandedId === inquiry.id;
    const price = slotPriceForType(inquiry) ?? inquiry.amount_offering;
    const partnerName = inquiry.profiles?.full_name || inquiry.profiles?.email || 'Unknown partner';
    const isPending = inquiry.status === 'pending' || inquiry.status === 'reviewing';

    return (
      <Card key={inquiry.id} className="border-white/10 bg-white/[0.02]">
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <p className="font-medium text-white truncate">{partnerName}</p>
                <Badge variant="outline" className="text-[0.65rem] capitalize border-white/15">
                  {inquiry.inquiry_type.replace('_', ' ')}
                </Badge>
                <Badge variant="outline" className={`text-[0.65rem] capitalize ${statusBadgeClass(inquiry.status)}`}>
                  {inquiry.status}
                </Badge>
              </div>
              <p className="text-sm text-white/60 truncate">{inquiry.events?.title ?? 'No event linked'}</p>
              {price != null && (
                <p className="text-xs text-white/40 mt-1">Slot price: ${Number(price).toFixed(2)}</p>
              )}
              <p className="text-xs text-white/30 mt-1">{format(new Date(inquiry.created_at), 'MMM d, yyyy')}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isPending && (
                <>
                  <Button
                    type="button"
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                    disabled={busyId === inquiry.id}
                    onClick={() => approve(inquiry)}
                  >
                    {busyId === inquiry.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                    Approve
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="border-red-500/40 text-red-400 hover:bg-red-500/10 gap-1"
                    disabled={busyId === inquiry.id}
                    onClick={() => setExpandedId(expanded ? null : inquiry.id)}
                  >
                    <XCircle className="w-3 h-3" />
                    Deny
                  </Button>
                </>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-white/50"
                onClick={() => setExpandedId(expanded ? null : inquiry.id)}
              >
                {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          {expanded && (
            <div className="mt-4 pt-4 border-t border-white/10 space-y-4">
              <div>
                <p className="text-xs text-white/40 uppercase tracking-wider mb-1">Message from partner</p>
                <p className="text-sm text-white/70 whitespace-pre-wrap">{inquiry.message}</p>
              </div>
              {isPending && (
                <div className="space-y-2">
                  <Label className="text-xs text-white/40 uppercase tracking-wider">Denial note (optional - sent to partner)</Label>
                  <Textarea
                    value={denyNote}
                    onChange={e => setDenyNote(e.target.value)}
                    placeholder="Explain why this inquiry is being denied..."
                    className="bg-white/5 border-white/10 text-white min-h-[80px]"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={busyId === inquiry.id}
                    onClick={() => deny(inquiry)}
                  >
                    {busyId === inquiry.id ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                    Confirm denial
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Partner Inquiries</h2>
        <p className="text-sm text-muted-foreground mt-1">Review partner slot requests. Approving automatically creates and sends a Stripe invoice.</p>
      </div>

      {pending.length === 0 && resolved.length === 0 && (
        <p className="text-white/40 text-center py-16">No inquiries yet.</p>
      )}

      {pending.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider">Pending review ({pending.length})</h3>
          {pending.map(renderInquiry)}
        </div>
      )}

      {resolved.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider">Resolved ({resolved.length})</h3>
          {resolved.map(renderInquiry)}
        </div>
      )}
    </div>
  );
}
