'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Folder, Flag, History, Home, LayoutGrid, ListTodo, Plus, Settings } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useTasks } from '@/components/tasks/TasksProvider';
import { QuickAddSheet } from '@/components/tasks/QuickAddSheet';
import { NotificationBell } from '@/components/tasks/NotificationBell';
import { Button } from '@/components/ui/button';

function NavLink({
  href,
  label,
  icon: Icon,
  testId,
  badge,
  active,
}: {
  href: string;
  label: string;
  icon: typeof Home;
  testId: string;
  badge?: number;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      data-testid={testId}
      className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] md:flex-none md:flex-row md:gap-3 md:rounded-lg md:px-3 md:py-2.5 md:text-sm ${
        active ? 'text-[#C6A664]' : 'text-white/45 hover:text-white/80'
      }`}
    >
      <span className="relative">
        <Icon className="h-5 w-5" />
        {!!badge && (
          <span
            data-testid={`${testId}-badge`}
            className="absolute -right-2 -top-1.5 min-w-[16px] rounded-full bg-[#E24B4A] px-1 text-center text-[10px] font-bold text-white"
          >
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </span>
      {label}
    </Link>
  );
}

export function TasksShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading: authLoading, isAdmin, signOut } = useAuth();
  const { boot, loading, offline, isSuper, refresh } = useTasks();
  const [quickOpen, setQuickOpen] = useState(false);
  const folderMatch = pathname.match(/^\/admin\/tasks\/folders\/([^/]+)/);
  const defaultFolderId = isSuper ? (folderMatch?.[1] ?? boot?.inbox_folder_id ?? null) : null;

  const items = useMemo(() => {
    const overdue = boot?.overdue_count ?? 0;
    const foldersOrBoard = isSuper
      ? { href: '/admin/tasks/folders', label: 'Folders', icon: Folder, testId: 'tm-nav-folders' }
      : { href: '/admin/tasks/board', label: 'Board', icon: LayoutGrid, testId: 'tm-nav-board' };
    return [
      { href: '/admin/tasks', label: 'Home', icon: Home, testId: 'tm-nav-home' },
      { href: '/admin/tasks/my', label: 'My Tasks', icon: ListTodo, testId: 'tm-nav-my', badge: overdue },
      foldersOrBoard,
      { href: '/admin/tasks/goals', label: 'Goals', icon: Flag, testId: 'tm-nav-goals' },
      { href: '/admin/tasks/history', label: 'History', icon: History, testId: 'tm-nav-history' },
    ];
  }, [boot?.overdue_count, isSuper]);

  if (authLoading || loading) {
    return <div className="min-h-screen bg-[#0B0B0B]" data-testid="tasks-loading" />;
  }
  if (!user || !isAdmin) {
    router.replace('/admin/login');
    return <div className="min-h-screen bg-[#0B0B0B]" />;
  }

  const hideFab = pathname.startsWith('/admin/tasks/t/');

  return (
    <div className="tm min-h-dvh" data-testid="tm-shell" data-tm-role={boot?.role ?? ''}>
      {offline && (
        <div
          data-testid="tm-offline"
          className="sticky top-0 z-40 bg-[#3a2a10] px-4 py-2 text-center text-sm text-[#E8D29A]"
        >
          No connection
        </div>
      )}
      <div className="md:flex md:min-h-dvh">
        <aside className="hidden w-56 shrink-0 flex-col border-r border-white/[0.06] px-3 py-5 md:flex">
          <p className="tm-display px-3 pb-6 text-2xl text-[#C6A664]">704 Tasks</p>
          <nav className="flex flex-col gap-1">
            {items.map((item) => (
              <NavLink
                key={item.href}
                {...item}
                icon={item.icon}
                active={
                  item.href === '/admin/tasks'
                    ? pathname === '/admin/tasks'
                    : pathname === item.href || pathname.startsWith(`${item.href}/`)
                }
              />
            ))}
            {isSuper && (
              <NavLink
                href="/admin/tasks/manage"
                label="Manage"
                icon={Settings}
                testId="tm-nav-manage"
                active={pathname.startsWith('/admin/tasks/manage')}
              />
            )}
          </nav>
          <div className="mt-auto flex items-center justify-between px-1">
            <NotificationBell />
          <Button
            type="button"
            variant="ghost"
            className="text-white/40"
            data-testid="tasks-sign-out"
            onClick={async () => {
              await signOut();
              router.push('/admin/login');
            }}
          >
            Sign out
          </Button>
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col pb-20 md:pb-0">
          <header className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3 md:hidden">
            <p className="tm-display text-xl text-[#C6A664]">704 Tasks</p>
            <div className="flex items-center gap-1">
            <NotificationBell />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid="tasks-sign-out-mobile"
              className="text-white/40"
              onClick={async () => {
                await signOut();
                router.push('/admin/login');
              }}
            >
              Sign out
            </Button>
            </div>
          </header>
          <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-5">{children}</main>
        </div>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-white/[0.08] bg-[#0B0B0B]/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {items.map((item) => (
          <NavLink
            key={item.href}
            {...item}
            icon={item.icon}
            active={
              item.href === '/admin/tasks'
                ? pathname === '/admin/tasks'
                : pathname === item.href || pathname.startsWith(`${item.href}/`)
            }
          />
        ))}
      </nav>

      {!hideFab && (
        <button
          type="button"
          data-testid="tm-fab"
          onClick={() => setQuickOpen(true)}
          className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#C6A664] text-black shadow-lg md:bottom-8 md:right-8"
          aria-label="Add task"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}

      <QuickAddSheet
        open={quickOpen}
        onOpenChange={setQuickOpen}
        folderId={defaultFolderId}
        onCreated={() => void refresh()}
      />
    </div>
  );
}
