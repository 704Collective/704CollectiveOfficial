'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { AdminLayout } from '@/components/AdminLayout';
import { BlogPostEditor } from '@/components/admin/BlogPostEditor';
import { useAuth } from '@/hooks/useAuth';
import { usePageTitle } from '@/hooks/usePageTitle';
import { supabase } from '@/integrations/supabase/client';
import type { BlogPostRow } from '@/lib/blog/types';
import { toast } from 'sonner';

export default function AdminBlogEditPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { user, loading, isAdmin, isSuperAdmin } = useAuth();
  usePageTitle('Edit blog post');

  const [post, setPost] = useState<BlogPostRow | null>(null);
  const [fetching, setFetching] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setFetching(true);
    const { data, error } = await supabase.from('blog_posts').select('*').eq('id', id).maybeSingle();
    setFetching(false);
    if (error || !data) {
      toast.error(error?.message ?? 'Post not found');
      router.replace('/admin/blog');
      return;
    }
    setPost(data as BlogPostRow);
  }, [id, router]);

  useEffect(() => {
    if (loading) return;
    if (!user || (!isAdmin && !isSuperAdmin)) {
      router.replace('/admin');
      return;
    }
    void load();
  }, [loading, user, isAdmin, isSuperAdmin, router, load]);

  if (loading || fetching) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || (!isAdmin && !isSuperAdmin) || !post) return null;

  return (
    <AdminLayout title="Edit post">
      <BlogPostEditor mode="edit" initialPost={post} />
    </AdminLayout>
  );
}
