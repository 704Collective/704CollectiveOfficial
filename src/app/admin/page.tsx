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

export default function AdminPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><Skeleton className="h-8 w-48" /></div>}>
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
    sectionFromUrl && ['dashboard','events','members','checkin','tasks','prospects','sponsors'].includes(sectionFromUrl)
      ? sectionFromUrl
      : 'dashboard'
  );

  useEffect(() => {
    const s = searchParams.get('section') as AdminSection | null;
    if (s && ['dashboard','events','members','checkin','tasks','prospects','sponsors'].includes(s)) {
      setActiveSection(s);
    }
  }, [searchParams]);

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

  if (authLoading) {
    return (
      <AdminLayout title="704 Collective" activeSection={activeSection} onSectionChange={setActiveSection}>
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" />
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
                <Button variant="ghost" size="icon" onClick={goToDashboard}><ArrowLeft className="w-4 h-4" /></Button>
                <h2 className="text-xl font-semibold">Event Check-in</h2>
              </div>
              <AdminCheckIn adminId={user?.id || ""} />
            </div>
          </SectionErrorBoundary>
        )}

        {activeSection === 'tasks' && (
          <SectionErrorBoundary>
            <div className="animate-in fade-in-0 duration-200">
              <div className="flex items-center gap-3 mb-6">
                <Button variant="ghost" size="icon" onClick={goToDashboard}><ArrowLeft className="w-4 h-4" /></Button>
                <h2 className="text-xl font-semibold">Tasks</h2>
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