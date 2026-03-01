'use client';

import { ReactNode } from 'react';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { AdminBottomNav } from '@/components/AdminBottomNav';

export type AdminSection = 'dashboard' | 'events' | 'members' | 'checkin' | 'tasks' | 'prospects' | 'sponsors';

interface AdminLayoutProps {
  children: ReactNode;
  title: string;
  activeSection?: AdminSection;
  onSectionChange?: (section: AdminSection) => void;
}

export function AdminLayout({ children, title, activeSection, onSectionChange }: AdminLayoutProps) {
  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop sidebar — always visible on lg+ */}
      <aside className="hidden lg:flex lg:w-60 lg:flex-col lg:fixed lg:inset-y-0 border-r border-border bg-card">
        <AdminSidebar
          activeSection={activeSection}
          onSectionChange={onSectionChange}
        />
      </aside>

      {/* Main content */}
      <main className="flex-1 lg:pl-60 min-w-0 pb-20 lg:pb-0">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-4 lg:py-6 pb-24 lg:pb-6">
          <h1 className="hidden lg:block text-2xl font-semibold mb-6">{title}</h1>
          {children}
        </div>
      </main>

      {/* Bottom navigation — mobile/tablet only */}
      <AdminBottomNav activeSection={activeSection} onSectionChange={onSectionChange} />
    </div>
  );
}
