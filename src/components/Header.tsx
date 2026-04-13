'use client';

import { useRef, useCallback, useLayoutEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  LogOut,
  User,
  Settings,
  LayoutDashboard,
  Menu,
  X,
  Users,
  Bell,
  Calendar,
  ChevronRight,
  Shield,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { NotificationDropdown } from '@/components/portal/NotificationDropdown';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import { cn } from '@/lib/utils';
import { isMemberDashboardRoute } from '@/lib/member-dashboard-route';

const MARKETING_ROUTES = ['/'];

export function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, profile, isAdmin } = useAuth();
  const supabaseRef = useRef(createClient());
  const [windowDashboard, setWindowDashboard] = useState(false);

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;
    setWindowDashboard(isMemberDashboardRoute(window.location.pathname));
  }, [pathname]);

  const handleSignOut = useCallback(async () => {
    const { error } = await supabaseRef.current.auth.signOut();
    if (error) {
      toast.error('Failed to sign out');
    } else {
      toast.success('Signed out successfully');
      router.push('/login');
    }
  }, [router]);

  // Stable navigation callbacks — avoids recreating inline arrow functions on
  // every render, which can cause DropdownMenuItems to lose their handlers
  // briefly during re-renders triggered by auth state changes.
  const goToDashboard = useCallback(() => router.push('/dashboard'), [router]);
  const goToBrowseEvents = useCallback(() => router.push('/dashboard/browse-events'), [router]);
  const goToProfile = useCallback(() => router.push('/dashboard/profile'), [router]);
  const goToSettings = useCallback(() => router.push('/dashboard/settings'), [router]);
  const goToNotifications = useCallback(() => router.push('/dashboard/notifications'), [router]);
  const goToAdmin = useCallback(() => router.push('/admin'), [router]);

  if (MARKETING_ROUTES.includes(pathname)) {
    return null;
  }

  /** Member dashboard shell: hide public center nav (usePathname + window sync if hook lags). */
  const dashboardMemberHeader =
    isMemberDashboardRoute(pathname) || windowDashboard;

  const isActive = (path: string) => pathname === path || pathname.startsWith(path + '/');

  const BUSINESS_PATHS = ['/business-portal', '/dashboard/business-feed', '/dashboard/directory'];
  const isBusinessActive = (path: string) =>
    BUSINESS_PATHS.some(bp => path === bp || path.startsWith(bp + '/'));
  const isOnBusinessPortal = BUSINESS_PATHS.some(bp =>
    pathname === bp || pathname.startsWith(bp + '/')
  );

  const navLinkClass = (path: string) =>
    cn(
      "text-sm font-medium transition-colors duration-200 relative py-1",
      isActive(path)
        ? cn(
            "text-foreground",
            isBusinessActive(path)
              ? "after:absolute after:bottom-[-8px] after:left-0 after:right-0 after:h-0.5 after:rounded-full after:bg-[hsl(42,45%,58%)]"
              : "after:absolute after:bottom-[-8px] after:left-0 after:right-0 after:h-0.5 after:rounded-full after:bg-foreground"
          )
        : "text-muted-foreground hover:text-foreground"
    );

  const displayName = (profile as any)?.full_name || user?.user_metadata?.full_name || 'Member';
  const displayEmail = user?.email || '';
  const avatarUrl = (profile as any)?.avatar_url || user?.user_metadata?.avatar_url || null;

  return (
    <header className="sticky top-0 z-50 w-full min-w-0 border-b border-border bg-background/80 backdrop-blur-lg">
      <div
        className={cn(
          'mx-auto box-border flex h-14 w-full max-w-5xl items-center gap-2 px-4 sm:h-16 sm:px-6 lg:px-8',
          dashboardMemberHeader ? 'justify-between' : 'justify-between md:justify-start'
        )}
      >

        {/* Left — logo */}
        <div className="flex min-w-0 shrink-0 items-center">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo.png" alt="704 Collective" className="h-8 w-auto sm:h-9" height={36} width={36} />
          </Link>
        </div>

        {/* Center — public / marketing nav (hidden on member dashboard) */}
        {!dashboardMemberHeader && (
          <nav className="hidden min-w-0 flex-1 items-center justify-center gap-6 md:flex">
            {!user && (
              <Link href="/social" className={navLinkClass('/social')}>Social</Link>
            )}
            <Link
              href={user ? '/dashboard/browse-events' : '/events'}
              className={navLinkClass(user ? '/dashboard/browse-events' : '/events')}
            >
              Events
            </Link>
            {user ? (
              <Link href="/dashboard" className={navLinkClass('/dashboard')}>Dashboard</Link>
            ) : (
              <Link href="/login" className={navLinkClass('/login')}>Login</Link>
            )}
          </nav>
        )}

        {/* Right — avatar / mobile menu */}
        <div className={cn('flex shrink-0 items-center gap-2', !dashboardMemberHeader && 'md:ml-auto')}>
          {/* Mobile hamburger (not used on member dashboard — bell + avatar shown instead) */}
          {!dashboardMemberHeader && (
            <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
                <Menu className="h-5 w-5" aria-hidden />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className={cn(
                'flex w-[min(100vw-0.75rem,20.5rem)] flex-col overflow-hidden rounded-l-2xl border-l p-0 shadow-2xl [&>button]:hidden sm:max-w-[20.5rem]',
                user
                  ? 'border-[#C6A664]/20 bg-zinc-950 text-zinc-100'
                  : 'border-border bg-card'
              )}
            >
              <div
                className={cn(
                  'pointer-events-none absolute inset-x-0 top-0 h-32 opacity-90',
                  user
                    ? 'bg-gradient-to-b from-[#C6A664]/12 via-[rgba(198,166,100,0.04)] to-transparent'
                    : 'bg-gradient-to-b from-primary/8 via-transparent to-transparent'
                )}
                aria-hidden
              />

              <div className="relative flex flex-1 flex-col overflow-y-auto">
                {/* Top bar */}
                <div
                  className={cn(
                    'flex items-center justify-between px-4 pb-3 pt-5',
                    user ? 'border-b border-white/[0.06]' : 'border-b border-border'
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={cn(
                        'flex h-10 w-10 items-center justify-center rounded-xl shrink-0 ring-1',
                        user ? 'bg-black/40 ring-[#C6A664]/25' : 'bg-muted ring-border'
                      )}
                    >
                      <Image src="/logo.png" alt="704 Collective" className="h-6 w-auto" height={24} width={24} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        {user ? 'Member portal' : '704 Collective'}
                      </p>
                      <p className="truncate text-sm font-semibold text-foreground">
                        {user ? 'Menu' : 'Welcome'}
                      </p>
                    </div>
                  </div>
                  <SheetClose asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Close menu"
                      className={cn(
                        'h-9 w-9 rounded-full shrink-0',
                        user
                          ? 'text-zinc-400 hover:bg-white/10 hover:text-white'
                          : 'text-muted-foreground hover:bg-muted'
                      )}
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </Button>
                  </SheetClose>
                </div>

                {user && (
                  <div className="px-4 pt-4">
                    <div className="rounded-2xl border border-[#C6A664]/15 bg-gradient-to-br from-zinc-900/90 to-zinc-950/90 p-4 shadow-inner ring-1 ring-white/[0.04]">
                      <div className="flex items-center gap-3">
                        {avatarUrl ? (
                          <div className="relative shrink-0 ring-2 ring-[#C6A664]/30 rounded-full">
                            <Image
                              src={avatarUrl}
                              alt={displayName}
                              width={48}
                              height={48}
                              className="rounded-full object-cover h-12 w-12"
                              unoptimized
                            />
                          </div>
                        ) : (
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#C6A664]/15 text-lg font-bold text-[#C6A664] ring-2 ring-[#C6A664]/25">
                            {(displayName || displayEmail || 'U').charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-white">{displayName}</p>
                          <p className="truncate text-xs text-zinc-500">{displayEmail}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <nav className="relative flex flex-col gap-1.5 px-3 py-4">
                  <p
                    className={cn(
                      'px-2 pb-1 text-[10px] font-semibold uppercase tracking-widest',
                      user ? 'text-zinc-500' : 'text-muted-foreground'
                    )}
                  >
                    {user ? 'Navigate' : 'Explore'}
                  </p>

                  {!user && (
                    <SheetClose asChild>
                      <Link
                        href="/social"
                        className={cn(
                          'group flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all',
                          isActive('/social')
                            ? 'bg-primary/12 text-primary shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.25)]'
                            : 'text-foreground hover:bg-muted/80'
                        )}
                      >
                        <span
                          className={cn(
                            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                            isActive('/social') ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground group-hover:bg-muted/90'
                          )}
                        >
                          <Users className="h-4 w-4" />
                        </span>
                        <span className="flex-1 text-left">Social</span>
                        <ChevronRight className="h-4 w-4 shrink-0 opacity-40" />
                      </Link>
                    </SheetClose>
                  )}
                  <SheetClose asChild>
                    <Link
                      href={user ? '/dashboard/browse-events' : '/events'}
                      className={cn(
                        'group flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all',
                        user
                          ? isActive(user ? '/dashboard/browse-events' : '/events')
                            ? 'bg-[#C6A664]/12 text-[#C6A664] shadow-[inset_0_0_0_1px_rgba(198,166,100,0.28)]'
                            : 'text-zinc-200 hover:bg-white/[0.06] hover:text-white'
                          : isActive('/events')
                            ? 'bg-primary/12 text-primary shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.25)]'
                            : 'text-foreground hover:bg-muted/80'
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors',
                          user
                            ? isActive(user ? '/dashboard/browse-events' : '/events')
                              ? 'bg-[#C6A664]/20 text-[#C6A664]'
                              : 'bg-zinc-800 text-zinc-400 group-hover:bg-zinc-700'
                            : isActive('/events')
                              ? 'bg-primary/15 text-primary'
                              : 'bg-muted text-muted-foreground'
                        )}
                      >
                        <Calendar className="h-4 w-4" />
                      </span>
                      <span className="flex-1 text-left">Events</span>
                      <ChevronRight className="h-4 w-4 shrink-0 opacity-40" />
                    </Link>
                  </SheetClose>
                  {user ? (
                    <>
                      <SheetClose asChild>
                        <Link
                          href="/dashboard"
                          className={cn(
                            'group flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all',
                            pathname === '/dashboard'
                              ? 'bg-[#C6A664]/12 text-[#C6A664] shadow-[inset_0_0_0_1px_rgba(198,166,100,0.28)]'
                              : 'text-zinc-200 hover:bg-white/[0.06] hover:text-white'
                          )}
                        >
                          <span
                            className={cn(
                              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                              pathname === '/dashboard'
                                ? 'bg-[#C6A664]/20 text-[#C6A664]'
                                : 'bg-zinc-800 text-zinc-400 group-hover:bg-zinc-700'
                            )}
                          >
                            <LayoutDashboard className="h-4 w-4" />
                          </span>
                          <span className="flex-1 text-left">Dashboard</span>
                          <ChevronRight className="h-4 w-4 shrink-0 opacity-40" />
                        </Link>
                      </SheetClose>
                      <SheetClose asChild>
                        <Link
                          href="/dashboard/profile"
                          className={cn(
                            'group flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all',
                            isActive('/dashboard/profile')
                              ? 'bg-[#C6A664]/12 text-[#C6A664] shadow-[inset_0_0_0_1px_rgba(198,166,100,0.28)]'
                              : 'text-zinc-200 hover:bg-white/[0.06] hover:text-white'
                          )}
                        >
                          <span
                            className={cn(
                              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                              isActive('/dashboard/profile')
                                ? 'bg-[#C6A664]/20 text-[#C6A664]'
                                : 'bg-zinc-800 text-zinc-400 group-hover:bg-zinc-700'
                            )}
                          >
                            <User className="h-4 w-4" />
                          </span>
                          <span className="flex-1 text-left">Profile</span>
                          <ChevronRight className="h-4 w-4 shrink-0 opacity-40" />
                        </Link>
                      </SheetClose>
                      <SheetClose asChild>
                        <Link
                          href="/dashboard/notifications"
                          className={cn(
                            'group flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all',
                            isActive('/dashboard/notifications')
                              ? 'bg-[#C6A664]/12 text-[#C6A664] shadow-[inset_0_0_0_1px_rgba(198,166,100,0.28)]'
                              : 'text-zinc-200 hover:bg-white/[0.06] hover:text-white'
                          )}
                        >
                          <span
                            className={cn(
                              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                              isActive('/dashboard/notifications')
                                ? 'bg-[#C6A664]/20 text-[#C6A664]'
                                : 'bg-zinc-800 text-zinc-400 group-hover:bg-zinc-700'
                            )}
                          >
                            <Bell className="h-4 w-4" />
                          </span>
                          <span className="flex-1 text-left">Notifications</span>
                          <ChevronRight className="h-4 w-4 shrink-0 opacity-40" />
                        </Link>
                      </SheetClose>
                      <SheetClose asChild>
                        <Link
                          href="/dashboard/settings"
                          className={cn(
                            'group flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all',
                            isActive('/dashboard/settings')
                              ? 'bg-[#C6A664]/12 text-[#C6A664] shadow-[inset_0_0_0_1px_rgba(198,166,100,0.28)]'
                              : 'text-zinc-200 hover:bg-white/[0.06] hover:text-white'
                          )}
                        >
                          <span
                            className={cn(
                              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                              isActive('/dashboard/settings')
                                ? 'bg-[#C6A664]/20 text-[#C6A664]'
                                : 'bg-zinc-800 text-zinc-400 group-hover:bg-zinc-700'
                            )}
                          >
                            <Settings className="h-4 w-4" />
                          </span>
                          <span className="flex-1 text-left">Settings</span>
                          <ChevronRight className="h-4 w-4 shrink-0 opacity-40" />
                        </Link>
                      </SheetClose>
                      {isAdmin && (
                        <SheetClose asChild>
                          <Link
                            href="/admin"
                            className={cn(
                              'group flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all',
                              isActive('/admin')
                                ? 'bg-violet-500/15 text-violet-300 shadow-[inset_0_0_0_1px_rgba(139,92,246,0.35)]'
                                : 'text-zinc-200 hover:bg-white/[0.06] hover:text-white'
                            )}
                          >
                            <span
                              className={cn(
                                'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                                isActive('/admin')
                                  ? 'bg-violet-500/25 text-violet-200'
                                  : 'bg-zinc-800 text-zinc-400 group-hover:bg-zinc-700'
                              )}
                            >
                              <Shield className="h-4 w-4" />
                            </span>
                            <span className="flex-1 text-left">Admin panel</span>
                            <ChevronRight className="h-4 w-4 shrink-0 opacity-40" />
                          </Link>
                        </SheetClose>
                      )}
                    </>
                  ) : (
                    <SheetClose asChild>
                      <Link
                        href="/login"
                        className={cn(
                          'group flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all',
                          isActive('/login')
                            ? 'bg-primary/12 text-primary shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.25)]'
                            : 'text-foreground hover:bg-muted/80'
                        )}
                      >
                        <span
                          className={cn(
                            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                            isActive('/login') ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                          )}
                        >
                          <User className="h-4 w-4" />
                        </span>
                        <span className="flex-1 text-left">Login</span>
                        <ChevronRight className="h-4 w-4 shrink-0 opacity-40" />
                      </Link>
                    </SheetClose>
                  )}
                </nav>

                <div
                  className={cn(
                    'mt-auto border-t px-4 py-4',
                    user ? 'border-white/[0.06] bg-black/20' : 'border-border'
                  )}
                >
                  {user ? (
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full justify-center gap-2 rounded-xl border font-medium',
                        'border-white/10 bg-transparent text-zinc-300 hover:bg-white/[0.06] hover:text-white'
                      )}
                      onClick={handleSignOut}
                    >
                      <LogOut className="h-4 w-4" />
                      Sign out
                    </Button>
                  ) : (
                    <Button variant="hero" className="w-full rounded-xl shadow-lg" asChild>
                      <Link href="/join">Join 704 Collective</Link>
                    </Button>
                  )}
                </div>
              </div>
            </SheetContent>
            </Sheet>
          )}

          {/* Notification bell — always visible for logged-in dashboard pages; desktop-only elsewhere */}
          {user && (
            <div className={cn(dashboardMemberHeader ? 'flex' : 'hidden md:flex')}>
              <NotificationDropdown user={user} />
            </div>
          )}

          {/* Desktop auth (and mobile avatar when on member dashboard) */}
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn('relative', dashboardMemberHeader ? 'flex' : 'hidden md:flex')}
                >
                  {avatarUrl ? (
                    <Image src={avatarUrl} alt={displayName} width={32} height={32} className="rounded-full object-cover" unoptimized />
                  ) : isOnBusinessPortal ? (
                    <div className="w-8 h-8 rounded-full bg-[hsl(42,45%,58%)] flex items-center justify-center">
                      <span className="text-sm font-bold text-background">
                        {(displayName || displayEmail || 'U').charAt(0).toUpperCase()}
                      </span>
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                      <span className="text-sm font-bold text-primary-foreground">
                        {(displayName || displayEmail || 'U').charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium">{displayName}</p>
                  <p className="text-xs text-muted-foreground">{displayEmail}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={goToDashboard}>
                  <LayoutDashboard className="w-4 h-4 mr-2" />Dashboard
                </DropdownMenuItem>
                <DropdownMenuItem onClick={goToBrowseEvents}>
                  <Calendar className="w-4 h-4 mr-2" />Browse Events
                </DropdownMenuItem>
                <DropdownMenuItem onClick={goToProfile}>
                  <User className="w-4 h-4 mr-2" />Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={goToSettings}>
                  <Settings className="w-4 h-4 mr-2" />Settings
                </DropdownMenuItem>
                {isAdmin && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={goToAdmin}>
                      <User className="w-4 h-4 mr-2" />Admin Panel
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="w-4 h-4 mr-2" />Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="hidden md:flex items-center gap-2">
              <Button variant="hero" className="rounded-full" asChild>
                <Link href="/join">Join</Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}