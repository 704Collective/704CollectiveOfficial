'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Calendar,
  User,
  Settings,
  Bell,
  Rss,
  Briefcase,
  MessageCircle,
  BookUser,
  Network,
  Handshake,
  Menu,
  ChevronRight,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

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
  const { user, profile, isAdmin, isSuperAdmin, isActiveMember, isBusinessMember } = useAuth();
  const unreadMessages = useUnreadMessageCount(user?.id);

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + '/');

  // Determine which feed/portal features are visible
  const canSeeSocialFeed    = isActiveMember || isAdmin;
  const canSeeBusinessFeed  = isBusinessMember || isAdmin;
  const canSeeMessages      = isBusinessMember || isAdmin;
  const canSeeDirectory     = isBusinessMember || isAdmin;
  const canSeeHubs          = isBusinessMember || isAdmin;
  const canSeePartnerDirectory =
    (isBusinessMember && isActiveMember) || isAdmin || isSuperAdmin;

  const navItems: NavItem[] = [
    { href: '/dashboard',                   label: 'Overview',        icon: LayoutDashboard, exact: true },
    ...(canSeeSocialFeed   ? [{ href: '/dashboard/social-feed',   label: 'Social Feed',   icon: Rss }]            : []),
    ...(canSeeBusinessFeed ? [{ href: '/dashboard/business-feed', label: 'Business Feed', icon: Briefcase }]       : []),
    ...(canSeeMessages     ? [{ href: '/dashboard/messages',       label: 'Messages',      icon: MessageCircle, badge: unreadMessages }] : []),
    ...(canSeeDirectory    ? [{ href: '/dashboard/directory',      label: 'Directory',     icon: BookUser }]        : []),
    ...(canSeePartnerDirectory ? [{ href: '/dashboard/partners',   label: 'Partners',      icon: Handshake }]       : []),
    ...(canSeeHubs         ? [{ href: '/dashboard/hubs',           label: 'Hubs',          icon: Network }]         : []),
    { href: '/dashboard/events',             label: 'My Events',       icon: Calendar },
    { href: '/dashboard/profile',            label: 'Profile',         icon: User },
    { href: '/dashboard/notifications',      label: 'Notifications',   icon: Bell },
    { href: '/dashboard/settings',           label: 'Settings',        icon: Settings },
  ];

  const activeItem =
    navItems.find((item) => isActive(item.href, item.exact)) ?? navItems[0];

  return (
    <div className="w-full">
      {/* Mobile: current page + opens full labeled menu */}
      <div className="flex items-stretch gap-2 border-b border-border -mx-4 px-4 sm:hidden">
        <div className="min-w-0 flex-1 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            You are here
          </p>
          <p className="truncate text-sm font-semibold text-foreground">{activeItem.label}</p>
        </div>
        <Sheet>
          <SheetTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="my-2 shrink-0 gap-2 border-primary/25 bg-primary/5 px-3 font-semibold text-foreground hover:bg-primary/10"
            >
              <Menu className="h-4 w-4" aria-hidden />
              All sections
            </Button>
          </SheetTrigger>
          <SheetContent
            side="bottom"
            className="flex max-h-[min(88dvh,32rem)] flex-col rounded-t-2xl border-t p-0 shadow-2xl [&>button]:hidden"
          >
            <SheetHeader className="space-y-0 border-b border-border px-4 pb-3 pt-4 text-left">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <SheetTitle className="text-left text-base font-semibold">
                    Dashboard menu
                  </SheetTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Jump to any section of your member portal.
                  </p>
                </div>
                <SheetClose asChild>
                  <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 rounded-full">
                    <X className="h-4 w-4" />
                    <span className="sr-only">Close menu</span>
                  </Button>
                </SheetClose>
              </div>
            </SheetHeader>

            <nav
              className="flex-1 overflow-y-auto overscroll-contain px-3 py-3"
              aria-label="Dashboard navigation"
            >
              <ul className="flex flex-col gap-1">
                {navItems.map((item) => {
                  const itemActive = isActive(item.href, item.exact);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <SheetClose asChild>
                        <Link
                          href={item.href}
                          className={cn(
                            'flex items-center gap-3 rounded-xl px-3 py-3.5 text-sm font-medium transition-colors',
                            itemActive
                              ? 'bg-primary/12 text-foreground shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.2)]'
                              : 'text-foreground hover:bg-muted/80'
                          )}
                        >
                          <span
                            className={cn(
                              'relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                              itemActive
                                ? 'bg-primary/15 text-primary'
                                : 'bg-muted text-muted-foreground'
                            )}
                          >
                            <Icon className="h-5 w-5" aria-hidden />
                            {item.badge != null && item.badge > 0 && (
                              <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground">
                                {item.badge > 99 ? '99+' : item.badge}
                              </span>
                            )}
                          </span>
                          <span className="min-w-0 flex-1 text-left leading-snug">{item.label}</span>
                          <ChevronRight
                            className={cn(
                              'h-4 w-4 shrink-0 opacity-40',
                              itemActive && 'text-primary opacity-70'
                            )}
                            aria-hidden
                          />
                        </Link>
                      </SheetClose>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </SheetContent>
        </Sheet>
      </div>

      {/* Tablet/desktop: horizontal tabs with icons + labels */}
      <nav
        className="hidden sm:flex items-center border-b border-border overflow-x-auto scrollbar-hide whitespace-nowrap -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
        style={{ WebkitOverflowScrolling: 'touch' }}
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
                'relative flex items-center gap-2 px-1 py-3 mr-5 lg:mr-6 text-sm font-medium whitespace-nowrap transition-colors shrink-0 last:mr-0',
                active
                  ? 'text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-primary after:rounded-full'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <span className="relative inline-flex">
                <Icon className="w-4 h-4 shrink-0" />
                {item.badge != null && item.badge > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-[14px] h-3.5 px-0.5 bg-destructive text-destructive-foreground text-[9px] font-bold rounded-full flex items-center justify-center leading-none pointer-events-none">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
