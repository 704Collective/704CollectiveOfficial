'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Calendar, Users, QrCode, ClipboardList, Settings, BarChart2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AdminSection } from '@/components/AdminLayout';
import { WorkspaceSwitcher } from '@/components/admin/WorkspaceSwitcher';
import { NotificationBell } from '@/components/business/NotificationBell';
import logo from '@/assets/704-logo.png';

interface AdminSidebarProps {
  activeSection?: AdminSection;
  onSectionChange?: (section: AdminSection) => void;
  onMobileClose?: () => void;
}

export function AdminSidebar({ activeSection, onSectionChange, onMobileClose }: AdminSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isOnDashboard = pathname === '/admin';

  const handleSectionClick = (section: AdminSection) => {
    if (pathname !== '/admin') {
      router.push(`/admin?section=${section}`);
    } else {
      onSectionChange?.(section);
    }
    onMobileClose?.();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="p-5 pb-3">
        <button
          type="button"
          onClick={() => {
            if (pathname !== '/admin') router.push('/admin');
            onSectionChange?.('dashboard');
            onMobileClose?.();
          }}
          className="flex items-center gap-2.5 cursor-pointer hover:opacity-80 transition-opacity"
        >
          <Image src={logo} alt="704 Collective" width={32} height={32} className="rounded-lg" />
          <span className="text-base font-semibold text-foreground">704 Collective</span>
        </button>
      </div>

      {/* Workspace switcher */}
      <div className="px-4 pb-2">
        <WorkspaceSwitcher onMobileClose={onMobileClose} />
      </div>

      <div className="mx-4 border-t border-border" />

      {/* Main nav */}
      <nav className="flex-1 px-3 py-3 overflow-y-auto">

        {/* CORE */}
        <p className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground px-3 mt-3 mb-1.5">Core</p>
        <div className="space-y-0.5">
          {[
            { icon: LayoutDashboard, label: 'Overview',   section: 'dashboard'  as AdminSection },
            { icon: Calendar,        label: 'Events',     section: 'events'     as AdminSection },
            { icon: Users,           label: 'Members',    section: 'members'    as AdminSection },
            { icon: BarChart2,       label: 'Financials', section: 'financials' as AdminSection },
          ].map((item) => {
            const isActive = isOnDashboard && activeSection === item.section;
            return (
              <button
                key={item.section}
                type="button"
                onClick={() => handleSectionClick(item.section)}
                className={cn(
                  'flex items-center gap-3 w-full rounded-lg px-3 py-2 text-sm font-medium transition-colors text-left',
                  isActive
                    ? 'bg-accent text-foreground border-l-2 border-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/60'
                )}
              >
                <item.icon className={cn('w-4 h-4 shrink-0', isActive && 'text-primary')} />
                {item.label}
              </button>
            );
          })}
        </div>

        {/* OPERATIONS */}
        <div className="mt-5 border-t border-border pt-3">
          <p className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground px-3 mb-1.5">Operations</p>
          <div className="space-y-0.5">
            {[
              { icon: QrCode,         label: 'Check-in', section: 'checkin' as AdminSection },
              { icon: ClipboardList,  label: 'Tasks',    section: 'tasks'   as AdminSection },
            ].map((item) => {
              const isActive = isOnDashboard && activeSection === item.section;
              return (
                <button
                  key={item.section}
                  type="button"
                  onClick={() => handleSectionClick(item.section)}
                  className={cn(
                    'flex items-center gap-3 w-full rounded-lg px-3 py-2 text-sm font-medium transition-colors text-left',
                    isActive
                      ? 'bg-accent text-foreground border-l-2 border-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/60'
                  )}
                >
                  <item.icon className={cn('w-4 h-4 shrink-0', isActive && 'text-primary')} />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* SETTINGS */}
        <div className="mt-5 border-t border-border pt-3">
          <p className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground px-3 mb-1.5">Settings</p>
          <div className="space-y-0.5">
            <Link
              href="/admin/settings"
              onClick={onMobileClose}
              className={cn(
                'flex items-center gap-3 w-full rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                pathname === '/admin/settings'
                  ? 'bg-accent text-foreground border-l-2 border-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/60'
              )}
            >
              <Settings className={cn('w-4 h-4 shrink-0', pathname === '/admin/settings' && 'text-primary')} />
              Settings
            </Link>
          </div>
        </div>
      </nav>

      {/* Notification bell — pinned to bottom of sidebar */}
      <div className="px-4 py-4 border-t border-border">
        <div className="flex items-center gap-3">
          <NotificationBell />
          <span className="text-sm text-muted-foreground">Notifications</span>
        </div>
      </div>
    </div>
  );
}