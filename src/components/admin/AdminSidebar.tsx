'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Calendar, Users, QrCode, ClipboardList, Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AdminSection } from '@/components/AdminLayout';
import { WorkspaceSwitcher } from '@/components/admin/WorkspaceSwitcher';
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
      // Navigate to /admin with ?section= so AdminDashboard picks up the right tab
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
          onClick={() => {
            if (pathname !== '/admin') {
              router.push('/admin');
            }
            onSectionChange?.('dashboard');
            onMobileClose?.();
          }}
          className="flex items-center gap-2.5 cursor-pointer"
        >
          <img src={logo} alt="704 Collective" className="h-8 w-8 rounded-lg" />
          <span className="text-lg font-semibold">704 Collective</span>
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
        <p className="text-xs uppercase tracking-wider text-muted-foreground/60 px-4 mt-3 mb-1">Core</p>
        <div className="space-y-0.5">
          {[
            { icon: LayoutDashboard, label: 'Overview', section: 'dashboard' as AdminSection },
            { icon: Calendar, label: 'Events', section: 'events' as AdminSection },
            { icon: Users, label: 'Members', section: 'members' as AdminSection },
          ].map((item) => {
            const isActive = isOnDashboard && activeSection === item.section;
            return (
              <button
                key={item.section}
                onClick={() => handleSectionClick(item.section)}
                className={cn(
                  'flex items-center gap-3 w-full rounded-lg px-3 py-2 text-sm font-medium transition-colors text-left',
                  isActive
                    ? 'bg-accent text-foreground border-l-2 border-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                )}
              >
                <item.icon className="w-4 h-4 shrink-0" />
                {item.label}
              </button>
            );
          })}
        </div>

        {/* OPERATIONS */}
        <div className="mt-5 border-t border-border pt-3">
          <p className="text-xs uppercase tracking-wider text-muted-foreground/60 px-4 mb-1">Operations</p>
          <div className="space-y-0.5">
            {[
              { icon: QrCode, label: 'Check-in', section: 'checkin' as AdminSection },
              { icon: ClipboardList, label: 'Tasks', section: 'tasks' as AdminSection },
            ].map((item) => {
              const isActive = isOnDashboard && activeSection === item.section;
              return (
                <button
                  key={item.section}
                  onClick={() => handleSectionClick(item.section)}
                  className={cn(
                    'flex items-center gap-3 w-full rounded-lg px-3 py-2 text-sm font-medium transition-colors text-left',
                    isActive
                      ? 'bg-accent text-foreground border-l-2 border-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                  )}
                >
                  <item.icon className="w-4 h-4 shrink-0" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* SETTINGS */}
        <div className="mt-5 border-t border-border pt-3">
          <p className="text-xs uppercase tracking-wider text-muted-foreground/60 px-4 mb-1">Settings</p>
          <div className="space-y-0.5">
            {[
              { icon: Settings, label: 'Settings', href: '/admin/settings' },
            ].map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onMobileClose}
                  className={cn(
                    'flex items-center gap-3 w-full rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-accent text-foreground border-l-2 border-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                  )}
                >
                  <item.icon className="w-4 h-4 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

    </div>
  );
}
