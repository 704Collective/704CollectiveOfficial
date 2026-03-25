'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AdminLayout } from '@/components/AdminLayout';
import { useAuth } from '@/hooks/useAuth';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Button } from '@/components/ui/button';
import { Loader2, ExternalLink } from 'lucide-react';

export default function AdminSentryPage() {
  const router = useRouter();
  const { isAdmin, loading } = useAuth();
  usePageTitle('Sentry');

  useEffect(() => {
    if (!loading && !isAdmin) router.replace('/admin');
  }, [loading, isAdmin, router]);

  if (loading || !isAdmin) {
    return (
      <AdminLayout title="Sentry">
        <div className="flex items-center justify-center min-h-[40vh] text-muted-foreground">
          {loading ? <Loader2 className="h-8 w-8 animate-spin" /> : null}
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Sentry">
      <div className="max-w-lg mx-auto text-center space-y-8 py-12 px-4">
        <div className="flex justify-center">
          <div
            className="h-20 w-20 rounded-2xl bg-[#362D59] flex items-center justify-center text-white text-3xl font-bold shadow-lg"
            aria-hidden
          >
            S
          </div>
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Sentry</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Sentry error monitoring will be activated after DNS cutover. In-app issue streams and release health will appear
            here once the SDK is wired to production.
          </p>
        </div>
        <Button asChild size="lg" className="gap-2">
          <Link href="https://sentry.io" target="_blank" rel="noopener noreferrer">
            Open Sentry dashboard
            <ExternalLink className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </AdminLayout>
  );
}
