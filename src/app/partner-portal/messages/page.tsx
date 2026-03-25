'use client';

import { useCallback, useEffect, useState, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  ensurePartnerTeamConversation,
  postPartnerTeamThreadMessage,
  markPartnerTeamThreadRead,
} from '@/app/actions/partnerPortalActions';

type Msg = {
  id: string;
  content: string;
  created_at: string;
  sender_id: string;
  label: string;
};

export default function PartnerTeamMessagesPage() {
  const { user, profile } = useAuth();
  const p = profile as Record<string, unknown> | null;
  const partnerApproved = (p?.partner_status as string) === 'approved';

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const scrollBottom = () => endRef.current?.scrollIntoView({ behavior: 'smooth' });

  const loadMessages = useCallback(
    async (convId: string) => {
      const { data: raw } = await supabase
        .from('admin_messages')
        .select('id, content, created_at, sender_id')
        .eq('conversation_id', convId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true });
      const list = raw ?? [];
      const senderIds = [...new Set(list.map((m) => m.sender_id))];
      let map: Record<string, { full_name: string | null; role: string | null }> = {};
      if (senderIds.length) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, full_name, role')
          .in('id', senderIds);
        map = Object.fromEntries((profs ?? []).map((pr) => [pr.id, pr]));
      }
      const enriched: Msg[] = list.map((m) => {
        const pr = map[m.sender_id];
        const superA = pr?.role === 'super_admin';
        const mine = m.sender_id === user?.id;
        const label = mine ? 'You' : superA ? '704 Collective Team' : pr?.full_name?.trim() || 'Team';
        return { ...m, label };
      });
      setMessages(enriched);
      scrollBottom();
    },
    [user?.id]
  );

  const findConversation = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data: conv } = await supabase
      .from('admin_conversations')
      .select('id')
      .eq('type', 'partner_inquiry')
      .eq('partner_id', user.id)
      .maybeSingle();
    const id = conv?.id ?? null;
    setConversationId(id);
    if (id) {
      await loadMessages(id);
      await markPartnerTeamThreadRead(id);
    } else {
      setMessages([]);
    }
    setLoading(false);
  }, [user, loadMessages]);

  useEffect(() => {
    findConversation();
  }, [findConversation]);

  useEffect(() => {
    scrollBottom();
  }, [messages]);

  async function startConversation() {
    setStarting(true);
    const res = await ensurePartnerTeamConversation();
    setStarting(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setConversationId(res.conversationId);
    await loadMessages(res.conversationId);
    await markPartnerTeamThreadRead(res.conversationId);
    toast.success('Conversation ready');
  }

  async function send() {
    if (!conversationId || !text.trim()) return;
    setSending(true);
    const res = await postPartnerTeamThreadMessage(conversationId, text.trim());
    setSending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setText('');
    await loadMessages(conversationId);
    await markPartnerTeamThreadRead(conversationId);
  }

  if (!partnerApproved) {
    return (
      <p className="text-white/50 text-center py-16">
        Messaging opens once your partner application is approved.
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
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white">Messages</h2>
        <p className="text-sm text-white/50 mt-1">One thread with the 704 Collective team.</p>
      </div>

      {!conversationId ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-10 text-center space-y-4">
          <p className="text-white/60">Start a conversation with our team — we&apos;ll route it to leadership.</p>
          <Button
            type="button"
            className="bg-[#C6A664] text-black"
            disabled={starting}
            onClick={startConversation}
          >
            {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Start conversation'}
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] flex flex-col h-[min(70vh,560px)]">
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 ? (
              <p className="text-sm text-white/40 text-center py-8">No messages yet. Say hello below.</p>
            ) : (
              messages.map((m) => {
                const mine = m.sender_id === user?.id;
                return (
                  <div
                    key={m.id}
                    className={`rounded-lg px-3 py-2 text-sm max-w-[90%] ${
                      mine
                        ? 'ml-auto bg-[#C6A664]/15 text-white border border-[#C6A664]/25'
                        : 'mr-auto bg-white/5 text-white/85 border border-white/10'
                    }`}
                  >
                    <p className="text-[0.65rem] text-white/45 mb-1">
                      {m.label} · {format(new Date(m.created_at), 'MMM d, h:mm a')}
                    </p>
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  </div>
                );
              })
            )}
            <div ref={endRef} />
          </div>
          <div className="border-t border-white/10 p-4 flex flex-col sm:flex-row gap-2">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Message the team…"
              className="min-h-[72px] bg-white/5 border-white/10 flex-1"
            />
            <Button
              type="button"
              className="bg-[#C6A664] text-black sm:self-end shrink-0"
              disabled={sending || !text.trim()}
              onClick={send}
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
