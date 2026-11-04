'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Button } from '@/components/ui/button';

export default function AdminTasksPage() {
  const router = useRouter();
  const { user, loading, isAdmin, isHelperAdmin, signOut } = useAuth();
  usePageTitle('Tasks');

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) router.replace('/admin/login');
  }, [loading, user, isAdmin, router]);

  if (loading || !user || !isAdmin) {
    return (
      <div className="min-h-screen bg-background" data-theme="admin" data-testid="tasks-loading" />
    );
  }

  return (
    <div className="min-h-screen bg-background" data-theme="admin" data-testid="tasks-wave1">
      <header className="border-b border-border px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <h1 className="text-xl font-semibold text-foreground">Tasks</h1>
          <Button
            type="button"
            variant="ghost"
            data-testid="tasks-sign-out"
            onClick={async () => {
              await signOut();
              router.push('/admin/login');
            }}
          >
            Sign out
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <p className="text-sm text-muted-foreground" data-testid="tasks-wave1-copy">
          {isHelperAdmin
            ? 'This is your Tasks home. Folder names stay hidden. Wave 2 adds the board.'
            : 'Wave 1 schema is live. The existing board is still on the admin dashboard until Wave 2.'}
        </p>
      </main>
    </div>
  );
}
