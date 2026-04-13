'use client';

import Image from 'next/image';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { AdminLayout } from '@/components/AdminLayout';
import { useAuth } from '@/hooks/useAuth';
import { usePageTitle } from '@/hooks/usePageTitle';
import { supabase } from '@/integrations/supabase/client';
import { notifyHubAdded } from '@/app/actions/notifyHubAdded';
import { toast } from 'sonner';
import {
  Plus, Pencil, Trash2, Users, X, Search, Loader2, Upload,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────

interface Hub {
  id: string;
  title: string;
  description: string | null;
  header_image_url: string | null;
  created_by: string;
  created_at: string;
  member_count?: number;
}

interface HubMember {
  user_id: string;
  joined_at: string;
  profile: { id: string; full_name: string; avatar_url: string | null; title: string | null } | null;
}

interface MemberSearchResult {
  id: string;
  full_name: string;
  avatar_url: string | null;
  title: string | null;
}

function initials(name: string): string {
  return name.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase();
}

// ── Hub Form Modal ─────────────────────────────────────────────────────────

function HubFormModal({
  open,
  onClose,
  existing,
  currentUserId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  existing: Hub | null;
  currentUserId: string;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(existing?.title ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [headerUrl, setHeaderUrl] = useState(existing?.header_image_url ?? '');
  const [saving, setSaving] = useState(false);
  const [headerUploading, setHeaderUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTitle(existing?.title ?? '');
    setDescription(existing?.description ?? '');
    setHeaderUrl(existing?.header_image_url ?? '');
  }, [existing, open]);

  const uploadHeader = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setHeaderUploading(true);
    const path = `hub-headers/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from('portal-media').upload(path, file, { upsert: true });
    if (!error) {
      const { data } = supabase.storage.from('portal-media').getPublicUrl(path);
      setHeaderUrl(data.publicUrl);
    }
    setHeaderUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const save = async () => {
    if (!title.trim()) { toast.error('Title is required'); return; }
    setSaving(true);
    try {
      if (existing) {
        const { error } = await supabase.from('hubs').update({
          title: title.trim(),
          description: description.trim() || null,
          header_image_url: headerUrl || null,
          updated_at: new Date().toISOString(),
        }).eq('id', existing.id);
        if (error) throw error;
      } else {
        const { data: hub, error } = await supabase.from('hubs').insert({
          title: title.trim(),
          description: description.trim() || null,
          header_image_url: headerUrl || null,
          created_by: currentUserId,
        }).select().single();
        if (error) throw error;
        // Add creator as first member
        if (hub) {
          await supabase.from('hub_members').insert({ hub_id: hub.id, user_id: currentUserId, added_by: currentUserId });
        }
      }
      toast.success(existing ? 'Hub updated' : 'Hub created');
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to save hub');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-[#1A1A1A] border-white/10 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">{existing ? 'Edit Hub' : 'Create Hub'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <Label className="text-white/70 text-xs">Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 bg-[#2E2E2E] border-white/10 text-white" />
          </div>
          <div>
            <Label className="text-white/70 text-xs">Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
              className="mt-1 bg-[#2E2E2E] border-white/10 text-white resize-none" />
          </div>
          <div>
            <Label className="text-white/70 text-xs">Header Image</Label>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={uploadHeader} />
            <div className="flex gap-2 mt-1">
              <Input value={headerUrl} onChange={(e) => setHeaderUrl(e.target.value)}
                placeholder="Image URL or upload"
                className="bg-[#2E2E2E] border-white/10 text-white placeholder:text-white/30 text-sm" />
              <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}
                disabled={headerUploading} className="border-white/10 text-white/70 bg-transparent shrink-0">
                {headerUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <Button onClick={save} disabled={!title.trim() || saving}
            className="w-full bg-[#C6A664] hover:bg-[#C6A664] text-[#1A1A1A] font-semibold">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : existing ? 'Save Changes' : 'Create Hub'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Manage Members Panel ───────────────────────────────────────────────────

function ManageMembersModal({
  open,
  onClose,
  hub,
  currentUserName,
}: {
  open: boolean;
  onClose: () => void;
  hub: Hub;
  currentUserName: string;
}) {
  const { user } = useAuth();
  const [members, setMembers] = useState<HubMember[]>([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [searchResults, setSearchResults] = useState<MemberSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);

  const fetchMembers = useCallback(async () => {
    const { data } = await supabase
      .from('hub_members')
      .select('user_id, joined_at, profile:profiles(id, full_name, avatar_url, title)')
      .eq('hub_id', hub.id)
      .order('joined_at', { ascending: true });
    setMembers((data ?? []) as unknown as HubMember[]);
  }, [hub.id]);

  useEffect(() => { if (open) fetchMembers(); }, [open, fetchMembers]);

  useEffect(() => {
    if (!memberSearch.trim()) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      setSearchLoading(true);
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, title')
        .ilike('full_name', `%${memberSearch}%`)
        .or('member_type.eq.business,role.eq.admin,role.eq.super_admin')
        .is('deleted_at', null)
        .limit(8);
      setSearchResults(((data ?? []) as MemberSearchResult[]).filter(
        (m) => !members.find((existing) => existing.user_id === m.id)
      ));
      setSearchLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [memberSearch, members]);

  const addMember = async (member: MemberSearchResult) => {
    if (!user) return;
    setAddingId(member.id);
    try {
      await supabase.from('hub_members').insert({ hub_id: hub.id, user_id: member.id, added_by: user.id });
      notifyHubAdded({
        hubId: hub.id,
        hubTitle: hub.title,
        addedUserId: member.id,
        addedByName: currentUserName,
      }).catch(() => {});
      await fetchMembers();
      setMemberSearch('');
      setSearchResults([]);
      toast.success(`${member.full_name} added to hub`);
    } finally {
      setAddingId(null);
    }
  };

  const removeMember = async (userId: string) => {
    await supabase.from('hub_members').delete().eq('hub_id', hub.id).eq('user_id', userId);
    setMembers((prev) => prev.filter((m) => m.user_id !== userId));
    toast.success('Member removed');
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-[#1A1A1A] border-white/10 text-white max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-white">Manage Members - {hub.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2 flex-1 overflow-hidden flex flex-col">
          {/* Add member search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
            <Input value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)}
              placeholder="Search members to add…"
              className="pl-9 bg-[#2E2E2E] border-white/10 text-white placeholder:text-white/30" />
            {searchLoading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-white/40" />}
          </div>

          {/* Search results */}
          {searchResults.length > 0 && (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {searchResults.map((m) => (
                <div key={m.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[#2E2E2E] hover:bg-[#3E3E3E]">
                  <Avatar className="h-7 w-7"><AvatarImage src={m.avatar_url ?? undefined} /><AvatarFallback className="bg-[#1A1A1A] text-[#C6A664] text-xs">{initials(m.full_name)}</AvatarFallback></Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{m.full_name}</p>
                    {m.title && <p className="text-xs text-white/40 truncate">{m.title}</p>}
                  </div>
                  <Button size="sm" onClick={() => addMember(m)} disabled={addingId === m.id}
                    className="bg-[#C6A664] hover:bg-[#C6A664] text-[#1A1A1A] h-7 px-2 text-xs">
                    {addingId === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Add'}
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Current members */}
          <div className="flex-1 overflow-y-auto space-y-1">
            <p className="text-xs text-white/50 mb-2">{members.length} current members</p>
            {members.map((m) => (
              <div key={m.user_id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[#2E2E2E]">
                <Avatar className="h-7 w-7"><AvatarImage src={m.profile?.avatar_url ?? undefined} /><AvatarFallback className="bg-[#1A1A1A] text-[#C6A664] text-xs">{initials(m.profile?.full_name || '?')}</AvatarFallback></Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{m.profile?.full_name}</p>
                  {m.profile?.title && <p className="text-xs text-white/40 truncate">{m.profile.title}</p>}
                </div>
                <span className="text-xs text-white/30 shrink-0">{format(new Date(m.joined_at), 'MMM d')}</span>
                <button onClick={() => removeMember(m.user_id)} className="text-white/30 hover:text-red-400 transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────

export default function AdminHubsPage() {
  const { user, profile, loading, isAdmin, isSuperAdmin } = useAuth();
  const router = useRouter();
  usePageTitle('Hubs');

  const [hubs, setHubs] = useState<Hub[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingHub, setEditingHub] = useState<Hub | null>(null);
  const [managingHub, setManagingHub] = useState<Hub | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Hub | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user || (!isAdmin && !isSuperAdmin)) router.replace('/admin');
  }, [loading, user, isAdmin, isSuperAdmin, router]);

  const fetchHubs = useCallback(async () => {
    const { data } = await supabase
      .from('hubs')
      .select('*, hub_members(user_id)')
      .order('created_at', { ascending: false });
    setHubs(
      ((data ?? []) as (Hub & { hub_members: { user_id: string }[] })[]).map((h) => ({
        ...h,
        member_count: h.hub_members?.length ?? 0,
      }))
    );
    setPageLoading(false);
  }, []);

  useEffect(() => { fetchHubs(); }, [fetchHubs]);

  const deleteHub = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    await supabase.from('hubs').delete().eq('id', deleteConfirm.id);
    setHubs((prev) => prev.filter((h) => h.id !== deleteConfirm.id));
    setDeleteConfirm(null);
    setDeleting(false);
    toast.success('Hub deleted');
  };

  if (loading || pageLoading) {
    return (
      <AdminLayout title="Hubs">
        <div className="p-6 space-y-4">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
        </div>
      </AdminLayout>
    );
  }

  if (!user || (!isAdmin && !isSuperAdmin)) return null;

  return (
    <AdminLayout title="Hubs">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Hubs</h1>
            <p className="text-sm text-muted-foreground">{hubs.length} hub{hubs.length !== 1 ? 's' : ''}</p>
          </div>
          <Button onClick={() => { setEditingHub(null); setFormOpen(true); }}
            className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground">
            <Plus className="h-4 w-4" /> Create Hub
          </Button>
        </div>

        {/* Table */}
        {hubs.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground text-sm">No hubs yet. Create one to get started.</div>
        ) : (
          <div className="border border-border rounded-xl overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hub</TableHead>
                  <TableHead className="text-center w-24">Members</TableHead>
                  <TableHead className="w-32">Created</TableHead>
                  <TableHead className="w-48 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hubs.map((hub) => (
                  <TableRow
                    key={hub.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/dashboard/hubs/${hub.id}`)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="relative h-9 w-9 rounded-lg bg-accent overflow-hidden shrink-0 flex items-center justify-center">
                          {hub.header_image_url ? (
                            <Image src={hub.header_image_url} alt="" fill className="object-cover" sizes="36px" loading="lazy" />
                          ) : (
                            <span className="text-xs font-bold text-primary opacity-40">704</span>
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-foreground text-sm">{hub.title}</p>
                          {hub.description && (
                            <p className="text-xs text-muted-foreground truncate max-w-xs">{hub.description}</p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary" className="gap-1">
                        <Users className="h-3 w-3" /> {hub.member_count}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(hub.created_at), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost"
                          onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/hubs/${hub.id}`); }}
                          className="h-7 px-2 text-muted-foreground hover:text-foreground gap-1 text-xs">
                          View
                        </Button>
                        <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setManagingHub(hub); }}
                          className="h-7 px-2 text-muted-foreground hover:text-foreground gap-1 text-xs">
                          <Users className="h-3.5 w-3.5" /> Members
                        </Button>
                        <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setEditingHub(hub); setFormOpen(true); }}
                          className="h-7 px-2 text-muted-foreground hover:text-foreground">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setDeleteConfirm(hub); }}
                          className="h-7 px-2 text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Create / Edit modal */}
      {user && (
        <HubFormModal
          open={formOpen}
          onClose={() => setFormOpen(false)}
          existing={editingHub}
          currentUserId={user.id}
          onSaved={fetchHubs}
        />
      )}

      {/* Manage members modal */}
      {managingHub && (
        <ManageMembersModal
          open={!!managingHub}
          onClose={() => setManagingHub(null)}
          hub={managingHub}
          currentUserName={profile?.full_name ?? 'Admin'}
        />
      )}

      {/* Delete confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="bg-[#1A1A1A] border-white/10 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-white">Delete Hub</DialogTitle>
            <DialogDescription className="text-white/50">
              Are you sure you want to delete <strong className="text-white">{deleteConfirm?.title}</strong>? This will remove all posts, resources, and member associations. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}
              className="border-white/10 text-white/70 bg-transparent hover:bg-white/5">Cancel</Button>
            <Button onClick={deleteHub} disabled={deleting} className="bg-red-500 hover:bg-red-600 text-white">
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete Hub'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
