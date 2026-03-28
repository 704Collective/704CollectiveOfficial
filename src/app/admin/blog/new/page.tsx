'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { AdminLayout } from '@/components/AdminLayout';
import { BlogPostEditor } from '@/components/admin/BlogPostEditor';
import { useAuth } from '@/hooks/useAuth';
import { usePageTitle } from '@/hooks/usePageTitle';

export default function AdminBlogNewPage() {
  const router = useRouter();
  const { user, loading, isAdmin, isSuperAdmin } = useAuth();
  usePageTitle('New blog post');

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
    <AdminLayout title="New post">
      <BlogPostEditor mode="new" />
    </AdminLayout>
  );
}
