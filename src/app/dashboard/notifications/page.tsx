'use client';

import { useRouter } from 'next/navigation';
import { Header } from '@/components/Header';
import { DashboardNav } from '@/components/DashboardNav';
import { NotificationsFeed } from '@/components/NotificationsFeed';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionErrorBoundary } from '@/components/SectionErrorBoundary';
import { useAuth } from '@/hooks/useAuth';
import { usePageTitle } from '@/hooks/usePageTitle';

export default function NotificationsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  usePageTitle('Notifications');

  if (authLoading || !user) {
    if (!authLoading && !user) {
      router.push('/login');
    }
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 rounded-xl" />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <DashboardNav />

        <div>
          <h1 className="text-2xl font-semibold mb-1">Notifications</h1>
          <p className="text-sm text-muted-foreground">
            Stay up to date with event reminders, announcements, and community updates.
          </p>
        </div>

        <div className="card-elevated p-4 sm:p-5">
          <SectionErrorBoundary>
            <NotificationsFeed userId={user.id} />
          </SectionErrorBoundary>
        </div>
      </main>
    </div>
  );
}