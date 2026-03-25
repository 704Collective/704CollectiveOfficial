'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
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

  const [rows, setRows] = useState<InquiryListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MsgRow[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  const loadList = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('event_inquiries')
      .select('id, inquiry_type, status, created_at, event_id, events(title)')
      .eq('partner_id', user.id)
      .order('created_at', { ascending: false });
    setRows((data ?? []) as unknown as InquiryListRow[]);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  async function loadThread(inquiryId: string) {
    setLoadingThread(true);
    const { data: raw } = await supabase
      .from('event_inquiry_messages')
      .select('id, content, created_at, sender_id')
      .eq('inquiry_id', inquiryId)
      .order('created_at', { ascending: true });
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

  if (!partnerApproved) {
    return (
      <p className="text-white/50 text-center py-16">
        Inquiries are available once your partner application is approved.
      </p>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-[#C6A664]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white">Inquiries</h2>
        <p className="text-sm text-white/50 mt-1">Track event inquiries and chat with the team.</p>
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
                        <div className="flex justify-center py-8">
                          <Loader2 className="w-6 h-6 animate-spin text-[#C6A664]" />
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
                        <Textarea
                          value={reply}
                          onChange={(e) => setReply(e.target.value)}
                          placeholder="Write a message…"
                          className="min-h-[80px] bg-white/5 border-white/10 flex-1"
                        />
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
  );
}
