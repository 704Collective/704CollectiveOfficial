'use client';

import { useState, useRef, useCallback } from 'react';
import Image from 'next/image';
import { Image as ImageIcon, Paperclip, X, Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { User } from '@supabase/supabase-js';
import type { FeedPostData, PostAuthor } from './FeedPost';

// ---------------------------------------------------------------------------
// Mention autocomplete (shared logic)
// ---------------------------------------------------------------------------
interface MentionSuggestion {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

function initials(name: string | null | undefined): string {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function extractMentionQuery(text: string, cursorPos: number): string | null {
  const before = text.slice(0, cursorPos);
  const match = before.match(/@(\w*)$/);
  return match ? match[1] : null;
}

function insertMention(text: string, cursorPos: number, fullName: string): { newText: string; newCursor: number } {
  const before = text.slice(0, cursorPos);
  const after = text.slice(cursorPos);
  const match = before.match(/@(\w*)$/);
  if (!match) return { newText: text, newCursor: cursorPos };
  const replaced = before.slice(0, before.length - match[0].length) + `@${fullName} `;
  return { newText: replaced + after, newCursor: replaced.length };
}

// ---------------------------------------------------------------------------
// Pending file/image state
// ---------------------------------------------------------------------------
interface PendingFile {
  file: File;
  previewUrl?: string; // for images
  id: string;
}

function formatBytes(bytes: number): string {
  if (!bytes) return '';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// ---------------------------------------------------------------------------
// CreatePost
// ---------------------------------------------------------------------------
interface CreatePostProps {
  feedType: 'social' | 'business';
  currentUser: User;
  currentProfile: PostAuthor | null;
  onPostCreated: (post: FeedPostData) => void;
}

export function CreatePost({ feedType, currentUser, currentProfile, onPostCreated }: CreatePostProps) {
  const [content, setContent] = useState('');
  const [pendingImages, setPendingImages] = useState<PendingFile[]>([]);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [suggestions, setSuggestions] = useState<MentionSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchSuggestions = useCallback(async (query: string) => {
    if (query.length < 1) { setSuggestions([]); setShowSuggestions(false); return; }
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .ilike('full_name', `%${query}%`)
      .is('deleted_at', null)
      .limit(6);
    setSuggestions((data as MentionSuggestion[]) ?? []);
    setShowSuggestions(true);
  }, []);

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    const cursor = e.target.selectionStart ?? 0;
    const q = extractMentionQuery(e.target.value, cursor);
    if (q !== null) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => fetchSuggestions(q), 200);
    } else {
      setShowSuggestions(false);
    }
  };

  const pickSuggestion = (name: string | null) => {
    if (!name) return;
    const cursor = textareaRef.current?.selectionStart ?? content.length;
    const { newText, newCursor } = insertMention(content, cursor, name);
    setContent(newText);
    setShowSuggestions(false);
    setTimeout(() => {
      textareaRef.current?.setSelectionRange(newCursor, newCursor);
      textareaRef.current?.focus();
    }, 0);
  };

  const addImages = (files: FileList | null) => {
    if (!files) return;
    const remaining = 4 - pendingImages.length;
    Array.from(files).slice(0, remaining).forEach(file => {
      if (!file.type.startsWith('image/')) return;
      const id = `${Date.now()}-${Math.random()}`;
      const previewUrl = URL.createObjectURL(file);
      setPendingImages(p => [...p, { file, previewUrl, id }]);
    });
  };

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach(file => {
      const id = `${Date.now()}-${Math.random()}`;
      setPendingFiles(p => [...p, { file, id }]);
    });
  };

  const removeImage = (id: string) => {
    setPendingImages(p => {
      const item = p.find(f => f.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return p.filter(f => f.id !== id);
    });
  };

  const removeFile = (id: string) => setPendingFiles(p => p.filter(f => f.id !== id));

  const handleSubmit = async () => {
    if (!content.trim() && pendingImages.length === 0 && pendingFiles.length === 0) return;
    if (uploading) return;
    setUploading(true);

    try {
      const uploadedImageUrls: string[] = [];
      const uploadedFileUrls: string[] = [];
      const uploadedFileNames: string[] = [];

      // Upload images
      for (const img of pendingImages) {
        const ext = img.file.name.split('.').pop() ?? 'jpg';
        const path = `posts/${currentUser.id}/${Date.now()}.${ext}`;
        const { error } = await supabase.storage.from('portal-media').upload(path, img.file, { upsert: false });
        if (error) throw new Error(`Image upload failed: ${error.message}`);
        const { data: { publicUrl } } = supabase.storage.from('portal-media').getPublicUrl(path);
        uploadedImageUrls.push(publicUrl);
      }

      // Upload files (business feed only)
      if (feedType === 'business') {
        for (const f of pendingFiles) {
          const path = `posts/${currentUser.id}/${Date.now()}-${f.file.name}`;
          const { error } = await supabase.storage.from('portal-files').upload(path, f.file, { upsert: false });
          if (error) throw new Error(`File upload failed: ${error.message}`);
          const { data: { publicUrl } } = supabase.storage.from('portal-files').getPublicUrl(path);
          uploadedFileUrls.push(publicUrl);
          uploadedFileNames.push(f.file.name);
        }
      }

      // Insert post
      const { data, error } = await supabase
        .from('posts')
        .insert({
          author_id: currentUser.id,
          feed_type: feedType,
          content: content.trim() || null,
          image_urls: uploadedImageUrls.length > 0 ? uploadedImageUrls : null,
          file_urls: uploadedFileUrls.length > 0 ? uploadedFileUrls : null,
          file_names: uploadedFileNames.length > 0 ? uploadedFileNames : null,
        })
        .select('*')
        .single();

      if (error) throw new Error(error.message);

      // Build a full FeedPostData for optimistic UI
      const newPost: FeedPostData = {
        ...(data as any),
        author: currentProfile,
        like_count: 0,
        comment_count: 0,
        user_has_liked: false,
      };

      onPostCreated(newPost);
      setContent('');
      setPendingImages([]);
      setPendingFiles([]);
      toast.success('Post published');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to publish post');
    } finally {
      setUploading(false);
    }
  };

  const canPost = !uploading && (content.trim().length > 0 || pendingImages.length > 0 || pendingFiles.length > 0);

  return (
    <div className="card-elevated p-4 space-y-3">
      <div className="flex gap-3">
        <Avatar className="w-9 h-9 shrink-0 mt-0.5">
          <AvatarImage src={currentProfile?.avatar_url ?? undefined} />
          <AvatarFallback>{initials(currentProfile?.full_name)}</AvatarFallback>
        </Avatar>

        <div className="flex-1 relative">
          <Textarea
            ref={textareaRef}
            value={content}
            onChange={handleContentChange}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit();
              if (e.key === 'Escape') setShowSuggestions(false);
            }}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            placeholder={
              feedType === 'social'
                ? "Share something with the community…"
                : "Share a business update, insight, or resource…"
            }
            className="resize-none min-h-[80px] text-sm"
            rows={3}
          />

          {/* Mention suggestions */}
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute z-50 top-full left-0 mt-1 w-64 bg-card border border-border rounded-lg shadow-lg overflow-hidden">
              {suggestions.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onMouseDown={() => pickSuggestion(s.full_name)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted/50 transition-colors text-left"
                >
                  <Avatar className="w-6 h-6 shrink-0">
                    <AvatarImage src={s.avatar_url ?? undefined} />
                    <AvatarFallback className="text-[10px]">{initials(s.full_name)}</AvatarFallback>
                  </Avatar>
                  <span>{s.full_name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Image previews */}
      {pendingImages.length > 0 && (
        <div className="flex gap-2 flex-wrap pl-12">
          {pendingImages.map(img => (
            <div key={img.id} className="relative w-20 h-20 rounded-lg overflow-hidden bg-muted">
              {img.previewUrl && (
                <Image src={img.previewUrl} alt="preview" fill className="object-cover" unoptimized />
              )}
              <button
                onClick={() => removeImage(img.id)}
                className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center hover:bg-black/80"
              >
                <X className="w-3 h-3 text-white" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* File previews */}
      {pendingFiles.length > 0 && (
        <div className="space-y-1 pl-12">
          {pendingFiles.map(f => (
            <div key={f.id} className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg text-sm">
              <span className="flex-1 truncate">{f.file.name}</span>
              <span className="text-xs text-muted-foreground shrink-0">{formatBytes(f.file.size)}</span>
              <button onClick={() => removeFile(f.id)} className="text-muted-foreground hover:text-destructive">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between pl-12">
        <div className="flex items-center gap-1">
          <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={e => addImages(e.target.files)} />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => imageInputRef.current?.click()}
            disabled={pendingImages.length >= 4}
            title="Add images (max 4)"
          >
            <ImageIcon className="w-4 h-4" />
          </Button>

          {feedType === 'business' && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={e => addFiles(e.target.files)}
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => fileInputRef.current?.click()}
                title="Attach files (up to 5 GB each)"
              >
                <Paperclip className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>

        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={!canPost}
          className="gap-1.5"
        >
          {uploading ? (
            <><Loader2 className="w-3.5 h-3.5 animate-spin" />Posting…</>
          ) : (
            <><Send className="w-3.5 h-3.5" />Post</>
          )}
        </Button>
      </div>
    </div>
  );
}
