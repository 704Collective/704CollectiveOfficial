'use client';
import { useRef, useState } from 'react';
import { Send, Loader2, ImagePlus, X, Film } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { EventMentionTextarea } from './EventMentionTextarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getInitialsAvatarStyle } from '@/lib/avatarInitialsColor';
import { notifyAfterDiscussionPostCreated } from '@/app/actions/eventDiscussionNotifications';

interface ComposerAuthor { id: string; full_name: string | null; avatar_url: string | null; }

export interface NewDiscussionPost {
  id: string;
  author_id: string;
  content: string | null;
  image_urls: string[] | null;
  created_at: string;
  author: ComposerAuthor | null;
}

interface PendingFile {
  file: File;
  previewUrl: string; // object URL for images; '' for videos
  isVideo: boolean;
}

const MAX_FILES = 10;
const MAX_BYTES = 500 * 1024 * 1024;

function initials(name: string | null | undefined): string {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

async function getImageDims(file: File): Promise<{ width: number | null; height: number | null }> {
  if (!file.type.startsWith('image/')) return { width: null, height: null };
  try {
    const bmp = await createImageBitmap(file);
    const dims = { width: bmp.width, height: bmp.height };
    bmp.close();
    return dims;
  } catch {
    return { width: null, height: null };
  }
}

export function EventDiscussionComposer({
  eventId,
  author,
  onPosted,
}: {
  eventId: string;
  author: ComposerAuthor;
  onPosted: (post: NewDiscussionPost) => void;
}) {
  const [content, setContent] = useState('');
  const [posting, setPosting] = useState(false);
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [uploadStatus, setUploadStatus] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const next: PendingFile[] = [];
    for (const file of Array.from(list)) {
      if (pending.length + next.length >= MAX_FILES) { toast.error(`Max ${MAX_FILES} files per post.`); break; }
      if (file.size > MAX_BYTES) { toast.error(`${file.name} is over 500MB.`); continue; }
      const isVideo = file.type.startsWith('video/');
      next.push({ file, isVideo, previewUrl: isVideo ? '' : URL.createObjectURL(file) });
    }
    if (next.length) setPending(prev => [...prev, ...next]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removePending = (idx: number) => {
    setPending(prev => {
      const target = prev[idx];
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const submit = async () => {
    const text = content.trim();
    if ((!text && pending.length === 0) || posting) return;
    setPosting(true);

    // 1) Upload media first (presign -> direct PUT to R2)
    const uploaded: { publicUrl: string; file: File; width: number | null; height: number | null }[] = [];
    try {
      for (let i = 0; i < pending.length; i++) {
        const { file } = pending[i];
        setUploadStatus(`Uploading ${i + 1}/${pending.length}…`);
        const { data: presign, error: presignErr } = await supabase.functions.invoke('discussion-media-upload', {
          body: { event_id: eventId, file_name: file.name, content_type: file.type, file_size: file.size },
        });
        if (presignErr || !presign?.uploadUrl) throw new Error(presignErr?.message || 'Could not get upload URL');
        const putRes = await fetch(presign.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
        if (!putRes.ok) throw new Error(`Upload failed (${putRes.status})`);
        const dims = await getImageDims(file);
        uploaded.push({ publicUrl: presign.publicUrl as string, file, width: dims.width, height: dims.height });
      }
    } catch (err) {
      setPosting(false);
      setUploadStatus('');
      toast.error(err instanceof Error ? err.message : 'Media upload failed. Post not created.');
      return;
    }
    setUploadStatus('');

    // 2) Create the post (media URLs ride in image_urls)
    const { data, error } = await supabase
      .from('event_discussion_posts')
      .insert({
        event_id: eventId,
        author_id: author.id,
        content: text || null,
        image_urls: uploaded.length ? uploaded.map(u => u.publicUrl) : null,
      })
      .select('id, author_id, content, image_urls, created_at')
      .single();

    if (error || !data) {
      setPosting(false);
      toast.error(error?.message || 'Could not post. Please try again.');
      return;
    }
    const postId = (data as { id: string }).id;

    // 3) Gallery auto-collect: one photos row per file (non-fatal if it fails)
    if (uploaded.length) {
      const photoRows = uploaded.map(u => ({
        event_id: eventId,
        uploader_id: author.id,
        url: u.publicUrl,
        media_type: u.file.type.startsWith('video/') ? 'video' : 'image',
        source: 'feed',
        source_post_id: postId,
        file_size_bytes: u.file.size,
        width: u.width,
        height: u.height,
      }));
      const { error: photoErr } = await supabase.from('event_discussion_photos').insert(photoRows);
      if (photoErr) toast.error('Posted, but gallery sync failed: ' + photoErr.message);
    }

    setPosting(false);
    onPosted({ ...(data as unknown as NewDiscussionPost), author });
    void notifyAfterDiscussionPostCreated(postId);
    setContent('');
    pending.forEach(p => { if (p.previewUrl) URL.revokeObjectURL(p.previewUrl); });
    setPending([]);
  };

  const canPost = (!!content.trim() || pending.length > 0) && !posting;

  return (
    <div className="card-elevated rounded-2xl p-4 mb-4">
      <div className="flex gap-3 items-start">
        <Avatar className="w-9 h-9 shrink-0 mt-0.5">
          <AvatarImage src={author.avatar_url ?? undefined} />
          <AvatarFallback className="text-sm font-semibold" style={getInitialsAvatarStyle(author.id)}>
            {initials(author.full_name)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <EventMentionTextarea
            eventId={eventId}
            value={content}
            onChange={setContent}
            onSubmit={submit}
            placeholder="Share something with the group going…  Type @ to tag someone going. (⌘↵ to post)"
            className="min-h-[72px] text-sm w-full"
            rows={3}
          />
          {pending.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {pending.map((p, i) => (
                <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-border bg-muted">
                  {p.isVideo ? (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-0.5 px-1">
                      <Film className="w-5 h-5 text-muted-foreground" />
                      <span className="text-[9px] text-muted-foreground truncate w-full text-center">{p.file.name}</span>
                    </div>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.previewUrl} alt="" className="w-full h-full object-cover" />
                  )}
                  <button
                    type="button"
                    onClick={() => removePending(i)}
                    className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 text-white flex items-center justify-center"
                    aria-label="Remove file"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,video/mp4,video/quicktime,video/webm"
                className="hidden"
                onChange={e => addFiles(e.target.files)}
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => fileInputRef.current?.click()}
                disabled={posting}
                className="gap-1.5 text-muted-foreground"
              >
                <ImagePlus className="w-4 h-4" /> Photo/Video
              </Button>
              {uploadStatus && <span className="text-xs text-muted-foreground">{uploadStatus}</span>}
            </div>
            <Button size="sm" onClick={submit} disabled={!canPost} className="gap-1.5">
              {posting ? (<><Loader2 className="w-3.5 h-3.5 animate-spin" />Posting…</>) : (<><Send className="w-3.5 h-3.5" />Post</>)}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
