'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Calendar, Users, UserX, FileText, DollarSign, Mail,
  MessageSquare, QrCode, Layers, GitPullRequest, Handshake, Receipt,
  Newspaper, Shield, Lightbulb, BookOpen, Inbox, Upload, Lock, Database,
  AlertTriangle, ClipboardList, Settings, BarChart2,
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
  const isAdminOrSuper = isAdmin || isSuperAdmin;

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
    const isActive = pathname === href || pathname.startsWith(href + '/') || pathname.startsWith(href + '?');
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

  const groupHeading = (label: string) => (
    <p className="text-xs uppercase tracking-wider text-muted-foreground/60 px-4 mb-1 font-normal">{label}</p>
  );

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
      <nav className="flex-1 px-3 py-3 overflow-y-auto">

        {/* ── Group 1 — no heading ── */}
        <div className="space-y-0.5">
          {sectionBtn({ icon: LayoutDashboard, label: 'Dashboard',    section: 'dashboard'  })}
          {sectionBtn({ icon: Calendar,        label: 'Events',       section: 'events'     })}
          {sectionBtn({ icon: Users,           label: 'Members',      section: 'members'    })}
          {sectionBtn({ icon: UserX,           label: 'Non-Members',  section: 'non-members' })}
          {sectionBtn({ icon: FileText,        label: 'Applications', section: 'applications' })}
          {isSuperAdmin && sectionBtn({ icon: DollarSign, label: 'Financials', section: 'financials' })}
          {linkBtn('/admin/crm/campaigns', Mail, 'Email')}
          {disabledBtn(MessageSquare, 'Messages', 'Coming soon - SMS via Twilio')}
          {sectionBtn({ icon: QrCode, label: 'Check-in', section: 'checkin' })}
          {linkBtn('/admin/crm', BarChart2, 'CRM')}
        </div>

        {/* ── Group 2 — BUSINESS ── */}
        <div className="mt-5 pt-3 border-t border-border">
          {groupHeading('Business')}
          <div className="space-y-0.5">
            {linkBtn('/admin/hubs',      Layers,       'Hubs')}
            {linkBtn('/admin/referrals', GitPullRequest, 'Referrals')}
            {isAdminOrSuper && linkBtn('/admin/partners', Handshake, 'Partners')}
            {isAdminOrSuper && linkBtn('/admin/invoices', Receipt,   'Invoices')}
          </div>
        </div>

        {/* ── Group 3 — CONTENT ── */}
        {isAdminOrSuper && (
          <div className="mt-5 pt-3 border-t border-border">
            {groupHeading('Content')}
            <div className="space-y-0.5">
              {linkBtn('/admin/blog',        Newspaper,  'Blog')}
              {sectionBtn({ icon: Shield,    label: 'Feed Moderation', section: 'feed-moderation' })}
              {sectionBtn({ icon: Lightbulb, label: 'Suggestions',     section: 'suggestions'     })}
              {linkBtn('/admin/resources',   BookOpen,   'Resources')}
            </div>
          </div>
        )}

        {/* ── Group 4 — SYSTEM ── */}
        {isAdminOrSuper && (
          <div className="mt-5 pt-3 border-t border-border">
            {groupHeading('System')}
            <div className="space-y-0.5">
              {linkBtn('/admin/inbox',          Inbox,         'Team Inbox')}
              {linkBtn('/admin/import-members', Upload,        'Import Members')}
              {isSuperAdmin && linkBtn('/admin/user-security', Lock, 'User Security')}
              {isSuperAdmin && linkBtn('/admin/upstash',       Database,      'Upstash')}
              {isSuperAdmin && linkBtn('/admin/sentry',        AlertTriangle, 'Sentry')}
              {sectionBtn({ icon: ClipboardList, label: 'Tasks', section: 'tasks' })}
              {linkBtn('/admin/settings', Settings, 'Settings')}
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
