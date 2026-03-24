'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Calendar, User, Settings, Bell,
  Rss, Briefcase, MessageCircle, BookUser, Network,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

// ---------------------------------------------------------------------------
// Nav items — built dynamically based on role/membership
// ---------------------------------------------------------------------------
interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  exact?: boolean;
  badge?: number;
}

function useUnreadMessageCount(userId: string | undefined): number {
  const [count, setCount] = useState(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!userId) { setCount(0); return; }

    const fetchCount = async () => {
      // Count messages in conversations the user participates in
      // that arrived after last_read_at (or any if last_read_at is null)
      const { data: participantRows } = await supabase
        .from('conversation_participants')
        .select('conversation_id, last_read_at')
        .eq('user_id', userId);

      if (!participantRows?.length) { setCount(0); return; }

      let total = 0;
      await Promise.all(
        participantRows.map(async ({ conversation_id, last_read_at }) => {
          let q = supabase
            .from('messages')
            .select('id', { count: 'exact', head: true })
            .eq('conversation_id', conversation_id)
            .neq('sender_id', userId)
            .is('deleted_at', null);

          if (last_read_at) q = q.gt('created_at', last_read_at);

          const { count } = await q;
          total += count ?? 0;
        })
      );
      setCount(total);
    };

    fetchCount();

    channelRef.current = supabase
      .channel(`unread-messages:${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, fetchCount)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversation_participants', filter: `user_id=eq.${userId}` }, fetchCount)
      .subscribe();

    return () => { channelRef.current?.unsubscribe(); };
  }, [userId]);

  return count;
}

// ---------------------------------------------------------------------------
// DashboardNav
// ---------------------------------------------------------------------------
export function DashboardNav() {
  const pathname = usePathname();
  const { user, profile, isAdmin, isActiveMember, isBusinessMember } = useAuth();
  const unreadMessages = useUnreadMessageCount(user?.id);

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + '/');

  // Determine which feed/portal features are visible
  const canSeeSocialFeed    = isActiveMember || isAdmin;
  const canSeeBusinessFeed  = isBusinessMember || isAdmin;
  const canSeeMessages      = isBusinessMember || isAdmin;
  const canSeeDirectory     = isBusinessMember || isAdmin;
  const canSeeHubs          = isBusinessMember || isAdmin;

  const navItems: NavItem[] = [
    { href: '/dashboard',                   label: 'Overview',        icon: LayoutDashboard, exact: true },
    ...(canSeeSocialFeed   ? [{ href: '/dashboard/feed/social',   label: 'Social Feed',   icon: Rss }]            : []),
    ...(canSeeBusinessFeed ? [{ href: '/dashboard/feed/business', label: 'Business Feed', icon: Briefcase }]       : []),
    ...(canSeeMessages     ? [{ href: '/dashboard/messages',       label: 'Messages',      icon: MessageCircle, badge: unreadMessages }] : []),
    ...(canSeeDirectory    ? [{ href: '/dashboard/directory',      label: 'Directory',     icon: BookUser }]        : []),
    ...(canSeeHubs         ? [{ href: '/dashboard/hubs',           label: 'Hubs',          icon: Network }]         : []),
    { href: '/dashboard/events',             label: 'My Events',       icon: Calendar },
    { href: '/dashboard/profile',            label: 'Profile',         icon: User },
    { href: '/dashboard/notifications',      label: 'Notifications',   icon: Bell },
    { href: '/dashboard/settings',           label: 'Settings',        icon: Settings },
  ];

  return (
    <nav
      className="flex items-center border-b border-border overflow-x-auto scrollbar-hide -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
      aria-label="Dashboard navigation"
    >
      {navItems.map((item) => {
        const active = isActive(item.href, item.exact);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'relative flex items-center gap-1.5 sm:gap-2 px-1 py-3.5 sm:py-3 mr-4 sm:mr-6 text-sm font-medium whitespace-nowrap transition-colors shrink-0 last:mr-0',
              active
                ? 'text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-primary after:rounded-full'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <span className="relative">
              <Icon className="w-4 h-4 shrink-0" />
              {/* Badge for message count */}
              {item.badge != null && item.badge > 0 && (
                <span className="absolute -top-1.5 -right-2 min-w-[14px] h-3.5 px-0.5 bg-destructive text-destructive-foreground text-[9px] font-bold rounded-full flex items-center justify-center leading-none pointer-events-none">
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              )}
            </span>
            {/* Label: hidden on very small screens */}
            <span className="hidden xs:inline sm:inline">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
