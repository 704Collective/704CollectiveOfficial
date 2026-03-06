'use client';

import { Suspense } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect } from "react";
import { AdminLayout, AdminSection } from "@/components/AdminLayout";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";

// Tab components
import { AdminOverviewTab } from "@/components/admin/AdminOverviewTab";
import { AdminEventsTab } from "@/components/admin/AdminEventsTab";
import { AdminMembersTab } from "@/components/admin/AdminMembersTab";
import { AdminProspectsTab } from "@/components/admin/AdminProspectsTab";
import { AdminSponsorsTab } from "@/components/admin/AdminSponsorsTab";
import { AdminCheckIn } from "@/components/AdminCheckIn";
import { TaskBoard } from "@/components/admin/TaskBoard";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

const VALID_SECTIONS: AdminSection[] = ['dashboard', 'events', 'members', 'checkin', 'tasks', 'prospects', 'sponsors'];

export default function AdminPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="space-y-3 w-48">
            <Skeleton className="h-2 w-full" />
            <Skeleton className="h-2 w-4/5" />
            <Skeleton className="h-2 w-3/5" />
          </div>
        </div>
      }
    >
      <AdminDashboard />
    </Suspense>
  );
}

function AdminDashboard() {
  const { user, loading: authLoading, isAdmin } = useAuth();
  usePageTitle('Admin Dashboard');
  const router = useRouter();
  const searchParams = useSearchParams();

  const sectionFromUrl = searchParams.get('section') as AdminSection | null;

  const [activeSection, setActiveSection] = useState<AdminSection>(
    sectionFromUrl && VALID_SECTIONS.includes(sectionFromUrl) ? sectionFromUrl : 'dashboard'
  );

  // Sync section from URL params
  useEffect(() => {
    const s = searchParams.get('section') as AdminSection | null;
    if (s && VALID_SECTIONS.includes(s)) {
      setActiveSection(s);
    }
  }, [searchParams]);

  // Auth guard
  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) {
      router.push("/admin/login");
    }
  }, [user, isAdmin, authLoading, router]);

  const goToDashboard = () => setActiveSection('dashboard');

  const handleFilterChange = (filter: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (filter === 'all') params.delete('filter');
    else params.set('filter', filter);
    router.replace(`?${params.toString()}`);
  };

  // Loading skeleton
  if (authLoading) {
    return (
      <AdminLayout title="704 Collective" activeSection={activeSection} onSectionChange={setActiveSection}>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-9 w-28" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Skeleton className="h-52 rounded-xl" />
            <Skeleton className="h-52 rounded-xl" />
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="704 Collective" activeSection={activeSection} onSectionChange={setActiveSection}>
      <div className="space-y-8">

        {activeSection === 'dashboard' && (
          <SectionErrorBoundary>
            <AdminOverviewTab onSectionChange={setActiveSection} onFilterChange={handleFilterChange} />
          </SectionErrorBoundary>
        )}

        {activeSection === 'events' && (
          <SectionErrorBoundary>
            <AdminEventsTab onNavigateToDashboard={goToDashboard} />
          </SectionErrorBoundary>
        )}

        {activeSection === 'members' && (
          <SectionErrorBoundary>
            <AdminMembersTab onNavigateToDashboard={goToDashboard} />
          </SectionErrorBoundary>
        )}

        {activeSection === 'checkin' && (
          <SectionErrorBoundary>
            <div className="animate-in fade-in-0 duration-200">
              <div className="flex items-center gap-3 mb-6">
                <Button type="button" variant="ghost" size="icon" onClick={goToDashboard}>
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                <h2 className="text-lg font-semibold text-foreground">Event Check-in</h2>
              </div>
              <AdminCheckIn adminId={user?.id || ""} />
            </div>
          </SectionErrorBoundary>
        )}

        {activeSection === 'tasks' && (
          <SectionErrorBoundary>
            <div className="animate-in fade-in-0 duration-200">
              <div className="flex items-center gap-3 mb-6">
                <Button type="button" variant="ghost" size="icon" onClick={goToDashboard}>
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                <h2 className="text-lg font-semibold text-foreground">Task Board</h2>
              </div>
              <TaskBoard />
            </div>
          </SectionErrorBoundary>
        )}

        {activeSection === 'prospects' && (
          <SectionErrorBoundary>
            <AdminProspectsTab onNavigateToDashboard={goToDashboard} />
          </SectionErrorBoundary>
        )}

        {activeSection === 'sponsors' && (
          <SectionErrorBoundary>
            <AdminSponsorsTab onNavigateToDashboard={goToDashboard} />
          </SectionErrorBoundary>
        )}

      </div>
    </AdminLayout>
  );
}