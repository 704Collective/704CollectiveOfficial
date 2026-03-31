'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ExternalLink, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { AdminLayout } from '@/components/AdminLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/hooks/useAuth';
import { usePageTitle } from '@/hooks/usePageTitle';
import { supabase } from '@/integrations/supabase/client';
import type { BlogPostRow } from '@/lib/blog/types';
import type { BlogSchemaType } from '@/lib/blog/schemaTypes';
import { toast } from 'sonner';

export default function AdminBlogListPage() {
  const router = useRouter();
  const { user, loading, isAdmin, isSuperAdmin } = useAuth();
  usePageTitle('Blog');

  const [posts, setPosts] = useState<BlogPostRow[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setDataLoading(true);
    const { data, error } = await supabase
      .from('blog_posts')
      .select('*')
      .order('created_at', { ascending: false });
    setDataLoading(false);
    if (error) {
      toast.error(error.message);
      setPosts([]);
      return;
    }
    setPosts((data ?? []) as BlogPostRow[]);
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user || (!isAdmin && !isSuperAdmin)) {
      router.replace('/admin');
      return;
    }
    void load();
  }, [loading, user, isAdmin, isSuperAdmin, router, load]);

  const confirmDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('blog_posts').delete().eq('id', deleteId);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success('Post deleted');
      setDeleteId(null);
      void load();
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || (!isAdmin && !isSuperAdmin)) return null;

  return (
    <AdminLayout title="Blog">
      <div className="p-4 sm:p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            Create and manage blog posts for the public site.
          </p>
          <Button asChild className="bg-[#C6A664] text-[#1A1A1A] hover:bg-[#C6A664] shrink-0">
            <Link href="/admin/blog/new">
              <Plus className="w-4 h-4 mr-2" />
              New Post
            </Link>
          </Button>
        </div>

        <div className="rounded-lg border border-border overflow-x-auto">
          {dataLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : posts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-16 px-4">
              No posts yet. Create your first post.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead className="w-[100px]">Status</TableHead>
                  <TableHead className="min-w-[120px]">Schema Type</TableHead>
                  <TableHead className="min-w-[140px]">Focus Keyword</TableHead>
                  <TableHead>Author</TableHead>
                  <TableHead className="w-[120px]">Created</TableHead>
                  <TableHead className="w-[200px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {posts.map((post) => (
                  <TableRow
                    key={post.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/admin/blog/${post.id}/edit`)}
                  >
                    <TableCell className="font-medium max-w-[240px] truncate">{post.title}</TableCell>
                    <TableCell>
                      {post.status === 'published' ? (
                        <Badge className="bg-emerald-600/15 text-emerald-600 border-emerald-600/30 hover:bg-emerald-600/20">
                          Published
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-muted-foreground">
                          Draft
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className="text-[0.65rem] font-normal border-[#C6A664]/40 text-[#C6A664]/95 whitespace-nowrap"
                      >
                        {(post.schema_type as BlogSchemaType | null) ?? 'BlogPosting'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm max-w-[180px] truncate" title={post.focus_keyword ?? ''}>
                      {post.focus_keyword?.trim() || '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{post.author ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                      {post.created_at ? format(new Date(post.created_at), 'MMM d, yyyy') : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        {post.status === 'published' && (
                          <Button variant="ghost" size="icon" asChild title="View" aria-label={`View published post: ${post.title}`}>
                            <a href={`/blog/${post.slug}`} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Edit"
                          aria-label={`Edit blog post: ${post.title}`}
                          onClick={() => router.push(`/admin/blog/${post.id}/edit`)}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          title="Delete"
                          aria-label={`Delete blog post: ${post.title}`}
                          onClick={() => setDeleteId(post.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this post?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. The post will be removed from the database.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
