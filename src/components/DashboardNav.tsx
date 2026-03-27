'use client';

import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Calendar,
  Settings,
  Bell,
  Rss,
  Briefcase,
  MessageCircle,
  BookUser,
  Network,
  Handshake,
  LayoutGrid,
  Lightbulb,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

const GOLD = '#C6A664';
const PANEL_BG = '#1A1A1A';
const PANEL_BG_ALT = '#2E2E2E';

// ---------------------------------------------------------------------------
// Unread counts (Supabase realtime)
// ---------------------------------------------------------------------------
function useUnreadMessageCount(userId: string | undefined): number {
  const [count, setCount] = useState(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!userId) {
      setCount(0);
      return;
    }

    const fetchCount = async () => {
      const { data: participantRows } = await supabase
        .from('conversation_participants')
        .select('conversation_id, last_read_at')
        .eq('user_id', userId);

      if (!participantRows?.length) {
        setCount(0);
        return;
      }

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

          const { count: c } = await q;
          total += c ?? 0;
        })
      );
      setCount(total);
    };

    fetchCount();

    channelRef.current = supabase
      .channel(`unread-messages:${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, fetchCount)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversation_participants', filter: `user_id=eq.${userId}` },
        fetchCount
      )
      .subscribe();

    return () => {
      channelRef.current?.unsubscribe();
    };
  }, [userId]);

  return count;
}

function useUnreadNotificationCount(userId: string | undefined): number {
  const [count, setCount] = useState(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!userId) {
      setCount(0);
      return;
    }

    const fetchCount = async () => {
      const { count: c } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_dismissed', false);
      setCount(c ?? 0);
    };

    fetchCount();

    channelRef.current = supabase
      .channel(`dashboard-nav-notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        () => fetchCount()
      )
      .subscribe();

    return () => {
      channelRef.current?.unsubscribe();
    };
  }, [userId]);

  return count;
}

// ---------------------------------------------------------------------------
// Nav model
// ---------------------------------------------------------------------------
type NavEntry =
  | {
      kind: 'link';
      key: string;
      href: string;
      label: string;
      icon: LucideIcon;
      exact?: boolean;
      badge?: number;
    }
  | {
      kind: 'suggest';
      key: 'suggest';
      label: string;
      icon: LucideIcon;
    };

function buildNavEntries(opts: {
  canSeeSocialFeed: boolean;
  canSeeBusinessFeed: boolean;
  canSeeMessages: boolean;
  canSeeDirectory: boolean;
  canSeeHubs: boolean;
  canSeePartnerDirectory: boolean;
  canSeeSuggest: boolean;
  canSeeSettings: boolean;
  unreadMessages: number;
  unreadNotifications: number;
}): NavEntry[] {
  const items: NavEntry[] = [];

  items.push({
    kind: 'link',
    key: 'overview',
    href: '/dashboard',
    label: 'Overview',
    icon: LayoutDashboard,
    exact: true,
  });

  if (opts.canSeeSocialFeed) {
    items.push({
      kind: 'link',
      key: 'social-feed',
      href: '/dashboard/social-feed',
      label: 'Social Feed',
      icon: Rss,
    });
  }

  if (opts.canSeeBusinessFeed) {
    items.push({
      kind: 'link',
      key: 'business-feed',
      href: '/dashboard/business-feed',
      label: 'Business Feed',
      icon: Briefcase,
    });
    items.push({
      kind: 'link',
      key: 'messages',
      href: '/dashboard/messages',
      label: 'Messages',
      icon: MessageCircle,
      badge: opts.unreadMessages,
    });
    items.push({
      kind: 'link',
      key: 'directory',
      href: '/dashboard/directory',
      label: 'Directory',
      icon: BookUser,
    });
    items.push({
      kind: 'link',
      key: 'hubs',
      href: '/dashboard/hubs',
      label: 'Hubs',
      icon: Network,
    });
  }

  if (opts.canSeePartnerDirectory) {
    items.push({
      kind: 'link',
      key: 'partners',
      href: '/dashboard/partners',
      label: 'Partners',
      icon: Handshake,
    });
  }

  items.push({
    kind: 'link',
    key: 'events',
    href: '/dashboard/events',
    label: 'Events',
    icon: Calendar,
  });

  if (opts.canSeeSuggest) {
    items.push({ kind: 'suggest', key: 'suggest', label: 'Suggest', icon: Lightbulb });
  }

  items.push({
    kind: 'link',
    key: 'notifications',
    href: '/dashboard/notifications',
    label: 'Notifications',
    icon: Bell,
    badge: opts.unreadNotifications,
  });

  if (opts.canSeeSettings) {
    items.push({
      kind: 'link',
      key: 'settings',
      href: '/dashboard/settings',
      label: 'Settings',
      icon: Settings,
    });
  }

  return items;
}

