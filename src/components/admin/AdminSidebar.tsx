'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Calendar, Users, QrCode, ClipboardList, Settings, BarChart2,
  Contact, Mail, Workflow, PieChart, GitPullRequest, FileText, Share2, Megaphone,
  ClipboardCheck, LayoutGrid, Inbox, ClipboardSignature, UserX, Lightbulb,
  FolderOpen, Network, Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AdminSection } from '@/components/AdminLayout';
import { WorkspaceSwitcher } from '@/components/admin/WorkspaceSwitcher';
import { NotificationBell } from '@/components/business/NotificationBell';
import { useAuth } from '@/hooks/useAuth';
import logo from '@/assets/704-logo.png';

interface AdminSidebarProps {
  activeSection?: AdminSection;
  onSectionChange?: (section: AdminSection) => void;
  onMobileClose?: () => void;
}

const CRM_NAV = [
  { icon: LayoutGrid,     label: 'Dashboard',   href: '/admin/crm' },
  { icon: Contact,        label: 'Contacts',    href: '/admin/crm/contacts' },
  { icon: Mail,           label: 'Campaigns',   href: '/admin/crm/campaigns' },
  { icon: Workflow,       label: 'Automations', href: '/admin/crm/automations' },
  { icon: GitPullRequest, label: 'Pipeline',    href: '/admin/crm/pipeline' },
  { icon: FileText,       label: 'Forms',       href: '/admin/crm/forms' },
  { icon: Share2,         label: 'Social',      href: '/admin/crm/social' },
  { icon: Megaphone,      label: 'Ads',         href: '/admin/crm/ads' },
  { icon: ClipboardCheck, label: 'Surveys',     href: '/admin/crm/surveys' },
  { icon: PieChart,       label: 'Reports',     href: '/admin/crm/reports' },
  { icon: Inbox,          label: 'Inbox',       href: '/admin/crm/inbox' },
];

export function AdminSidebar({ activeSection, onSectionChange, onMobileClose }: AdminSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { isSuperAdmin, isAdmin } = useAuth();
  const isOnDashboard = pathname === '/admin';

  const isAdminOrSuper = isAdmin;

  const handleSectionClick = (section: AdminSection) => {
    if (pathname !== '/admin') {
      router.push(`/admin?section=${section}`);
    } else {
      onSectionChange?.(section);
    }
    onMobileClose?.();
  };

  const navBtn = (item: { icon: React.ElementType; label: string; section: AdminSection }) => {
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
          {navBtn({ icon: LayoutDashboard, label: 'Overview',   section: 'dashboard'  })}
          {navBtn({ icon: Calendar,        label: 'Events',     section: 'events'     })}
          {navBtn({ icon: Users,           label: 'Members',    section: 'members'    })}
          {isSuperAdmin && navBtn({ icon: BarChart2, label: 'Financials', section: 'financials' })}

          {/* Admin + super admin only */}
          {isAdminOrSuper && (<>
            {navBtn({ icon: ClipboardSignature, label: 'Applications', section: 'applications' })}
            {navBtn({ icon: UserX,              label: 'Non-Members',  section: 'non-members'  })}
            {navBtn({ icon: Lightbulb,          label: 'Suggestions',  section: 'suggestions'  })}
          </>)}
        </div>

        {/* OPERATIONS */}
        <div className="mt-5 border-t border-border pt-3">
          <p className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground px-3 mb-1.5">Operations</p>
          <div className="space-y-0.5">
            {navBtn({ icon: QrCode,        label: 'Check-in', section: 'checkin' })}
            {navBtn({ icon: ClipboardList, label: 'Tasks',    section: 'tasks'   })}
          </div>
        </div>

        {/* CRM */}
        <div className="mt-5 border-t border-border pt-3">
          <p className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground px-3 mb-1.5">CRM</p>
          <div className="space-y-0.5">
            {CRM_NAV.map((item) => {
              const isActive = item.href === '/admin/crm'
                ? pathname === '/admin/crm'
                : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onMobileClose}
                  className={cn(
                    'flex items-center gap-3 w-full rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-accent text-foreground border-l-2 border-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/60'
                  )}
                >
                  <item.icon className={cn('w-4 h-4 shrink-0', isActive && 'text-primary')} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>

        {/* PORTAL — admin + super admin */}
        {isAdminOrSuper && (
          <div className="mt-5 border-t border-border pt-3">
            <p className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground px-3 mb-1.5">Portal</p>
            <div className="space-y-0.5">
              <Link
                href="/admin/hubs"
                onClick={onMobileClose}
                className={cn(
                  'flex items-center gap-3 w-full rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  pathname.startsWith('/admin/hubs')
                    ? 'bg-accent text-foreground border-l-2 border-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/60'
                )}
              >
                <Network className={cn('w-4 h-4 shrink-0', pathname.startsWith('/admin/hubs') && 'text-primary')} />
                Hubs
              </Link>
              <Link
                href="/admin/resources"
                onClick={onMobileClose}
                className={cn(
                  'flex items-center gap-3 w-full rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  pathname.startsWith('/admin/resources')
                    ? 'bg-accent text-foreground border-l-2 border-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/60'
                )}
              >
                <FolderOpen className={cn('w-4 h-4 shrink-0', pathname.startsWith('/admin/resources') && 'text-primary')} />
                Resources
              </Link>
              {isSuperAdmin && (
                <Link
                  href="/admin/user-security"
                  onClick={onMobileClose}
                  className={cn(
                    'flex items-center gap-3 w-full rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    pathname.startsWith('/admin/user-security')
                      ? 'bg-accent text-foreground border-l-2 border-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/60'
                  )}
                >
                  <Shield className={cn('w-4 h-4 shrink-0', pathname.startsWith('/admin/user-security') && 'text-primary')} />
                  User Security
                </Link>
              )}
            </div>
          </div>
        )}

        {/* SETTINGS — super admin only */}
        {isSuperAdmin && (
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
        )}
      </nav>

      {/* Notification bell */}
      <div className="px-4 py-4 border-t border-border">
        <div className="flex items-center gap-3">
          <NotificationBell />
          <span className="text-sm text-muted-foreground">Notifications</span>
        </div>
      </div>
    </div>
  );
}