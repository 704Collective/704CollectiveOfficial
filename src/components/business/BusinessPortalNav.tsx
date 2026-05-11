'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Calendar, Users, MessageSquare, User, Briefcase } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NotificationBell } from '@/components/business/NotificationBell';

const NAV_ITEMS = [
  { label: 'Overview',  href: '/business-portal',           icon: LayoutDashboard },
  { label: 'Feed',      href: '/business-portal/feed',      icon: Briefcase       },
  { label: 'Events',   href: '/business-portal/events',    icon: Calendar        },
  { label: 'Directory', href: '/business-portal/directory', icon: Users           },
  { label: 'Messages',  href: '/business-portal/messages',  icon: MessageSquare   },
  { label: 'Profile',   href: '/business-portal/profile',   icon: User            },
];

export function BusinessPortalNav() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === '/business-portal' ? pathname === href : pathname.startsWith(href);

  return (
    <nav
      style={{
        borderBottom: '1px solid rgba(198,166,100,0.15)',
        backgroundColor: 'rgba(198,166,100,0.03)',
      }}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
          {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-2 px-4 py-3.5 text-sm font-medium whitespace-nowrap transition-colors relative shrink-0',
                  active ? 'text-[#C6A664]' : 'text-white/40 hover:text-white/70'
                )}
                style={active
                  ? { borderBottom: '2px solid #C6A664', marginBottom: '-1px' }
                  : { borderBottom: '2px solid transparent', marginBottom: '-1px' }}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            );
          })}

          {/* Notification bell - pinned to the right */}
          <div className="ml-auto flex items-center pl-4 py-2 shrink-0">
            <NotificationBell />
          </div>
        </div>
      </div>
    </nav>
  );
}