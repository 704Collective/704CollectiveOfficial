'use client';

import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Calendar, Users, ScanLine, CheckSquare, Settings, Layers,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AdminSection } from '@/components/AdminLayout';

interface AdminBottomNavProps {
  activeSection?: AdminSection;
  onSectionChange?: (section: AdminSection) => void;
}

type NavItem = {
  icon: React.ElementType;
  label: string;
  section?: AdminSection;
  href?: string;
};

const NAV_ITEMS: NavItem[] = [
  { icon: LayoutDashboard, label: 'Overview', section: 'dashboard'      },
  { icon: Calendar,        label: 'Events',   section: 'events'         },
  { icon: Users,           label: 'Members',  href: '/admin/contacts'   },
  // HIDDEN 2026-06 — CRM/Partner hide-pass, restore later: { icon: Layers, label: 'CRM', href: '/admin/crm' },
  { icon: ScanLine,        label: 'Check-in', section: 'checkin'        },
  { icon: CheckSquare,     label: 'Tasks',    section: 'tasks'          },
  { icon: Settings,        label: 'Settings', href: '/admin/settings'   },
];

export function AdminBottomNav({ activeSection, onSectionChange }: AdminBottomNavProps) {
  const router        = useRouter();
  const pathname      = usePathname();
  const isOnDashboard = pathname === '/admin';
  const isOnSettings  = pathname === '/admin/settings';
  const isOnCrm       = pathname.startsWith('/admin/crm');
  const isOnContacts  = pathname.startsWith('/admin/contacts');

  const handleTap = (item: NavItem) => {
    if (item.href) {
      router.push(item.href);
    } else if (item.section) {
      if (pathname !== '/admin') {
        router.push(`/admin?section=${item.section}`);
      } else {
        onSectionChange?.(item.section);
      }
    }
  };

  const isActive = (item: NavItem) => {
    if (item.href === '/admin/settings') return isOnSettings;
    if (item.href === '/admin/crm')      return isOnCrm;
    if (item.href === '/admin/contacts') return isOnContacts;
    return isOnDashboard && activeSection === item.section;
  };

  return (
    <nav
      className="sm:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background"
      style={{ touchAction: 'manipulation' }}
    >
      <div
        className="flex items-stretch overflow-x-auto overflow-y-hidden"
        style={{ height: '56px', WebkitOverflowScrolling: 'touch' }}
      >
        {NAV_ITEMS.map((item) => {
          const active = isActive(item);
          const Icon   = item.icon;
          return (
            <button
              type="button"
              key={item.label}
              onClick={() => handleTap(item)}
              style={{ minHeight: '44px' }}
              className={cn(
                'flex flex-col items-center justify-center shrink-0 min-w-[4.75rem] px-1 gap-0.5 transition-colors',
                active
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon
                className={cn('w-5 h-5', active ? 'text-primary' : 'text-muted-foreground')}
                strokeWidth={active ? 2.5 : 1.75}
              />
              <span
                className="font-medium"
                style={{ fontSize: 'clamp(8px, 2vw, 10px)', lineHeight: 1 }}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
      {/* iPhone home-indicator safe area */}
      <div style={{ height: 'env(safe-area-inset-bottom)' }} />
    </nav>
  );
}