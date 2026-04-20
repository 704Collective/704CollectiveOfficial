'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { SectionErrorBoundary } from '@/components/SectionErrorBoundary';
import { PartnerPortalInquiriesSkeleton } from '@/components/dashboard/DashboardLoadingSkeletons';
import { postEventInquiryMessage } from '@/app/actions/partnerPortalActions';

type InquiryListRow = {
  id: string;
  inquiry_type: string;
  status: string;
  created_at: string;
  event_id: string | null;
  events: { title: string } | null;
};

type MsgRow = {
  id: string;
  content: string;
  created_at: string;
  sender_id: string;
  sender_name: string;
};

type EventSlotRow = {
  id: string;
  title: string;
  start_time: string;
  sponsor_slots_enabled: boolean | null;
  sponsor_slot_price: number | null;
  vendor_slots_enabled: boolean | null;
  vendor_slot_price: number | null;
  host_slots_enabled: boolean | null;
  host_slot_price: number | null;
};

function statusBadgeClass(s: string) {
  switch (s) {
    case 'approved':
      return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25';
    case 'denied':
      return 'bg-red-500/15 text-red-400 border-red-500/25';
    case 'reviewing':
      return 'bg-amber-500/15 text-amber-400 border-amber-500/25';
    default:
      return 'bg-white/10 text-white/70 border-white/15';
  }
}

