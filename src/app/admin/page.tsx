'use client';

import { Suspense } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect } from "react";
import { AdminLayout, AdminSection } from "@/components/AdminLayout";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";
import dynamic from 'next/dynamic';

// Dynamically loaded tab components — code split per tab
const AdminOverviewTab = dynamic(() => import('@/components/admin/AdminOverviewTab').then(m => ({ default: m.AdminOverviewTab })), { loading: () => <TabSkeleton /> });
const AdminEventsTab = dynamic(() => import('@/components/admin/AdminEventsTab').then(m => ({ default: m.AdminEventsTab })), { loading: () => <TabSkeleton /> });
const AdminMembersTab = dynamic(() => import('@/components/admin/AdminMembersTab').then(m => ({ default: m.AdminMembersTab })), { loading: () => <TabSkeleton /> });
const AdminProspectsTab = dynamic(() => import('@/components/admin/AdminProspectsTab').then(m => ({ default: m.AdminProspectsTab })), { loading: () => <TabSkeleton /> });
const AdminSponsorsTab = dynamic(() => import('@/components/admin/AdminSponsorsTab').then(m => ({ default: m.AdminSponsorsTab })), { loading: () => <TabSkeleton /> });
const AdminCheckIn = dynamic(() => import('@/components/AdminCheckIn').then(m => ({ default: m.AdminCheckIn })), { loading: () => <TabSkeleton /> });
const TaskBoard = dynamic(() => import('@/components/admin/TaskBoard').then(m => ({ default: m.TaskBoard })), { loading: () => <TabSkeleton /> });

const AdminFinancialsTab = dynamic(() => import('@/components/admin/AdminFinancialsTab').then(m => ({ default: m.AdminFinancialsTab })), { loading: () => <TabSkeleton /> });

import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

function TabSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
      <Skeleton className="h-52 rounded-xl" />
    </div>
  );
}

const VALID_SECTIONS: AdminSection[] = ['dashboard', 'events', 'members', 'checkin', 'tasks', 'prospects', 'sponsors', 'financials'];

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

        {activeSection === 'financials' && (
          <SectionErrorBoundary>
            <AdminFinancialsTab onNavigateToDashboard={goToDashboard} />
          </SectionErrorBoundary>
        )}

      </div>
    </AdminLayout>
  );
}