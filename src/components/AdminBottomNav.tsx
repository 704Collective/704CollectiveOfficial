'use client';

import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Calendar, Users, ScanLine, CheckSquare, Settings } from 'lucide-react';
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
  { icon: LayoutDashboard, label: 'Overview', section: 'dashboard' },
  { icon: Calendar,        label: 'Events',   section: 'events'    },
  { icon: Users,           label: 'Members',  section: 'members'   },
  { icon: ScanLine,        label: 'Check-in', section: 'checkin'   },
  { icon: CheckSquare,     label: 'Tasks',    section: 'tasks'     },
  { icon: Settings,        label: 'Settings', href: '/admin/settings' },
];

export function AdminBottomNav({ activeSection, onSectionChange }: AdminBottomNavProps) {
  const router   = useRouter();
  const pathname = usePathname();
  const isOnDashboard = pathname === '/admin';
  const isOnSettings  = pathname === '/admin/settings';

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
    if (item.href) return isOnSettings;
    return isOnDashboard && activeSection === item.section;
  };

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background"
      style={{ touchAction: 'manipulation' }}
    >
      <div className="flex items-stretch h-16">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item);
          const Icon   = item.icon;
          return (
            <button
              type="button"
              key={item.label}
              onClick={() => handleTap(item)}
              className={cn(
                'flex flex-col items-center justify-center flex-1 gap-1 text-[10px] font-medium transition-colors',
                active
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon
                className={cn('w-5 h-5', active ? 'text-primary' : 'text-muted-foreground')}
                strokeWidth={active ? 2.5 : 1.75}
              />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
      {/* iPhone home-indicator safe area */}
      <div style={{ height: 'env(safe-area-inset-bottom)' }} />
    </nav>
  );
}