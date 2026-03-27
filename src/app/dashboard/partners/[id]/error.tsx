'use client';

import Link from 'next/link';
import { Header } from '@/components/Header';
import { DashboardNav } from '@/components/DashboardNav';
import { Button } from '@/components/ui/button';
import { DASHBOARD_MAIN } from '@/lib/dashboard-layout';
import { cn } from '@/lib/utils';

export default function PartnerDetailError({
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
      <main className={cn(DASHBOARD_MAIN, 'py-16 text-center text-white/80')}>
        <p className="text-lg font-medium text-white mb-2">Could not load partner</p>
        <p className="text-sm text-white/50 mb-6">{error.message}</p>
        <div className="flex gap-2 justify-center">
          <Button type="button" variant="secondary" onClick={() => reset()}>
            Retry
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link href="/dashboard/partners">Directory</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
