'use client';

import { ReactNode, useState } from 'react';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { AdminBottomNav } from '@/components/AdminBottomNav';
import {
  Sheet,
  SheetContent,
} from '@/components/ui/sheet';

export type AdminSection = 'dashboard' | 'events' | 'members' | 'checkin' | 'tasks' | 'prospects' | 'sponsors';

interface AdminLayoutProps {
  children: ReactNode;
  title: string;
  activeSection?: AdminSection;
  onSectionChange?: (section: AdminSection) => void;
}

export function AdminLayout({ children, title, activeSection, onSectionChange }: AdminLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop sidebar — fixed, always visible on lg+ */}
      <aside className="hidden lg:flex lg:w-60 lg:flex-col lg:fixed lg:inset-y-0 border-r border-border bg-sidebar z-30">
        <AdminSidebar
          activeSection={activeSection}
          onSectionChange={onSectionChange}
        />
      </aside>

      {/* Mobile sidebar — Sheet drawer */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="left" className="w-60 p-0 bg-sidebar border-border">
          <AdminSidebar
            activeSection={activeSection}
            onSectionChange={onSectionChange}
            onMobileClose={() => setMobileMenuOpen(false)}
          />
        </SheetContent>
      </Sheet>

      {/* Main column */}
      <div className="flex-1 flex flex-col lg:pl-60 min-w-0">
        {/* Mobile top header */}
        <header className="lg:hidden sticky top-0 z-20 flex h-14 items-center justify-between px-4 border-b border-border bg-background/90 backdrop-blur-sm shrink-0">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="flex items-center justify-center w-9 h-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label="Open navigation"
          >
            {/* Hamburger icon */}
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <line x1="2" y1="4.5" x2="16" y2="4.5" />
              <line x1="2" y1="9" x2="16" y2="9" />
              <line x1="2" y1="13.5" x2="16" y2="13.5" />
            </svg>
          </button>
          <span className="text-sm font-semibold text-foreground">704 Collective</span>
          {/* Spacer to center the title */}
          <div className="w-9" />
        </header>

        {/* Page content */}
        <main className="flex-1 min-h-0 pb-20 lg:pb-0">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-5 lg:py-7">
            {/* Desktop page title */}
            <h1 className="hidden lg:block text-xl font-semibold text-foreground mb-6">{title}</h1>
            {children}
          </div>
        </main>
      </div>

      {/* Bottom navigation — mobile/tablet only */}
      <AdminBottomNav activeSection={activeSection} onSectionChange={onSectionChange} />
    </div>
  );
}