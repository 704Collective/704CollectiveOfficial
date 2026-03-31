'use client';

import { useState, useRef, useCallback } from 'react';
import Image from 'next/image';
import { Image as ImageIcon, Paperclip, X, Send, Loader2, Library } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { notifyAfterFeedPostCreated } from '@/app/actions/portalFeedNotifications';
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

interface AdminResourceRow {
  id: string;
  file_url: string;
  file_name: string;
  file_size: number | null;
}

export function CreatePost({ feedType, currentUser, currentProfile, onPostCreated }: CreatePostProps) {
  const { isAdmin } = useAuth();
  const [content, setContent] = useState('');
  const [pendingImages, setPendingImages] = useState<PendingFile[]>([]);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [libraryAttachments, setLibraryAttachments] = useState<{ url: string; name: string }[]>([]);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryRows, setLibraryRows] = useState<AdminResourceRow[]>([]);
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
  const removeLibraryAttachment = (url: string) =>
    setLibraryAttachments((p) => p.filter((x) => x.url !== url));

  const openResourceLibrary = async () => {
    setLibraryOpen(true);
    setLibraryLoading(true);
    const { data, error } = await supabase
      .from('admin_resources')
      .select('id, file_url, file_name, file_size')
      .order('created_at', { ascending: false });
    setLibraryLoading(false);
    if (error) {
      toast.error('Could not load resource library');
      setLibraryRows([]);
      return;
    }
    setLibraryRows((data as AdminResourceRow[]) ?? []);
  };

  const attachFromLibrary = (row: AdminResourceRow) => {
    if (libraryAttachments.some((a) => a.url === row.file_url)) {
      toast.message('Already attached');
      return;
    }
    setLibraryAttachments((p) => [...p, { url: row.file_url, name: row.file_name }]);
    setLibraryOpen(false);
    toast.success('File attached from library');
  };

  const handleSubmit = async () => {
    if (!content.trim() && pendingImages.length === 0 && pendingFiles.length === 0 && libraryAttachments.length === 0) return;
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
        if (error) {
          console.error('[CreatePost] portal-media upload failed', { path, message: error.message });
          throw new Error(`Image upload failed: ${error.message}`);
        }
        const { data: { publicUrl } } = supabase.storage.from('portal-media').getPublicUrl(path);
        uploadedImageUrls.push(publicUrl);
      }

      // Upload files (business feed only) + library attachments
      if (feedType === 'business') {
        for (const f of pendingFiles) {
          const path = `posts/${currentUser.id}/${Date.now()}-${f.file.name}`;
          const { error } = await supabase.storage.from('portal-files').upload(path, f.file, { upsert: false });
          if (error) {
            console.error('[CreatePost] portal-files upload failed', { path, message: error.message });
            throw new Error(`File upload failed: ${error.message}`);
          }
          const { data: { publicUrl } } = supabase.storage.from('portal-files').getPublicUrl(path);
          uploadedFileUrls.push(publicUrl);
          uploadedFileNames.push(f.file.name);
        }
        for (const lib of libraryAttachments) {
          uploadedFileUrls.push(lib.url);
          uploadedFileNames.push(lib.name);
        }
      }

      const createdAt = new Date().toISOString();
      const { data, error } = await supabase
        .from('posts')
        .insert({
          author_id: currentUser.id,
          feed_type: feedType,
          content: content.trim() || null,
          created_at: createdAt,
          image_urls: uploadedImageUrls.length > 0 ? uploadedImageUrls : null,
          file_urls: uploadedFileUrls.length > 0 ? uploadedFileUrls : null,
          file_names: uploadedFileNames.length > 0 ? uploadedFileNames : null,
        })
        .select('*')
        .single();

      if (error) {
        console.error('[CreatePost] posts insert failed', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
          author_id: currentUser.id,
          feed_type: feedType,
        });
        throw new Error(error.message);
      }
      if (!data) {
        console.error('[CreatePost] posts insert returned no row', { author_id: currentUser.id, feed_type: feedType });
        throw new Error('Post was not saved. Please try again.');
      }

      void notifyAfterFeedPostCreated(data.id);

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
      setLibraryAttachments([]);
      toast.success('Post published');
    } catch (err) {
      console.error('[CreatePost] handleSubmit error', err);
      toast.error(err instanceof Error ? err.message : 'Failed to publish post');
    } finally {
      setUploading(false);
    }
  };

  const canPost =
    !uploading &&
    (content.trim().length > 0 ||
      pendingImages.length > 0 ||
      pendingFiles.length > 0 ||
      libraryAttachments.length > 0);

  const showResourceLibrary = isAdmin && feedType === 'business';

  return (
    <div className="card-elevated w-full p-3 sm:p-4 space-y-3 box-border">
      <div className="flex gap-2 sm:gap-3 items-start w-full min-w-0">
        <Avatar className="w-8 h-8 sm:w-9 sm:h-9 shrink-0 mt-0.5">
          <AvatarImage src={currentProfile?.avatar_url ?? undefined} />
          <AvatarFallback>{initials(currentProfile?.full_name)}</AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0 relative">
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
            className="resize-none min-h-[80px] text-sm w-full min-w-0"
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
        <div className="flex gap-2 flex-wrap pl-10 sm:pl-12">
          {pendingImages.map(img => (
            <div key={img.id} className="relative w-20 h-20 rounded-lg overflow-hidden bg-muted">
              {img.previewUrl && (
                <Image src={img.previewUrl} alt="preview" fill className="object-cover" unoptimized />
              )}
              <button
                type="button"
                onClick={() => removeImage(img.id)}
                aria-label="Remove image from post"
                className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center hover:bg-black/80"
              >
                <X className="w-3 h-3 text-white" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* File previews */}
      {(pendingFiles.length > 0 || libraryAttachments.length > 0) && (
        <div className="space-y-1 pl-12">
          {libraryAttachments.map((lib) => (
            <div
              key={lib.url}
              className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg text-sm border border-[#C6A664]/20"
            >
              <span className="flex-1 truncate">{lib.name}</span>
              <span className="text-xs text-muted-foreground shrink-0">Library</span>
              <button
                type="button"
                onClick={() => removeLibraryAttachment(lib.url)}
                aria-label="Remove library attachment"
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          {pendingFiles.map(f => (
            <div key={f.id} className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg text-sm">
              <span className="flex-1 truncate">{f.file.name}</span>
              <span className="text-xs text-muted-foreground shrink-0">{formatBytes(f.file.size)}</span>
              <button type="button" onClick={() => removeFile(f.id)} aria-label="Remove file attachment" className="text-muted-foreground hover:text-destructive">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pl-10 sm:pl-12 w-full min-w-0">
        <div className="flex items-center gap-1 flex-wrap">
          <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={e => addImages(e.target.files)} />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => imageInputRef.current?.click()}
            disabled={pendingImages.length >= 4}
            aria-label="Add images to post (max 4)"
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
                aria-label="Attach files to post"
                title="Attach files (up to 5 GB each)"
              >
                <Paperclip className="w-4 h-4" />
              </Button>
              {showResourceLibrary && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  type="button"
                  onClick={() => void openResourceLibrary()}
                  aria-label="Open resource library"
                  title="Resource Library"
                >
                  <Library className="w-4 h-4" />
                </Button>
              )}
            </>
          )}
        </div>

        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={!canPost}
          className="gap-1.5 w-full sm:w-auto shrink-0"
        >
          {uploading ? (
            <><Loader2 className="w-3.5 h-3.5 animate-spin" />Posting…</>
          ) : (
            <><Send className="w-3.5 h-3.5" />Post</>
          )}
        </Button>
      </div>

      <Dialog open={libraryOpen} onOpenChange={setLibraryOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Resource Library</DialogTitle>
          </DialogHeader>
          {libraryLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : libraryRows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No files in the library yet.</p>
          ) : (
            <ScrollArea className="max-h-[min(60vh,320px)] pr-3">
              <ul className="space-y-1">
                {libraryRows.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => attachFromLibrary(row)}
                      className="w-full text-left flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-muted/60 transition-colors"
                    >
                      <Paperclip className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate">{row.file_name}</span>
                      {row.file_size != null && (
                        <span className="text-xs text-muted-foreground shrink-0">
                          {formatBytes(Number(row.file_size))}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
