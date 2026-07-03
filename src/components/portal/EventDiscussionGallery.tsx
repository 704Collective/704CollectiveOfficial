'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Camera, ImagePlus, Loader2, X, Download, Trash2, ChevronLeft, ChevronRight, Film } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface GPhoto {
  id: string;
  url: string;
  thumbnail_url: string | null;
  uploader_id: string;
  media_type: string | null;
  created_at: string;
}

const isVideoUrl = (u: string) => /\.(mp4|mov|webm)(\?|$)/i.test(u);
const MAX_FILES = 20;
const MAX_BYTES = 500 * 1024 * 1024;

async function getImageDims(file: File): Promise<{ width: number | null; height: number | null }> {
  if (!file.type.startsWith('image/')) return { width: null, height: null };
  try {
    const bmp = await createImageBitmap(file);
    const dims = { width: bmp.width, height: bmp.height };
    bmp.close();
    return dims;
  } catch { return { width: null, height: null }; }
}

export function EventDiscussionGallery({
  eventId,
  userId,
  isAdmin,
}: {
  eventId: string;
  userId: string;
  isAdmin: boolean;
}) {
  const [photos, setPhotos] = useState<GPhoto[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchPhotos = useCallback(async () => {
    const { data } = await supabase
      .from('event_discussion_photos')
      .select('id, url, thumbnail_url, uploader_id, media_type, created_at')
      .eq('event_id', eventId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    setPhotos((data ?? []) as GPhoto[]);
  }, [eventId]);

  useEffect(() => { void fetchPhotos(); }, [fetchPhotos]);

  const uploadFiles = async (list: FileList | null) => {
    if (!list || uploading) return;
    const files = Array.from(list).slice(0, MAX_FILES);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setUploading(true);
    let ok = 0;
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.size > MAX_BYTES) { toast.error(`${file.name} is over 500MB — skipped.`); continue; }
        setUploadStatus(`Uploading ${i + 1}/${files.length}…`);
        const { data: presign, error: presignErr } = await supabase.functions.invoke('discussion-media-upload', {
          body: { event_id: eventId, file_name: file.name, content_type: file.type, file_size: file.size },
        });
        if (presignErr || !presign?.uploadUrl) { toast.error(`${file.name}: could not get upload URL`); continue; }
        const putRes = await fetch(presign.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
        if (!putRes.ok) { toast.error(`${file.name}: upload failed (${putRes.status})`); continue; }
        const dims = await getImageDims(file);
        const { error: rowErr } = await supabase.from('event_discussion_photos').insert({
          event_id: eventId,
          uploader_id: userId,
          url: presign.publicUrl as string,
          media_type: file.type.startsWith('video/') ? 'video' : 'image',
          source: 'upload',
          file_size_bytes: file.size,
          width: dims.width,
          height: dims.height,
        });
        if (rowErr) { toast.error(`${file.name}: saved to storage but gallery row failed`); continue; }
        ok++;
      }
    } finally {
      setUploading(false);
      setUploadStatus('');
    }
    if (ok > 0) { toast.success(`${ok} file${ok > 1 ? 's' : ''} added to the gallery`); void fetchPhotos(); }
  };

  const softRemove = async (photoId: string) => {
    const { error } = await supabase
      .from('event_discussion_photos')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', photoId);
    if (error) { toast.error('Remove failed: ' + error.message); return; }
    toast.success('Photo removed');
    setLightboxIdx(null);
    void fetchPhotos();
  };

  const download = async (url: string) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = url.split('/').pop() ?? 'photo';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch { toast.error('Download failed'); }
  };

  const lightboxPhoto = lightboxIdx != null ? photos[lightboxIdx] : null;

  const renderTile = (p: GPhoto, sizeHint: string) => (
    isVideoUrl(p.thumbnail_url || p.url) || p.media_type === 'video' ? (
      <video src={p.url} muted preload="metadata" playsInline className="w-full h-full object-cover bg-black" />
    ) : (
      <Image src={p.thumbnail_url || p.url} alt="" fill className="object-cover" unoptimized sizes={sizeHint} />
    )
  );

  return (
    <div className="card-elevated rounded-2xl p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs tracking-wide uppercase text-muted-foreground font-bold inline-flex items-center gap-2">
          <Camera className="w-3.5 h-3.5" /> Gallery{photos.length > 0 ? ` · ${photos.length}` : ''}
        </h3>
        <div className="flex items-center gap-2">
          {uploadStatus && <span className="text-xs text-muted-foreground">{uploadStatus}</span>}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,video/mp4,video/quicktime,video/webm"
            className="hidden"
            onChange={e => void uploadFiles(e.target.files)}
          />
          <Button type="button" size="sm" variant="ghost" disabled={uploading} onClick={() => fileInputRef.current?.click()} className="gap-1.5 text-muted-foreground h-7">
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />} Add photos
          </Button>
        </div>
      </div>
      {photos.length === 0 ? (
        <p className="text-xs text-muted-foreground">No photos yet — be the first to add one.</p>
      ) : (
        <button type="button" onClick={() => setModalOpen(true)} className="flex gap-2 w-full text-left">
          {photos.slice(0, 5).map(p => (
            <div key={p.id} className="flex-1 aspect-square rounded-lg overflow-hidden border border-border relative">
              {renderTile(p, '120px')}
            </div>
          ))}
          {photos.length > 5 && (
            <div className="flex-1 aspect-square rounded-lg border border-border bg-muted flex items-center justify-center text-sm font-bold text-muted-foreground">
              +{photos.length - 5}
            </div>
          )}
        </button>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setModalOpen(false)}>
          <div className="bg-card border border-border rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="text-sm font-bold">Gallery · {photos.length}</h3>
              <Button type="button" size="sm" variant="ghost" onClick={() => setModalOpen(false)} className="h-7 w-7 p-0"><X className="w-4 h-4" /></Button>
            </div>
            <div className="overflow-y-auto p-4 grid grid-cols-3 sm:grid-cols-4 gap-2">
              {photos.map((p, i) => (
                <button key={p.id} type="button" onClick={() => setLightboxIdx(i)} className="aspect-square rounded-lg overflow-hidden border border-border relative">
                  {renderTile(p, '200px')}
                  {(p.media_type === 'video' || isVideoUrl(p.url)) && (
                    <span className="absolute bottom-1 right-1 bg-black/70 rounded p-0.5"><Film className="w-3 h-3 text-white" /></span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {lightboxPhoto && (
        <div className="fixed inset-0 z-[60] bg-black/90 flex flex-col" onClick={() => setLightboxIdx(null)}>
          <div className="flex items-center justify-end gap-2 p-3" onClick={e => e.stopPropagation()}>
            <Button type="button" size="sm" variant="ghost" onClick={() => void download(lightboxPhoto.url)} className="gap-1.5 text-white hover:text-white">
              <Download className="w-4 h-4" /> Download
            </Button>
            {isAdmin && (
              <Button type="button" size="sm" variant="ghost" onClick={() => void softRemove(lightboxPhoto.id)} className="gap-1.5 text-red-400 hover:text-red-300">
                <Trash2 className="w-4 h-4" /> Remove
              </Button>
            )}
            <Button type="button" size="sm" variant="ghost" onClick={() => setLightboxIdx(null)} className="text-white hover:text-white h-8 w-8 p-0"><X className="w-4 h-4" /></Button>
          </div>
          <div className="flex-1 flex items-center justify-center relative px-12 pb-6" onClick={e => e.stopPropagation()}>
            {lightboxIdx != null && lightboxIdx > 0 && (
              <button type="button" onClick={() => setLightboxIdx(lightboxIdx - 1)} className="absolute left-2 text-white p-2"><ChevronLeft className="w-8 h-8" /></button>
            )}
            {isVideoUrl(lightboxPhoto.url) || lightboxPhoto.media_type === 'video' ? (
              <video src={lightboxPhoto.url} controls autoPlay playsInline className="max-h-full max-w-full" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={lightboxPhoto.url} alt="" className="max-h-full max-w-full object-contain" />
            )}
            {lightboxIdx != null && lightboxIdx < photos.length - 1 && (
              <button type="button" onClick={() => setLightboxIdx(lightboxIdx + 1)} className="absolute right-2 text-white p-2"><ChevronRight className="w-8 h-8" /></button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
