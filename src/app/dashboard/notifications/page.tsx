'use client';

import { Header } from '@/components/Header';
import { DashboardNav } from '@/components/DashboardNav';
import { NotificationsFeed } from '@/components/NotificationsFeed';
import { SectionErrorBoundary } from '@/components/SectionErrorBoundary';
import { useAuth } from '@/hooks/useAuth';
import { usePageTitle } from '@/hooks/usePageTitle';

export default function NotificationsPage() {
  const { user} = useAuth();
  usePageTitle('Notifications');

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <DashboardNav />

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