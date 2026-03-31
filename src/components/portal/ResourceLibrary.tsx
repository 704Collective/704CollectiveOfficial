'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { format } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Search, Upload, Download, Trash2, Tag, X, Loader2, FolderOpen } from 'lucide-react';

interface AdminResource {
  id: string;
  uploaded_by: string;
  file_url: string;
  file_name: string;
  file_size: number;
  file_type: string | null;
  tags: string[] | null;
  created_at: string;
  uploader: { full_name: string; avatar_url: string | null } | null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(type: string | null): string {
  if (!type) return '📄';
  if (type.startsWith('image/')) return '🖼️';
  if (type.startsWith('video/')) return '🎬';
  if (type.includes('pdf')) return '📕';
  if (type.includes('word') || type.includes('document')) return '📝';
  if (type.includes('sheet') || type.includes('excel')) return '📊';
  if (type.includes('presentation') || type.includes('powerpoint')) return '📊';
  if (type.includes('zip') || type.includes('compressed')) return '🗜️';
  return '📄';
}

function initials(name: string): string {
  return name.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase();
}

// ── Upload modal ──────────────────────────────────────────────────────────

function UploadModal({
  open,
  onClose,
  uploaderId,
  onUploaded,
}: {
  open: boolean;
  onClose: () => void;
  uploaderId: string;
  onUploaded: () => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t)) { setTags((prev) => [...prev, t]); }
    setTagInput('');
  };

  const upload = async () => {
    if (!files.length) return;
    setUploading(true);
    try {
      for (const file of files) {
        const path = `${Date.now()}-${file.name}`;
        const { error } = await supabase.storage.from('admin-resources').upload(path, file);
        if (error) { toast.error(`Failed: ${file.name}`); continue; }
        const { data: pub } = supabase.storage.from('admin-resources').getPublicUrl(path);
        await supabase.from('admin_resources').insert({
          uploaded_by: uploaderId,
          file_url: pub.publicUrl,
          file_name: file.name,
          file_size: file.size,
          file_type: file.type || null,
          tags: tags.length ? tags : null,
        });
      }
      toast.success(`${files.length} file${files.length > 1 ? 's' : ''} uploaded`);
      onUploaded();
      onClose();
      setFiles([]);
      setTags([]);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-[#1A1A1A] border-white/10 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Upload Resources</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          {/* File picker */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-white/10 rounded-xl p-6 text-center cursor-pointer hover:border-white/20 transition-colors"
          >
            <input ref={fileInputRef} type="file" multiple className="hidden"
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
            <Upload className="h-8 w-8 text-white/20 mx-auto mb-2" />
            <p className="text-sm text-white/50">Click to browse files</p>
            <p className="text-xs text-white/30 mt-1">Any file type</p>
          </div>

          {/* Selected files */}
          {files.length > 0 && (
            <div className="space-y-1">
              {files.map((f, i) => (
                <div key={i} className="flex items-center justify-between bg-[#2E2E2E] rounded-lg px-3 py-2">
                  <span className="text-sm text-white truncate">{f.name}</span>
                  <span className="text-xs text-white/40 ml-2 shrink-0">{formatBytes(f.size)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Tags */}
          <div>
            <Label className="text-white/70 text-xs">Tags (optional)</Label>
            <div className="flex gap-2 mt-1">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                placeholder="Add a tag…"
                className="bg-[#2E2E2E] border-white/10 text-white placeholder:text-white/30 text-sm"
              />
              <Button size="sm" variant="outline" onClick={addTag}
                className="border-white/10 text-white/70 hover:text-white bg-transparent">
                <Tag className="h-4 w-4" />
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {tags.map((t) => (
                  <Badge key={t} className="bg-[#C6A664]/20 text-[#C6A664] border-[#C6A664]/30 gap-1 pr-1">
                    {t}
                    <button onClick={() => setTags((prev) => prev.filter((x) => x !== t))}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <Button onClick={upload} disabled={!files.length || uploading}
            className="w-full bg-[#C6A664] hover:bg-[#C6A664] text-[#1A1A1A] font-semibold">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : `Upload ${files.length || ''} File${files.length !== 1 ? 's' : ''}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function ResourceLibrary() {
  const { user, isAdmin, isSuperAdmin } = useAuth();
  const [resources, setResources] = useState<AdminResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);

  const canManage = isAdmin || isSuperAdmin;

  const fetchResources = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('admin_resources')
      .select('*, uploader:profiles(full_name, avatar_url)')
      .order('created_at', { ascending: false });
    setResources((data ?? []) as AdminResource[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchResources(); }, [fetchResources]);

  const deleteResource = async (resource: AdminResource) => {
    await supabase.from('admin_resources').delete().eq('id', resource.id);
    setResources((prev) => prev.filter((r) => r.id !== resource.id));
    toast.success('Resource deleted');
  };

  // All unique tags
  const allTags = Array.from(new Set(resources.flatMap((r) => r.tags ?? []))).sort();

  const filtered = resources.filter((r) => {
    const matchSearch = !search.trim() ||
      r.file_name.toLowerCase().includes(search.toLowerCase()) ||
      (r.uploader?.full_name?.toLowerCase() ?? '').includes(search.toLowerCase()) ||
      (r.tags ?? []).some((t) => t.toLowerCase().includes(search.toLowerCase()));
    const matchTag = !tagFilter || (r.tags ?? []).includes(tagFilter);
    return matchSearch && matchTag;
  });

  if (!canManage) {
    return <div className="text-center py-12 text-white/40 text-sm">Access restricted to admins.</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">Resource Library</h2>
          <p className="text-sm text-white/40 mt-1">
            {loading ? '…' : `${filtered.length} file${filtered.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <Button onClick={() => setUploadOpen(true)}
          className="bg-[#C6A664] hover:bg-[#C6A664] text-[#1A1A1A] font-semibold gap-2">
          <Upload className="h-4 w-4" /> Upload Files
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search files, uploaders, tags…"
            className="pl-9 bg-[#2E2E2E] border-white/10 text-white placeholder:text-white/30" />
        </div>
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setTagFilter('')}
              className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${!tagFilter ? 'bg-[#C6A664]/20 text-[#C6A664] border-[#C6A664]/30' : 'border-white/10 text-white/40 hover:text-white/70'}`}>
              All
            </button>
            {allTags.map((t) => (
              <button key={t} onClick={() => setTagFilter(tagFilter === t ? '' : t)}
                className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${tagFilter === t ? 'bg-[#C6A664]/20 text-[#C6A664] border-[#C6A664]/30' : 'border-white/10 text-white/40 hover:text-white/70'}`}>
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* File grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl bg-[#2E2E2E]" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <FolderOpen className="h-12 w-12 text-white/10" />
          <p className="text-white/40 text-sm">{search || tagFilter ? 'No files match your filters' : 'No resources uploaded yet'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((r) => (
            <div key={r.id} className="bg-[#2E2E2E] border border-white/10 rounded-xl p-4 flex flex-col gap-3 hover:border-white/20 transition-colors">
              <div className="flex items-start gap-3">
                <span className="text-2xl">{fileIcon(r.file_type)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white leading-tight truncate">{r.file_name}</p>
                  <p className="text-xs text-white/40 mt-0.5">{formatBytes(r.file_size)}</p>
                </div>
              </div>

              {r.tags && r.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {r.tags.map((t) => (
                    <Badge key={t} className="bg-white/5 text-white/50 border-white/10 text-[10px] px-1.5 py-0">{t}</Badge>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2 mt-auto pt-2 border-t border-white/5">
                <Avatar className="h-5 w-5">
                  <AvatarImage src={r.uploader?.avatar_url ?? undefined} />
                  <AvatarFallback className="bg-[#1A1A1A] text-[#C6A664] text-[9px]">
                    {initials(r.uploader?.full_name || '?')}
                  </AvatarFallback>
                </Avatar>
                <span className="text-xs text-white/40 flex-1 truncate">{r.uploader?.full_name}</span>
                <span className="text-xs text-white/30 shrink-0">{format(new Date(r.created_at), 'MMM d')}</span>
              </div>

              <div className="flex gap-1.5">
                <a href={r.file_url} target="_blank" rel="noopener noreferrer" download={r.file_name} className="flex-1">
                  <Button size="sm" variant="outline"
                    className="w-full border-white/10 text-white/70 hover:text-white hover:border-white/30 bg-transparent gap-1.5 text-xs">
                    <Download className="h-3.5 w-3.5" /> Download
                  </Button>
                </a>
                <Button size="sm" variant="ghost" onClick={() => deleteResource(r)}
                  className="px-2 text-white/30 hover:text-red-400 hover:bg-red-400/10">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {user && (
        <UploadModal
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
          uploaderId={user.id}
          onUploaded={fetchResources}
        />
      )}
    </div>
  );
}