function entryIsActive(
  entry: NavEntry,
  pathname: string,
  suggestActive: boolean
): boolean {
  if (entry.kind === 'suggest') return suggestActive;
  if (entry.exact) return pathname === entry.href;
  return pathname === entry.href || pathname.startsWith(`${entry.href}/`);
}

function resolveActiveLabel(
  entries: NavEntry[],
  pathname: string,
  suggestActive: boolean
): string {
  const hit = entries.find((e) => entryIsActive(e, pathname, suggestActive));
  return hit?.label ?? entries[0]?.label ?? 'Dashboard';
}

function DashboardNavSuspenseFallback() {
  return (
    <div className="relative z-30 w-full">
      <div
        className={cn(
          'flex items-center justify-between gap-3 border-b border-border/80 py-2.5 sm:hidden',
          '-mx-4 px-4'
        )}
      >
        <div className="h-5 w-32 max-w-[55%] animate-pulse rounded-md bg-muted" />
        <div className="h-10 w-10 shrink-0 animate-pulse rounded-lg bg-muted" />
      </div>
      <div
        className={cn(
          'hidden min-h-[48px] items-center border-b border-border sm:flex',
          '-mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8'
        )}
      >
        <div className="flex w-full gap-5 py-3 lg:gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-4 w-20 shrink-0 animate-pulse rounded bg-muted" />
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DashboardNav
// ---------------------------------------------------------------------------
export interface DashboardNavProps {
  /** When true, highlights the Suggest tab (e.g. modal open on overview). */
  suggestOpen?: boolean;
  /** On overview, opens suggest modal instead of navigating with query param. */
  onSuggestClick?: () => void;
}

function DashboardNavInner({ suggestOpen = false, onSuggestClick }: DashboardNavProps = {}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, profile, isAdmin, isSuperAdmin, isActiveMember, isBusinessMember } = useAuth();
  const unreadMessages = useUnreadMessageCount(user?.id);
  const unreadNotifications = useUnreadNotificationCount(user?.id);

  const [mobileOpen, setMobileOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollFade, setShowScrollFade] = useState(false);
  const [atScrollEnd, setAtScrollEnd] = useState(true);

  const suggestFromQuery = searchParams.get('suggest') === '1';
  const suggestActive = suggestOpen || suggestFromQuery;

  const updateScrollFade = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const overflow = scrollWidth > clientWidth + 1;
    setShowScrollFade(overflow);
    setAtScrollEnd(!overflow || scrollLeft + clientWidth >= scrollWidth - 2);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => updateScrollFade());
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateScrollFade]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = 0;
    updateScrollFade();
    const id = requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollLeft = 0;
        updateScrollFade();
      }
    });
    return () => cancelAnimationFrame(id);
  }, [pathname, updateScrollFade]);

  const canSeeSocialFeed = isActiveMember || isAdmin;
  const canSeeBusinessFeed = isBusinessMember || isAdmin;
  const canSeeMessages = isBusinessMember || isAdmin;
  const canSeeDirectory = isBusinessMember || isAdmin;
  const canSeeHubs = isBusinessMember || isAdmin;
  const canSeePartnerDirectory =
    (isBusinessMember && isActiveMember) || isAdmin || isSuperAdmin;
  const canSeeSettings = isAdmin || isSuperAdmin;
  const canSeeSuggest = isActiveMember || isAdmin;

  const navEntries = buildNavEntries({
    canSeeSocialFeed,
    canSeeBusinessFeed,
    canSeeMessages,
    canSeeDirectory,
    canSeeHubs,
    canSeePartnerDirectory,
    canSeeSuggest,
    canSeeSettings,
    unreadMessages,
    unreadNotifications,
  });

  const activeLabel = resolveActiveLabel(navEntries, pathname, suggestActive);

  const desktopTabClass = (isActive: boolean) =>
    cn(
      'relative flex shrink-0 items-center gap-2 whitespace-nowrap px-1 py-3 text-sm font-medium transition-colors',
      'mr-5 last:mr-0 lg:mr-6 lg:last:mr-0',
      isActive
        ? 'text-gold after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:rounded-full after:bg-gold'
        : 'text-muted-foreground hover:text-foreground'
    );

  const renderDesktopTab = (entry: NavEntry) => {
    const isActive = entryIsActive(entry, pathname, suggestActive);
    const Icon = entry.icon;

    const inner = (
      <>
        <span className="relative inline-flex text-current">
          <Icon className="h-4 w-4 shrink-0" aria-hidden />
          {entry.kind === 'link' && entry.badge != null && entry.badge > 0 && (
            <span
              className="pointer-events-none absolute -right-2 -top-1.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-gold px-0.5 text-[9px] font-bold leading-none text-charcoal"
            >
              {entry.badge > 99 ? '99+' : entry.badge}
            </span>
          )}
        </span>
        <span>{entry.label}</span>
      </>
    );

    if (entry.kind === 'suggest') {
      const onDashboard = pathname === '/dashboard';
      if (onDashboard && onSuggestClick) {
        return (
          <button
            key={entry.key}
            type="button"
            onClick={onSuggestClick}
            className={desktopTabClass(isActive)}
          >
            {inner}
          </button>
        );
      }
      return (
        <Link
          key={entry.key}
          href="/dashboard?suggest=1"
          className={desktopTabClass(isActive)}
          tabIndex={-1}
        >
          {inner}
        </Link>
      );
    }

    return (
      <Link key={entry.key} href={entry.href} className={desktopTabClass(isActive)} tabIndex={-1}>
        {inner}
      </Link>
    );
  };

  const renderMobileCell = (entry: NavEntry) => {
    const active = entryIsActive(entry, pathname, suggestActive);
    const Icon = entry.icon;

    const cellClass = cn(
      'flex flex-col items-center justify-center gap-2 rounded-xl border border-transparent px-3 py-4 text-center transition-colors',
      active ? 'border-gold/40 bg-gold text-[#1A1A1A]' : 'bg-[#2E2E2E]/80 hover:bg-[#2E2E2E]'
    );

    const iconWrap = (
      <span className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-black/25">
        <Icon
          className="h-5 w-5"
          style={{ color: active ? '#1A1A1A' : GOLD }}
          aria-hidden
        />
        {entry.kind === 'link' && entry.badge != null && entry.badge > 0 && (
          <span
            className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none"
            style={{
              backgroundColor: active ? '#1A1A1A' : GOLD,
              color: active ? GOLD : '#1A1A1A',
            }}
          >
            {entry.badge > 99 ? '99+' : entry.badge}
          </span>
        )}
      </span>
    );

    const labelEl = (
      <span
        className={cn('text-xs font-semibold leading-tight', active ? 'text-[#1A1A1A]' : 'text-white')}
      >
        {entry.label}
      </span>
    );

    const close = () => setMobileOpen(false);

    if (entry.kind === 'suggest') {
      const onDashboard = pathname === '/dashboard';
      if (onDashboard && onSuggestClick) {
        return (
          <button
            key={entry.key}
            type="button"
            className={cellClass}
            onClick={() => {
              close();
              onSuggestClick();
            }}
          >
            {iconWrap}
            {labelEl}
          </button>
        );
      }
      return (
        <Link key={entry.key} href="/dashboard?suggest=1" className={cellClass} onClick={close}>
          {iconWrap}
          {labelEl}
        </Link>
      );
    }

    return (
      <Link key={entry.key} href={entry.href} className={cellClass} onClick={close}>
        {iconWrap}
        {labelEl}
      </Link>
    );
  };

  return (
    <div className="relative z-30 min-w-0 w-full">
      {/* Mobile header row */}
      <div
        className={cn(
          'flex items-center justify-between gap-3 border-b border-border/80 py-2.5 sm:hidden',
          '-mx-4 px-4'
        )}
      >
        <p
          className="min-w-0 truncate text-sm font-semibold tracking-tight"
          style={{ color: GOLD }}
        >
          {activeLabel}
        </p>
        <button
          type="button"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gold/25 bg-gold/5 transition-colors hover:bg-gold/10"
          style={{ color: GOLD }}
          aria-expanded={mobileOpen}
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          onClick={() => setMobileOpen((o) => !o)}
        >
          <LayoutGrid className="h-5 w-5" aria-hidden />
        </button>
      </div>

      <AnimatePresence mode="sync">
        {mobileOpen && (
          <>
            <motion.button
              key="dash-nav-backdrop"
              type="button"
              aria-label="Close menu"
              className="fixed inset-0 z-40 cursor-default bg-black/55 sm:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setMobileOpen(false)}
            />
            <motion.div
              key="dash-nav-panel"
              className="absolute left-1/2 z-50 w-screen max-w-[100vw] -translate-x-1/2 sm:hidden"
              style={{
                top: '100%',
                marginTop: 0,
                background: `linear-gradient(180deg, ${PANEL_BG} 0%, ${PANEL_BG_ALT} 100%)`,
                borderTop: `1px solid rgba(198, 166, 100, 0.45)`,
                boxShadow: '0 24px 48px rgba(0,0,0,0.45)',
              }}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              <nav className="px-3 pb-5 pt-4" aria-label="Dashboard navigation">
                <div className="grid grid-cols-2 gap-2">{navEntries.map(renderMobileCell)}</div>
              </nav>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Desktop horizontal tabs only — mobile uses hamburger above */}
      <div className="hidden min-w-0 w-full sm:block">
        <div style={{ position: 'relative', minWidth: 0, width: '100%' }}>
          <div
            ref={scrollRef}
            className="dashboard-nav-desktop-scroll border-b border-border -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
            style={{
              display: 'flex',
              flexDirection: 'row',
              flexWrap: 'nowrap',
              overflowX: 'auto',
              overflowAnchor: 'none',
              WebkitOverflowScrolling: 'touch',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              minHeight: 48,
              minWidth: 0,
              width: '100%',
              alignItems: 'stretch',
            }}
            onScroll={updateScrollFade}
            aria-label="Dashboard navigation"
          >
            {navEntries.map(renderDesktopTab)}
          </div>
          {showScrollFade && !atScrollEnd && (
            <div
              aria-hidden
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                bottom: 0,
                width: 60,
                background: 'linear-gradient(to right, transparent, #1A1A1A)',
                pointerEvents: 'none',
                zIndex: 10,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export function DashboardNav(props: DashboardNavProps = {}) {
  const { profile } = useAuth();
  if (profile?.member_type === 'partner') {
    return null;
  }

  return (
    <Suspense fallback={<DashboardNavSuspenseFallback />}>
      <DashboardNavInner {...props} />
    </Suspense>
  );
}
