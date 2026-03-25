'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import {
  LayoutDashboard,
  Calendar,
  ClipboardList,
  Store,
  MessageSquare,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { NotificationBell } from '@/components/business/NotificationBell';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const FULL_NAV = [
  { label: 'Dashboard', href: '/partner-portal', icon: LayoutDashboard },
  { label: 'Events', href: '/partner-portal/events', icon: Calendar },
  { label: 'Inquiries', href: '/partner-portal/inquiries', icon: ClipboardList },
  { label: 'My Listing', href: '/partner-portal/listing', icon: Store },
  { label: 'Messages', href: '/partner-portal/messages', icon: MessageSquare, badgeKey: 'messages' as const },
  { label: 'Settings', href: '/partner-portal/settings', icon: Settings },
] as const;

const LIMITED_NAV = [
  { label: 'Dashboard', href: '/partner-portal', icon: LayoutDashboard },
  { label: 'Settings', href: '/partner-portal/settings', icon: Settings },
] as const;

type PartnerNavProps = {
  partnerApproved: boolean;
};

export function PartnerNav({ partnerApproved }: PartnerNavProps) {
  const pathname = usePathname();
  const { user } = useAuth();
  const [threadUnread, setThreadUnread] = useState(0);

  const items = partnerApproved ? FULL_NAV : LIMITED_NAV;

  const loadUnread = useCallback(async () => {
    if (!user || !partnerApproved) {
      setThreadUnread(0);
      return;
    }
    const { data: conv } = await supabase
      .from('admin_conversations')
      .select('id')
      .eq('type', 'partner_inquiry')
      .eq('partner_id', user.id)
      .maybeSingle();
    if (!conv?.id) {
      setThreadUnread(0);
      return;
    }
    const { data: part } = await supabase
      .from('admin_conversation_participants')
      .select('last_read_at')
      .eq('conversation_id', conv.id)
      .eq('user_id', user.id)
      .maybeSingle();
    const lastRead = part?.last_read_at ? new Date(part.last_read_at).getTime() : 0;

    const { data: msgs } = await supabase
      .from('admin_messages')
      .select('id, sender_id, created_at')
      .eq('conversation_id', conv.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    const unread = (msgs ?? []).filter((m) => {
      if (!m.sender_id || m.sender_id === user.id) return false;
      const t = new Date(m.created_at).getTime();
      return t > lastRead;
    }).length;
    setThreadUnread(unread);
  }, [user, partnerApproved]);

  useEffect(() => {
    loadUnread();
  }, [loadUnread, pathname]);

  useEffect(() => {
    if (!user || !partnerApproved) return;
    const ch = supabase
      .channel('partner-nav-msgs')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'admin_messages' },
        () => {
          loadUnread();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, partnerApproved, loadUnread]);

  const isActive = (href: string) =>
    href === '/partner-portal' ? pathname === href || pathname === '/partner-portal/' : pathname.startsWith(href);

  return (
    <nav
      className="border-b border-[rgba(198,166,100,0.15)]"
      style={{ backgroundColor: 'rgba(198,166,100,0.03)' }}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide pb-px">
          {items.map((item) => {
            const { label, href, icon: Icon } = item;
            const active = isActive(href);
            const showBadge =
              'badgeKey' in item && item.badgeKey === 'messages' && threadUnread > 0;
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-2 px-4 py-3.5 text-sm font-medium whitespace-nowrap transition-colors relative shrink-0',
                  active ? 'text-[#C6A664]' : 'text-white/40 hover:text-white/70'
                )}
                style={
                  active
                    ? { borderBottom: '2px solid #C6A664', marginBottom: '-1px' }
                    : { borderBottom: '2px solid transparent', marginBottom: '-1px' }
                }
              >
                <Icon className="w-4 h-4" />
                {label}
                {showBadge && (
                  <span className="ml-1 min-w-[1.125rem] h-[1.125rem] px-1 rounded-full bg-[#C6A664] text-[0.65rem] font-bold text-black flex items-center justify-center">
                    {threadUnread > 99 ? '99+' : threadUnread}
                  </span>
                )}
              </Link>
            );
          })}

          {partnerApproved && (
            <div className="ml-auto flex items-center pl-4 py-2 shrink-0">
              <NotificationBell />
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
