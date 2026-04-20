'use client';

import { ReactNode, useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { AdminBottomNav } from '@/components/AdminBottomNav';
import {
  Sheet,
  SheetContent,
} from '@/components/ui/sheet';

export type AdminSection =
  | 'dashboard'
  | 'events'
  | 'members'
  | 'checkin'
  | 'tasks'
  | 'prospects'
  | 'sponsors'
  | 'financials'
  | 'feed-moderation'
  | 'applications'
  | 'suggestions'
  | 'inquiries';

interface AdminLayoutProps {
  children: ReactNode;
  title: string;
  activeSection?: AdminSection;
  onSectionChange?: (section: AdminSection) => void;
}

export function AdminLayout({
  children,
  title,
  activeSection,
  onSectionChange,
}: AdminLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  // Close the mobile sheet whenever the route changes so its Radix portal
  // backdrop doesn't persist as an invisible click-blocking overlay after
  // navigating away from the admin panel.
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-screen bg-background" data-theme="admin">

      {/* ── Desktop Sidebar ── */}
      <aside className="hidden sm:flex sm:flex-col fixed inset-y-0 left-0 w-60 border-r border-border bg-sidebar z-30">
        <AdminSidebar
          activeSection={activeSection}
          onSectionChange={onSectionChange}
        />
      </aside>

      {/* ── Mobile Sidebar ── */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen} modal={true}>
        <SheetContent
          side="left"
          className="w-60 p-0 bg-sidebar border-border [&>button]:hidden"
          style={{ boxShadow: '4px 0 24px rgba(0,0,0,0.6)' }}
        >
          <AdminSidebar
            activeSection={activeSection}
            onSectionChange={onSectionChange}
            onMobileClose={() => setMobileMenuOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <div className="sm:ml-60 min-h-screen flex flex-col">

        {/* Mobile top bar (< sm) */}
        <header className="sm:hidden sticky top-0 z-20 flex h-14 items-center justify-between px-4 border-b border-border bg-background/95 backdrop-blur-sm shrink-0">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="flex items-center justify-center min-h-11 min-w-11 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label="Open navigation"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <line x1="2" y1="4.5" x2="16" y2="4.5" />
              <line x1="2" y1="9" x2="16" y2="9" />
              <line x1="2" y1="13.5" x2="16" y2="13.5" />
            </svg>
          </button>
          <span className="text-sm font-semibold text-foreground">704 Collective</span>
          <div className="min-w-11" aria-hidden />
        </header>

        {/* Page content */}
        <main id="main-content" className="flex-1 pb-[calc(56px+env(safe-area-inset-bottom)+24px)] sm:pb-0">
          <div className="w-full max-w-3xl mx-auto px-4 py-6 sm:px-6 md:max-w-5xl lg:px-8 lg:py-8">
            {title && (
              <h1 className="hidden sm:block text-2xl font-semibold text-foreground mb-6">
                {title}
              </h1>
            )}
            {children}
          </div>
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <AdminBottomNav
        activeSection={activeSection}
        onSectionChange={onSectionChange}
      />
    </div>
  );
}