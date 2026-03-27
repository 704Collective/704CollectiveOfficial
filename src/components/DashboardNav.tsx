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
import { DASHBOARD_NAV_DESKTOP, DASHBOARD_NAV_SHELL } from '@/lib/dashboard-layout';
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
      /** Shorter label on desktop tab row only (mobile menu keeps `label`). */
      shortLabel?: string;
      icon: LucideIcon;
      exact?: boolean;
      badge?: number;
    }
  | {
      kind: 'suggest';
      key: 'suggest';
      label: string;
      shortLabel?: string;
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
      shortLabel: 'Social',
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
    items.push({
      kind: 'suggest',
      key: 'suggest',
      label: 'Suggestions',
      shortLabel: 'Suggest',
      icon: Lightbulb,
    });
  }

  items.push({
    kind: 'link',
    key: 'notifications',
    href: '/dashboard/notifications',
    label: 'Notifications',
    shortLabel: 'Alerts',
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

function desktopNavLabel(entry: NavEntry): string {
  if (entry.shortLabel) return entry.shortLabel;
  return entry.label;
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
    <div className="relative z-30 w-full min-w-0">
      <div className={DASHBOARD_NAV_SHELL}>
        <div className="flex w-full items-center justify-between gap-3 border-b border-border/80 py-2.5 sm:hidden">
          <div className="h-5 w-32 max-w-[55%] animate-pulse rounded-md bg-muted" />
          <div className="h-10 w-10 shrink-0 animate-pulse rounded-lg bg-muted" />
        </div>
      </div>
      <div className={cn(DASHBOARD_NAV_DESKTOP, 'hidden border-b border-border sm:block')}>
        <div
          className="grid min-h-[40px] w-full gap-1 py-2"
          style={{ gridTemplateColumns: 'repeat(11, minmax(0, 1fr))' }}
        >
          {Array.from({ length: 11 }).map((_, i) => (
            <div key={i} className="mx-auto h-3 w-full max-w-[3.5rem] animate-pulse rounded bg-muted" />
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
  const mobileBarRef = useRef<HTMLDivElement>(null);
  const [mobilePanelTop, setMobilePanelTop] = useState(0);

  const updateMobilePanelTop = useCallback(() => {
    const el = mobileBarRef.current;
    if (!el) return;
    setMobilePanelTop(Math.round(el.getBoundingClientRect().bottom));
  }, []);

  const suggestFromQuery = searchParams.get('suggest') === '1';
  const suggestActive = suggestOpen || suggestFromQuery;

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
      'relative flex w-full min-w-0 items-center justify-center gap-0.5 whitespace-nowrap px-0.5 pb-2 pt-0.5 text-center text-[10px] font-medium transition-colors sm:gap-1 sm:text-xs lg:gap-1.5 lg:text-[13px] xl:text-sm',
      isActive
        ? 'text-gold after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:rounded-full after:bg-gold'
        : 'text-muted-foreground hover:text-foreground'
    );

  const desktopTabActiveAttr = (isActive: boolean) =>
    isActive ? ({ 'data-dash-nav-active': 'true' as const } as const) : {};

  const renderDesktopTab = (entry: NavEntry) => {
    const isActive = entryIsActive(entry, pathname, suggestActive);
    const Icon = entry.icon;

    const inner = (
      <span className="flex min-w-0 flex-col items-center gap-0.5 lg:flex-row lg:gap-1">
        <span className="relative inline-flex shrink-0 text-current">
          <Icon className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5 lg:h-4 lg:w-4" aria-hidden />
          {entry.kind === 'link' && entry.badge != null && entry.badge > 0 && (
            <span
              className="pointer-events-none absolute -right-2 -top-1.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-gold px-0.5 text-[9px] font-bold leading-none text-charcoal"
            >
              {entry.badge > 99 ? '99+' : entry.badge}
            </span>
          )}
        </span>
        <span className="min-w-0 max-w-full truncate">{desktopNavLabel(entry)}</span>
      </span>
    );

    if (entry.kind === 'suggest') {
      const onDashboard = pathname === '/dashboard';
      if (onDashboard && onSuggestClick) {
        return (
          <button
            key={entry.key}
            type="button"
            tabIndex={-1}
            {...desktopTabActiveAttr(isActive)}
            className={cn(desktopTabClass(isActive), 'cursor-pointer border-0 bg-transparent p-0 text-left [font-family:inherit]')}
            onMouseDown={(e) => e.preventDefault()}
            onClick={onSuggestClick}
          >
            {inner}
          </button>
        );
      }
      return (
        <button
          key={entry.key}
          type="button"
          tabIndex={-1}
          {...desktopTabActiveAttr(isActive)}
          className={cn(desktopTabClass(isActive), 'cursor-pointer border-0 bg-transparent p-0 text-left [font-family:inherit]')}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => router.push('/dashboard?suggest=1')}
        >
          {inner}
        </button>
      );
    }

    return (
      <button
        key={entry.key}
        type="button"
        tabIndex={-1}
        {...desktopTabActiveAttr(isActive)}
        className={cn(desktopTabClass(isActive), 'cursor-pointer border-0 bg-transparent p-0 text-left [font-family:inherit]')}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => router.push(entry.href)}
      >
        {inner}
      </button>
    );
  };

  const renderMobileCell = (entry: NavEntry) => {
    const active = entryIsActive(entry, pathname, suggestActive);
    const Icon = entry.icon;

    const cellClass = cn(
      'flex min-h-[5.25rem] flex-col items-center justify-center gap-1.5 rounded-xl border px-2.5 py-3 text-center transition-colors sm:min-h-[5.5rem] sm:gap-2 sm:px-3 sm:py-3.5',
      active
        ? 'border-charcoal/20 bg-gold text-charcoal shadow-md shadow-black/25 ring-1 ring-black/10'
        : 'border-white/[0.08] bg-[#2E2E2E] hover:bg-[#353535]'
    );

    const iconWrap = (
      <span
        className={cn(
          'relative flex h-10 w-10 items-center justify-center rounded-xl sm:h-11 sm:w-11',
          active ? 'bg-black/15' : 'bg-black/30'
        )}
      >
        <Icon
          className="h-5 w-5"
          style={{ color: active ? '#141414' : GOLD }}
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
        className={cn(
          'text-[11px] font-semibold leading-tight sm:text-xs',
          active ? 'text-charcoal' : 'text-white'
        )}
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
      <div className={DASHBOARD_NAV_SHELL}>
        {/* Mobile: bar + menu anchored flush under bar (no gap above grid). */}
        <div className="relative sm:hidden">
          <div
            ref={mobileBarRef}
            className="flex w-full items-center justify-between gap-3 border-b border-border/80 py-2 sm:py-2.5"
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
              onClick={() => {
                setMobileOpen((o) => {
                  const next = !o;
                  if (next) queueMicrotask(() => updateMobilePanelTop());
                  return next;
                });
              }}
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
                  className="fixed inset-0 z-[44] cursor-default bg-black/55 sm:hidden"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  onClick={() => setMobileOpen(false)}
                />
                <motion.div
                  key="dash-nav-panel"
                  className="fixed left-0 right-0 z-[45] w-full overflow-y-auto shadow-2xl sm:hidden"
                  style={{
                    top: mobilePanelTop > 0 ? mobilePanelTop : 104,
                    maxHeight:
                      mobilePanelTop > 0
                        ? `calc(100dvh - ${mobilePanelTop}px - env(safe-area-inset-bottom, 0px) - 8px)`
                        : 'min(70dvh, calc(100dvh - env(safe-area-inset-bottom, 0px) - 8px))',
                    background: `linear-gradient(180deg, ${PANEL_BG} 0%, ${PANEL_BG_ALT} 100%)`,
                    borderTop: `1px solid rgba(198, 166, 100, 0.45)`,
                    boxShadow: '0 24px 48px rgba(0,0,0,0.45)',
                  }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                >
                  <nav className="px-3 pb-3 pt-1.5" aria-label="Dashboard navigation">
                    <div className="grid grid-cols-2 gap-2">
                      {navEntries.map((entry) => (
                        <div key={entry.key} className="min-w-0">
                          {renderMobileCell(entry)}
                        </div>
                      ))}
                    </div>
                  </nav>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Desktop: one row, equal columns — fits all tabs without horizontal scroll or clipping. */}
      <div className={cn(DASHBOARD_NAV_DESKTOP, 'hidden border-b border-border sm:block')}>
        <nav
          className="grid w-full min-w-0 gap-x-0.5 gap-y-0 py-2 sm:gap-x-1 lg:gap-x-1.5"
          style={{ gridTemplateColumns: `repeat(${navEntries.length}, minmax(0, 1fr))` }}
          aria-label="Dashboard navigation"
        >
          {navEntries.map(renderDesktopTab)}
        </nav>
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
