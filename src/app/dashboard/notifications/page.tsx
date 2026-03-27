'use client';

import { Header } from '@/components/Header';
import { DashboardNav } from '@/components/DashboardNav';
import { NotificationsFeed } from '@/components/NotificationsFeed';
import { SectionErrorBoundary } from '@/components/SectionErrorBoundary';
import { useAuth } from '@/hooks/useAuth';
import { usePageTitle } from '@/hooks/usePageTitle';

export default function NotificationsPage() {
  const { user } = useAuth();
  usePageTitle('Notifications');

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <DashboardNav />

      <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6 lg:px-8 sm:py-8">

        <div>
          <h1 className="text-2xl font-semibold mb-1">Notifications</h1>
          <p className="text-sm text-muted-foreground">
            Stay up to date with event reminders, announcements, and community updates.
          </p>
        </div>

        <div className="card-elevated p-4 sm:p-5">
          <SectionErrorBoundary>
            {user && <NotificationsFeed userId={user.id} />}
          </SectionErrorBoundary>
        </div>
      </main>
    </div>
  );
}