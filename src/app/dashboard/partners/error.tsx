'use client';

import Link from 'next/link';
import { Header } from '@/components/Header';
import { DashboardNav } from '@/components/DashboardNav';
import { Button } from '@/components/ui/button';
import { DASHBOARD_MAIN } from '@/lib/dashboard-layout';
import { cn } from '@/lib/utils';

export default function PartnersDirectoryError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-[#1A1A1A]">
      <Header />
      <DashboardNav />
      <main id="main-content" className={cn(DASHBOARD_MAIN, 'py-16 text-center text-white/80')}>
        <h1 className="text-xl font-semibold text-white mb-2">Something went wrong</h1>
        <p className="text-sm text-white/50 mb-6">{error.message}</p>
        <div className="flex gap-3 justify-center">
          <Button type="button" variant="secondary" onClick={() => reset()}>
            Try again
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link href="/dashboard/partners">Back to partners</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
