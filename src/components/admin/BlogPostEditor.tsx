'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { slugifyTitle } from '@/lib/blog/slugify';
import type { BlogPostRow } from '@/lib/blog/types';
import { toast } from 'sonner';

function tagsToString(tags: string[] | null | undefined): string {
  return (tags ?? []).join(', ');
}

function parseTags(s: string): string[] {
  return s
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

interface BlogPostEditorProps {
  mode: 'new' | 'edit';
  initialPost?: BlogPostRow | null;
}

export function BlogPostEditor({ mode, initialPost }: BlogPostEditorProps) {
  const router = useRouter();
  const { user, profile } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState(initialPost?.title ?? '');
  const [slugPart, setSlugPart] = useState(initialPost?.slug ?? '');
  const [slugManual, setSlugManual] = useState(!!initialPost);
  const [excerpt, setExcerpt] = useState(initialPost?.excerpt ?? '');
  const [content, setContent] = useState(initialPost?.content ?? '');
  const [coverUrl, setCoverUrl] = useState(initialPost?.cover_image_url ?? '');
  const [author, setAuthor] = useState(
    initialPost?.author ?? profile?.full_name?.trim() ?? ''
  );
  const [status, setStatus] = useState<'draft' | 'published'>(initialPost?.status ?? 'draft');
  const [tagsInput, setTagsInput] = useState(tagsToString(initialPost?.tags));
  const [metaTitle, setMetaTitle] = useState(initialPost?.meta_title ?? '');
  const [metaDescription, setMetaDescription] = useState(initialPost?.meta_description ?? '');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (mode === 'new' && profile?.full_name && !author) {
      setAuthor(profile.full_name.trim());
    }
  }, [mode, profile?.full_name, author]);

  useEffect(() => {
    if (slugManual || mode === 'edit') return;
    setSlugPart(slugifyTitle(title));
  }, [title, slugManual, mode]);

  const handleSlugInput = (v: string) => {
    setSlugManual(true);
    setSlugPart(
      v
        .toLowerCase()
        .replace(/[^\w-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '')
    );
  };

  const buildPayload = useCallback(
    (nextStatus: 'draft' | 'published') => {
      const slug = slugPart.trim();
      const tags = parseTags(tagsInput);
      const publishedAt =
        nextStatus === 'published'
          ? initialPost?.published_at ?? new Date().toISOString()
          : null;
      return {
        title: title.trim(),
        slug,
        excerpt: excerpt.trim() || null,
        content,
        cover_image_url: coverUrl.trim() || null,
        author: author.trim() || null,
        status: nextStatus,
        tags: tags.length ? tags : null,
        meta_title: metaTitle.trim() || null,
        meta_description: metaDescription.trim() || null,
        published_at: publishedAt,
      };
    },
    [
      slugPart,
      tagsInput,
      title,
      excerpt,
      content,
      coverUrl,
      author,
      metaTitle,
      metaDescription,
      initialPost?.published_at,
    ]
  );

  const validate = (): boolean => {
    if (!title.trim()) {
      toast.error('Title is required');
      return false;
    }
    if (!slugPart.trim()) {
      toast.error('Slug is required');
      return false;
    }
    if (!content.trim()) {
      toast.error('Content is required');
      return false;
    }
    return true;
  };

  const save = async (nextStatus: 'draft' | 'published') => {
    if (!validate() || !user) return;
    setSaving(true);
    try {
      const payload = buildPayload(nextStatus);

      if (mode === 'new') {
        const { error } = await supabase.from('blog_posts').insert(
          {
            ...payload,
            created_by: user.id,
          } as never
        );
        if (error) {
          if (error.code === '23505') toast.error('That slug is already in use. Change the slug.');
          else toast.error(error.message);
          return;
        }
        toast.success(nextStatus === 'published' ? 'Post published' : 'Draft saved');
        router.push('/admin/blog');
        router.refresh();
        return;
      }

      if (!initialPost?.id) return;
      const { error } = await supabase.from('blog_posts').update(payload as never).eq('id', initialPost.id);
      if (error) {
        if (error.code === '23505') toast.error('That slug is already in use.');
        else toast.error(error.message);
        return;
      }
      toast.success(nextStatus === 'published' ? 'Post updated & published' : 'Draft updated');
      router.push('/admin/blog');
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !user) return;
    const okTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!okTypes.includes(file.type)) {
      toast.error('Use JPG, PNG, or WebP');
      return;
    }
    if (file.size > 512000) {
      toast.error('Image must be 500KB or smaller');
      return;
    }
    setUploading(true);
    try {
      const safe = file.name.replace(/[^\w.-]/g, '_');
      const path = `${user.id}/${Date.now()}-${safe}`;
      const { error } = await supabase.storage.from('blog-images').upload(path, file, {
        upsert: false,
        contentType: file.type,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      const { data } = supabase.storage.from('blog-images').getPublicUrl(path);
      setCoverUrl(data.publicUrl);
      toast.success('Cover image uploaded');
    } finally {
      setUploading(false);
    }
  };

  const leftLabel = mode === 'new' ? 'Save Draft' : 'Update Draft';
  const rightLabel =
    mode === 'edit' && initialPost?.status === 'published' ? 'Update & Publish' : 'Publish';

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-8 pb-24">
      <Link
        href="/admin/blog"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to posts
      </Link>

      <div className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="blog-title">Title</Label>
          <Input
            id="blog-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Your blog post title"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="blog-slug">Slug</Label>
          <div className="flex items-center gap-0 rounded-md border border-input bg-background overflow-hidden">
            <span className="shrink-0 px-3 py-2 text-sm text-muted-foreground bg-muted/40 border-r border-input">
              /blog/
            </span>
            <Input
              id="blog-slug"
              className="border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0"
              value={slugPart}
              onChange={(e) => handleSlugInput(e.target.value)}
              placeholder="url-friendly-slug"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="blog-excerpt">Excerpt</Label>
          <Textarea
            id="blog-excerpt"
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
            placeholder="Brief summary for listing pages and SEO..."
            rows={4}
            className="resize-y min-h-[100px]"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="blog-content">Content (supports basic HTML)</Label>
          <Textarea
            id="blog-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Use HTML tags such as &lt;h2&gt;, &lt;p&gt;, &lt;ul&gt;, &lt;li&gt;, &lt;a&gt;, &lt;strong&gt;, &lt;em&gt;, and &lt;img&gt; for rich content."
            className="resize-y min-h-[200px] font-mono text-sm"
            style={{ minHeight: '220px' }}
          />
        </div>

        <div className="space-y-3">
          <Label>Cover Image</Label>
          <p className="text-xs text-muted-foreground leading-relaxed">
            JPG, PNG, or WebP · minimum 1200×630px recommended · maximum 500KB · 1200×630 is ideal for
            Open Graph sharing.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => void handleUpload(e)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className="border-[#C6A664]/50 text-[#C6A664] hover:bg-[#C6A664]/10"
            >
              {uploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              Upload Image
            </Button>
            <div className="flex-1 min-w-0">
              <Input
                value={coverUrl}
                onChange={(e) => setCoverUrl(e.target.value)}
                placeholder="or paste URL"
              />
            </div>
          </div>
          {coverUrl ? (
            <p className="text-xs text-muted-foreground truncate" title={coverUrl}>
              Current: {coverUrl}
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="blog-author">Author</Label>
            <Input
              id="blog-author"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Author name"
            />
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as 'draft' | 'published')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="published">Published</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="blog-tags">Tags (comma-separated)</Label>
          <Input
            id="blog-tags"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="charlotte, events, networking"
          />
        </div>

        <div className="space-y-4 rounded-lg border border-border p-4 bg-muted/20">
          <Label className="text-base font-semibold">🔍 SEO Settings</Label>
          <div className="space-y-2">
            <Label htmlFor="meta-title">Meta Title</Label>
            <Input
              id="meta-title"
              value={metaTitle}
              onChange={(e) => setMetaTitle(e.target.value)}
              placeholder="Custom title for search engines (defaults to post title)"
              maxLength={70}
            />
            <p className="text-xs text-muted-foreground">{metaTitle.length}/70 characters</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="meta-desc">Meta Description</Label>
            <Textarea
              id="meta-desc"
              value={metaDescription}
              onChange={(e) => setMetaDescription(e.target.value.slice(0, 160))}
              placeholder="Custom description for search engines (defaults to excerpt)"
              rows={3}
              maxLength={160}
            />
            <p className="text-xs text-muted-foreground">{metaDescription.length}/160 characters</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-4 border-t border-border">
        <Button type="button" variant="outline" onClick={() => router.push('/admin/blog')}>
          Cancel
        </Button>
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto">
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            className="border-[#C6A664] text-[#C6A664] hover:bg-[#C6A664]/10 order-2 sm:order-1"
            onClick={() => void save('draft')}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {mode === 'new' ? 'Save Draft' : leftLabel}
          </Button>
          <Button
            type="button"
            disabled={saving}
            className="bg-[#C6A664] text-[#1A1A1A] hover:bg-[#C6A664] order-1 sm:order-2"
            onClick={() => void save('published')}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {mode === 'new' ? 'Publish' : rightLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