export default function PartnerInquiriesPage() {
  const { user, profile } = useAuth();
  const p = profile as Record<string, unknown> | null;
  const partnerApproved = (p?.partner_status as string) === 'approved';

  // ── List view state ────────────────────────────────────────────────────────
  const [rows, setRows] = useState<InquiryListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MsgRow[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  // ── New inquiry form state ─────────────────────────────────────────────────
  const [showNewForm, setShowNewForm] = useState(false);
  const [events, setEvents] = useState<EventSlotRow[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [slotType, setSlotType] = useState<'sponsor' | 'vendor' | 'venue' | ''>('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadList = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('event_inquiries')
      .select('id, inquiry_type, status, created_at, event_id, events(title)')
      .eq('partner_id', user.id)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[partner-portal/inquiries]', error.message);
      toast.error('Could not load inquiries.');
      setRows([]);
    } else {
      setRows((data ?? []) as unknown as InquiryListRow[]);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  async function loadThread(inquiryId: string) {
    setLoadingThread(true);
    const { data: raw, error: msgErr } = await supabase
      .from('event_inquiry_messages')
      .select('id, content, created_at, sender_id')
      .eq('inquiry_id', inquiryId)
      .order('created_at', { ascending: true });
    if (msgErr) {
      console.error('[partner-portal/inquiries] thread', msgErr.message);
      toast.error('Could not load messages.');
      setMessages([]);
      setLoadingThread(false);
      return;
    }
    const list = raw ?? [];
    const senderIds = [...new Set(list.map((m) => m.sender_id))];
    let nameById: Record<string, { full_name: string | null; role: string | null }> = {};
    if (senderIds.length) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .in('id', senderIds);
      nameById = Object.fromEntries((profs ?? []).map((p) => [p.id, p]));
    }
    const enriched: MsgRow[] = list.map((m) => {
      const pr = nameById[m.sender_id];
      const staff = pr?.role === 'admin' || pr?.role === 'super_admin';
      const sender_name = staff ? '704 Collective Team' : pr?.full_name?.trim() || 'Team';
      return {
        id: m.id,
        content: m.content,
        created_at: m.created_at,
        sender_id: m.sender_id,
        sender_name,
      };
    });
    setMessages(enriched);
    setLoadingThread(false);
  }

  async function toggleThread(id: string) {
    if (openId === id) {
      setOpenId(null);
      setMessages([]);
      setReply('');
      return;
    }
    setOpenId(id);
    setReply('');
    await loadThread(id);
  }

  async function sendReply() {
    if (!openId || !reply.trim()) return;
    setSending(true);
    const res = await postEventInquiryMessage(openId, reply.trim());
    setSending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setReply('');
    toast.success('Message sent');
    await loadThread(openId);
  }

  async function openNewForm() {
    setShowNewForm(true);
    setSelectedEventId('');
    setSlotType('');
    setMessage('');
    if (events.length > 0) return;
    setEventsLoading(true);
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('events')
      .select('id, title, start_time, sponsor_slots_enabled, sponsor_slot_price, vendor_slots_enabled, vendor_slot_price, host_slots_enabled, host_slot_price')
      .gte('start_time', now)
      .or('sponsor_slots_enabled.eq.true,vendor_slots_enabled.eq.true,host_slots_enabled.eq.true')
      .order('start_time', { ascending: true });
    if (error) {
      toast.error('Could not load events.');
    } else {
      setEvents((data ?? []) as EventSlotRow[]);
    }
    setEventsLoading(false);
  }

  async function submitInquiry() {
    if (!user || !selectedEventId || !slotType || !message.trim()) return;
    setSubmitting(true);
    const { error } = await supabase.from('event_inquiries').insert({
      partner_id: user.id,
      event_id: selectedEventId,
      inquiry_type: slotType,
      status: 'pending',
      message: message.trim(),
    });
    setSubmitting(false);
    if (error) {
      toast.error('Could not submit inquiry. Please try again.');
      return;
    }
    toast.success('Inquiry submitted');
    setShowNewForm(false);
    await loadList();
  }

  const selectedEvent = events.find((e) => e.id === selectedEventId) ?? null;

  const availableSlots: { type: 'sponsor' | 'vendor' | 'venue'; label: string; price: number | null }[] = selectedEvent
    ? [
        ...(selectedEvent.sponsor_slots_enabled ? [{ type: 'sponsor' as const, label: 'Sponsor', price: selectedEvent.sponsor_slot_price }] : []),
        ...(selectedEvent.vendor_slots_enabled  ? [{ type: 'vendor'  as const, label: 'Vendor',  price: selectedEvent.vendor_slot_price  }] : []),
        ...(selectedEvent.host_slots_enabled    ? [{ type: 'venue'   as const, label: 'Host / Venue', price: selectedEvent.host_slot_price }] : []),
      ]
    : [];

  if (!partnerApproved) {
    return (
      <p className="text-white/50 text-center py-16">
        Inquiries are available once your partner application is approved.
      </p>
    );
  }

  if (loading) {
    return <PartnerPortalInquiriesSkeleton />;
  }

  // ── New inquiry form view ──────────────────────────────────────────────────
  if (showNewForm) {
    return (
      <SectionErrorBoundary>
        <div className="space-y-6 max-w-xl">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowNewForm(false)}
              className="text-white/50 hover:text-white transition-colors"
              aria-label="Back to inquiries"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h2 className="text-xl font-semibold text-white">New Inquiry</h2>
              <p className="text-sm text-white/50 mt-0.5">Request a sponsor, vendor, or host slot for an upcoming event.</p>
            </div>
          </div>

          <div className="space-y-5">
            {/* Event selector */}
            <div className="space-y-2">
              <Label className="text-white/70">Select event</Label>
              {eventsLoading ? (
                <Skeleton className="h-10 rounded-lg" />
              ) : events.length === 0 ? (
                <p className="text-sm text-white/40 py-2">No upcoming events with available slots right now.</p>
              ) : (
                <Select
                  value={selectedEventId}
                  onValueChange={(v) => { setSelectedEventId(v); setSlotType(''); }}
                >
                  <SelectTrigger className="bg-white/5 border-white/10 text-white">
                    <SelectValue placeholder="Choose an event…" />
                  </SelectTrigger>
                  <SelectContent>
                    {events.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.title} — {format(new Date(e.start_time), 'MMM d, yyyy')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Slot type selector */}
            {selectedEvent && availableSlots.length > 0 && (
              <div className="space-y-2">
                <Label className="text-white/70">Slot type</Label>
                <div className="flex flex-wrap gap-2">
                  {availableSlots.map((slot) => (
                    <button
                      key={slot.type}
                      type="button"
                      onClick={() => setSlotType(slot.type)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        slotType === slot.type
                          ? 'bg-[#C6A664] text-black border-[#C6A664]'
                          : 'bg-white/5 text-white/70 border-white/15 hover:border-white/30 hover:text-white'
                      }`}
                    >
                      {slot.label}
                      {slot.price != null && (
                        <span className="ml-1.5 opacity-70 font-normal">${Number(slot.price).toFixed(0)}</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Message */}
            <div className="space-y-2">
              <Label htmlFor="new-inquiry-message" className="text-white/70">Message</Label>
              <Textarea
                id="new-inquiry-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Tell us about your interest, goals, and any questions…"
                className="min-h-[120px] bg-white/5 border-white/10 text-white"
              />
            </div>

            <div className="flex gap-3 pt-1">
              <Button
                type="button"
                variant="outline"
                className="border-white/15 text-white"
                onClick={() => setShowNewForm(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-[#C6A664] text-black hover:bg-[#b8954f]"
                disabled={submitting || !selectedEventId || !slotType || !message.trim()}
                onClick={submitInquiry}
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Submit Inquiry'}
              </Button>
            </div>
          </div>
        </div>
      </SectionErrorBoundary>
    );
  }

  // ── List view ──────────────────────────────────────────────────────────────
  return (
    <SectionErrorBoundary>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-white">Inquiries</h2>
            <p className="text-sm text-white/50 mt-1">Track event inquiries and chat with the team.</p>
          </div>
          <Button
            type="button"
            className="bg-[#C6A664] text-black hover:bg-[#b8954f] shrink-0"
            onClick={openNewForm}
          >
            New Inquiry
          </Button>
        </div>

        {rows.length === 0 ? (
          <p className="text-white/45 text-center py-12">No inquiries yet.</p>
        ) : (
          <div className="space-y-4">
            {rows.map((q) => {
              const title = q.events?.title ?? 'New Event Suggestion';
              const expanded = openId === q.id;
              return (
                <Card key={q.id} className="border-white/10 bg-white/[0.02]">
                  <CardContent className="p-4 sm:p-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-medium text-white">{title}</p>
                        <div className="flex flex-wrap gap-2 mt-2">
                          <Badge variant="outline" className="text-[0.65rem] capitalize border-white/15">
                            {q.inquiry_type.replace('_', ' ')}
                          </Badge>
                          <Badge variant="outline" className={`text-[0.65rem] capitalize ${statusBadgeClass(q.status)}`}>
                            {q.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-white/40 mt-2">
                          Submitted {format(new Date(q.created_at), 'MMM d, yyyy · h:mm a')}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        className="border-white/15 text-white shrink-0"
                        onClick={() => toggleThread(q.id)}
                      >
                        {expanded ? 'Hide thread' : 'View thread'}
                      </Button>
                    </div>

                    {expanded && (
                      <div className="mt-6 border-t border-white/10 pt-6 space-y-4">
                        {loadingThread ? (
                          <div className="space-y-2 py-4">
                            <Skeleton className="h-16 w-full rounded-lg" />
                            <Skeleton className="h-16 w-4/5 rounded-lg" />
                            <Skeleton className="h-16 w-full rounded-lg" />
                          </div>
                        ) : (
                          <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                            {messages.map((m) => {
                              const mine = m.sender_id === user?.id;
                              return (
                                <div
                                  key={m.id}
                                  className={`rounded-lg px-3 py-2 text-sm max-w-[95%] ${
                                    mine
                                      ? 'ml-auto bg-[#C6A664]/15 text-white border border-[#C6A664]/25'
                                      : 'mr-auto bg-white/5 text-white/85 border border-white/10'
                                  }`}
                                >
                                  <p className="text-[0.65rem] text-white/45 mb-1">
                                    {mine ? 'You' : m.sender_name} ·{' '}
                                    {format(new Date(m.created_at), 'MMM d, h:mm a')}
                                  </p>
                                  <p className="whitespace-pre-wrap">{m.content}</p>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        <div className="flex flex-col sm:flex-row gap-2">
                          <div className="flex-1 space-y-1.5">
                            <Label htmlFor="inquiry-reply" className="text-white/70 text-xs">
                              Your message
                            </Label>
                            <Textarea
                              id="inquiry-reply"
                              value={reply}
                              onChange={(e) => setReply(e.target.value)}
                              placeholder="Write a message…"
                              className="min-h-[80px] bg-white/5 border-white/10 w-full"
                            />
                          </div>
                          <Button
                            type="button"
                            className="bg-[#C6A664] text-black sm:self-end shrink-0"
                            disabled={sending || !reply.trim()}
                            onClick={sendReply}
                          >
                            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send'}
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </SectionErrorBoundary>
  );
}
