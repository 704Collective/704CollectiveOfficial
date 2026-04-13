'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Calendar, Contact, DollarSign, Mail, MessageSquare,
  QrCode, Layers, FileText, GitPullRequest, ClipboardList, Settings,
  Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AdminSection } from '@/components/AdminLayout';
import { WorkspaceSwitcher } from '@/components/admin/WorkspaceSwitcher';
import { NotificationBell } from '@/components/business/NotificationBell';
import { useAuth } from '@/hooks/useAuth';

interface AdminSidebarProps {
  activeSection?: AdminSection;
  onSectionChange?: (section: AdminSection) => void;
  onMobileClose?: () => void;
}

export function AdminSidebar({ activeSection, onSectionChange, onMobileClose }: AdminSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { isSuperAdmin, isAdmin } = useAuth();
  const isOnDashboard = pathname === '/admin';

  const handleSectionClick = (section: AdminSection) => {
    if (pathname !== '/admin') {
      router.push(`/admin?section=${section}`);
    } else {
      onSectionChange?.(section);
    }
    onMobileClose?.();
  };

  const sectionBtn = (item: { icon: React.ElementType; label: string; section: AdminSection }) => {
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
            : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
        )}
      >
        <item.icon className={cn('w-4 h-4 shrink-0', isActive ? 'text-foreground' : '')} />
        {item.label}
      </button>
    );
  };

  const linkBtn = (href: string, icon: React.ElementType, label: string) => {
    const Icon = icon;
    const isActive = href === '/admin/crm/contacts'
      ? pathname.startsWith('/admin/crm/contacts') || pathname.startsWith('/admin/contacts')
      : href === '/admin/crm/campaigns'
      ? pathname.startsWith('/admin/crm/campaigns') || pathname.startsWith('/admin/email')
      : pathname.startsWith(href);
    return (
      <Link
        key={href}
        href={href}
        onClick={onMobileClose}
        className={cn(
          'flex items-center gap-3 w-full rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          isActive
            ? 'bg-accent text-foreground border-l-2 border-primary'
            : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
        )}
      >
        <Icon className="w-4 h-4 shrink-0" />
        {label}
      </Link>
    );
  };

  const disabledBtn = (icon: React.ElementType, label: string, tooltip: string) => {
    const Icon = icon;
    return (
      <button
        key={label}
        type="button"
        disabled
        title={tooltip}
        aria-label={`${label} — ${tooltip}`}
        className="flex items-center gap-3 w-full rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground/40 cursor-not-allowed select-none"
      >
        <Icon className="w-4 h-4 shrink-0" />
        {label}
        <span className="ml-auto text-[10px] bg-muted text-muted-foreground/60 rounded px-1.5 py-0.5 font-normal leading-none">
          Soon
        </span>
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
          <Image src="/logo.png" alt="704 Collective" width={32} height={32} className="h-8 w-8 rounded-lg" />
          <span className="text-lg font-semibold text-foreground">704 Collective</span>
        </button>
      </div>

      {/* Workspace switcher */}
      <div className="px-4 pb-2">
        <WorkspaceSwitcher onMobileClose={onMobileClose} />
      </div>

      <div className="mx-4 border-t border-border" />

      {/* Main nav */}
      <nav className="flex-1 px-3 py-3 overflow-y-auto space-y-0.5">

        {/* Group 1 — no heading */}
        {sectionBtn({ icon: LayoutDashboard, label: 'Dashboard',  section: 'dashboard' })}
        {sectionBtn({ icon: Calendar,        label: 'Events',     section: 'events'    })}
        {linkBtn('/admin/crm/contacts', Contact, 'Contacts')}
        {isSuperAdmin && sectionBtn({ icon: DollarSign, label: 'Financials', section: 'financials' })}
        {linkBtn('/admin/crm/campaigns', Mail, 'Email')}
        {disabledBtn(MessageSquare, 'Messages', 'Coming soon - SMS via Twilio')}
        {sectionBtn({ icon: QrCode, label: 'Check-in', section: 'checkin' })}

        {/* Group 2 — BUSINESS */}
        <div className="mt-5 pt-3 border-t border-border">
          <p className="text-xs uppercase tracking-wider text-muted-foreground/60 px-4 mb-1 font-normal">Business</p>
          <div className="space-y-0.5">
            {linkBtn('/admin/hubs', Layers, 'Hubs')}
            {sectionBtn({ icon: FileText, label: 'Applications', section: 'applications' })}
            {linkBtn('/admin/referrals', GitPullRequest, 'Referrals')}
          </div>
        </div>

        {/* Group 3 — no heading */}
        <div className="mt-5 pt-3 border-t border-border space-y-0.5">
          {sectionBtn({ icon: ClipboardList, label: 'Tasks', section: 'tasks' })}
          {linkBtn('/admin/settings', Settings, 'Settings')}
        </div>

        {/* Super-admin only: User Security */}
        {isSuperAdmin && (
          <div className="mt-5 pt-3 border-t border-border space-y-0.5">
            <Link
              href="/admin/user-security"
              onClick={onMobileClose}
              className={cn(
                'flex items-center gap-3 w-full rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                pathname.startsWith('/admin/user-security')
                  ? 'bg-accent text-foreground border-l-2 border-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
              )}
            >
              <Shield className="w-4 h-4 shrink-0" />
              User Security
            </Link>
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
