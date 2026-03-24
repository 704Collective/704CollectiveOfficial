'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AdminLayout } from '@/components/AdminLayout';
import { ResourceLibrary } from '@/components/portal/ResourceLibrary';
import { useAuth } from '@/hooks/useAuth';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Loader2 } from 'lucide-react';

export default function AdminResourcesPage() {
  const { user, loading, isAdmin, isSuperAdmin } = useAuth();
  const router = useRouter();
  usePageTitle('Resources');

  useEffect(() => {
    if (loading) return;
    if (!user || (!isAdmin && !isSuperAdmin)) router.replace('/admin');
  }, [loading, user, isAdmin, isSuperAdmin, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || (!isAdmin && !isSuperAdmin)) return null;

  return (
    <AdminLayout title="Resources">
      <div className="p-6">
        <ResourceLibrary />
      </div>
    </AdminLayout>
  );
}
