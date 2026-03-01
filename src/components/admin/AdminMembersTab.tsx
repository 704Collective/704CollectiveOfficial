'use client';

import { useAuth } from '@/hooks/useAuth';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { QuickAddMemberDialog } from '@/components/admin/QuickAddMemberDialog';
import { DeleteConfirmDialog } from '@/components/admin/DeleteConfirmDialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  Users, Search, UserPlus, ArrowLeft, Shield, ShieldOff, Mail, Loader2,
  ChevronLeft, ChevronRight,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────
interface Member {
  id: string;
  email: string;
  full_name: string | null;
  subscription_status: string | null;
  membership_override: boolean | null;
  created_at: string;
  deleted_at: string | null;
  imported_at: string | null;
}

interface MemberForm {
  full_name: string;
  subscription_status: string;
  membership_override: boolean;
}

type FilterType = 'all' | 'active' | 'inactive' | 'recent' | 'deactivated' | 'imported';

// ── Avatar helpers ─────────────────────────────────────────────────
const AVATAR_COLORS = [
  'bg-rose-600', 'bg-amber-600', 'bg-emerald-600', 'bg-cyan-600',
  'bg-blue-600', 'bg-violet-600', 'bg-pink-600', 'bg-teal-600',
  'bg-indigo-600', 'bg-orange-600',
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) { hash = ((hash << 5) - hash) + name.charCodeAt(i); hash |= 0; }
  return Math.abs(hash);
}

function MemberAvatar({ name }: { name: string }) {
  const color = AVATAR_COLORS[hashName(name) % AVATAR_COLORS.length];
  return (
    <div className={cn('w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white text-xs font-semibold', color)}>
      {getInitials(name)}
    </div>
  );
}

const PAGE_SIZE = 20;
const STALE_TIME = 5 * 60 * 1000;

// ── Data fetching ──────────────────────────────────────────────────
async function fetchMembersData(page: number, activeFilter: FilterType) {
  const start = (page - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE - 1;
  let query = supabase
    .from('profiles')
    .select('id, email, full_name, subscription_status, membership_override, created_at, deleted_at, imported_at', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (activeFilter === 'deactivated') query = query.not('deleted_at', 'is', null);
  else query = query.is('deleted_at', null);
  query = query.range(start, end);

  const [membersResult, rolesResult] = await Promise.all([
    query,
    supabase.from('user_roles').select('user_id').eq('role', 'admin'),
  ]);

  if (membersResult.error) throw membersResult.error;

  return {
    members: (membersResult.data || []) as Member[],
    totalCount: membersResult.count || 0,
    adminUserIds: new Set((rolesResult.data || []).map(r => r.user_id)),
  };
}

interface AdminMembersTabProps {
  onNavigateToDashboard: () => void;
}

export function AdminMembersTab({ onNavigateToDashboard }: AdminMembersTabProps) {
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // UI-only state
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [form, setForm] = useState<MemberForm>({ full_name: '', subscription_status: '', membership_override: false });
  const [editingMemberIsAdmin, setEditingMemberIsAdmin] = useState(false);
  const [showRemoveAdminConfirm, setShowRemoveAdminConfirm] = useState(false);
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);
  const [resendingEmail, setResendingEmail] = useState(false);
  const [resendingWelcome, setResendingWelcome] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [page, setPage] = useState(1);

  const activeFilter = (searchParams.get('filter') as FilterType) || 'all';

  const setFilter = (filter: FilterType) => {
    const params = new URLSearchParams(searchParams);
    if (filter === 'all') params.delete('filter'); else params.set('filter', filter);
    setSearchParams(params);
    setPage(1);
  };

  const invalidateMembers = () => queryClient.invalidateQueries({ queryKey: ['admin-members'] });

  // ── React Query ──────────────────────────────────────────────────
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-members', page, activeFilter],
    queryFn: () => fetchMembersData(page, activeFilter),
    staleTime: STALE_TIME,
  });

  const members = data?.members ?? [];
  const totalCount = data?.totalCount ?? 0;
  const adminUserIds = data?.adminUserIds ?? new Set<string>();

  // ── Mutations ────────────────────────────────────────────────────
  const updateMemberMutation = useMutation({
    mutationFn: async ({ memberId, updates }: { memberId: string; updates: { full_name: string | null; subscription_status: string; membership_override: boolean } }) => {
      const { error } = await supabase.from('profiles').update(updates).eq('id', memberId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Member updated'); setDialogOpen(false); invalidateMembers(); },
    onError: (err) => toast.error(`Failed to update member: ${err instanceof Error ? err.message : 'Unknown error'}`),
  });

  const makeAdminMutation = useMutation({
    mutationFn: async (member: Member) => {
      const { error } = await supabase.from('user_roles').insert({ user_id: member.id, role: 'admin' });
      if (error) throw error;
      try { await supabase.functions.invoke('send-email', { body: { to: member.email, template: 'admin-invite', data: { name: member.full_name || '', loginUrl: `${window.location.origin}/admin` } } }); }
      catch { /* non-blocking */ }
    },
    onSuccess: () => { setEditingMemberIsAdmin(true); toast.success(`${editingMember?.full_name || editingMember?.email} is now an admin`); invalidateMembers(); },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to assign admin role'),
  });

  const removeAdminMutation = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase.from('user_roles').delete().eq('user_id', memberId).eq('role', 'admin');
      if (error) throw error;
    },
    onSuccess: () => { setEditingMemberIsAdmin(false); setShowRemoveAdminConfirm(false); toast.success(`Admin access removed for ${editingMember?.full_name || editingMember?.email}`); invalidateMembers(); },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to remove admin role'),
  });

  const deactivateMutation = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase.functions.invoke('admin-delete-user', { body: { userId: memberId } });
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Member deactivated successfully'); setShowDeactivateConfirm(false); setDialogOpen(false); invalidateMembers(); },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to deactivate member'),
  });

  const reactivateMutation = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase.functions.invoke('admin-reactivate-user', { body: { userId: memberId } });
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Member reactivated successfully'); setDialogOpen(false); invalidateMembers(); },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to reactivate member'),
  });

  // ── Handlers ─────────────────────────────────────────────────────
  const openEdit = (member: Member) => {
    setEditingMember(member);
    setEditingMemberIsAdmin(adminUserIds.has(member.id));
    setForm({ full_name: member.full_name || '', subscription_status: member.subscription_status || 'inactive', membership_override: member.membership_override ?? false });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!editingMember) return;
    const shouldOverride = form.membership_override;
    updateMemberMutation.mutate({
      memberId: editingMember.id,
      updates: { full_name: form.full_name.trim() || null, subscription_status: form.subscription_status, membership_override: shouldOverride },
    });
  };

  const handleResendSetupEmail = async () => {
    if (!editingMember) return;
    setResendingEmail(true);
    try {
      const template = editingMemberIsAdmin ? 'admin-invite' : 'password-setup';
      const { data, error } = await supabase.functions.invoke('resend-setup-email', { body: { userId: editingMember.id, template, origin: window.location.origin } });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      toast.success(`Setup email resent to ${editingMember.email}`);
    } catch (err: unknown) { const msg = err instanceof Error ? err.message : 'Failed to resend email'; toast.error(msg); }
    finally { setResendingEmail(false); }
  };

  const handleResendWelcomeEmail = async () => {
    if (!editingMember) return;
    setResendingWelcome(true);
    try {
      const { data: profile } = await supabase.from('profiles').select('calendar_token').eq('id', editingMember.id).single();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const calendarToken = profile?.calendar_token ?? '';
      const calendarUrl = `webcal://${supabaseUrl.replace('https://', '')}/functions/v1/calendar-feed?token=${calendarToken}`;
      const { data, error } = await supabase.functions.invoke('send-email', {
        body: { to: editingMember.email, template: 'welcome', data: { name: editingMember.full_name || 'there', calendarUrl, origin: window.location.origin } },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      toast.success(`Welcome email sent to ${editingMember.email}`);
    } catch (err: unknown) { const msg = err instanceof Error ? err.message : 'Failed to send welcome email'; toast.error(msg); }
    finally { setResendingWelcome(false); }
  };

  // Filter
  const filtered = members.filter(member => {
    const matchesSearch = member.full_name?.toLowerCase().includes(search.toLowerCase()) || member.email.toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;
    switch (activeFilter) {
      case 'active': return member.subscription_status === 'active';
      case 'inactive': return member.subscription_status !== 'active';
      case 'recent': { const w = new Date(); w.setDate(w.getDate() - 7); return new Date(member.created_at) >= w; }
      case 'deactivated': return true;
      case 'imported': return !!member.imported_at;
      default: return true;
    }
  });

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className="animate-in fade-in-0 duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onNavigateToDashboard}><ArrowLeft className="w-4 h-4" /></Button>
          <h2 className="text-xl font-semibold">Membership Management</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => router.push('/admin/import-members')}>Import CSV</Button>
          <Button size="sm" onClick={() => setQuickAddOpen(true)}><UserPlus className="w-4 h-4 lg:mr-2" /><span className="hidden lg:inline">Add Member</span></Button>
        </div>
      </div>

      {isError ? (
        <div className="text-center py-12">
          <p className="text-sm text-destructive mb-2">Failed to load members.</p>
          <Button variant="outline" size="sm" onClick={() => invalidateMembers()}>Retry</Button>
        </div>
      ) : isLoading ? (
        <div className="space-y-3">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : (
        <>
          <div className="flex flex-col gap-3 mb-4">
            <div className="overflow-x-auto -mx-4 px-4 lg:mx-0 lg:px-0">
              <div className="flex gap-2 w-max lg:w-auto lg:flex-wrap">
                {(['all', 'active', 'inactive', 'recent', 'imported', 'deactivated'] as FilterType[]).map(f => (
                  <Button key={f} variant={activeFilter === f ? 'default' : 'outline'} size="sm" onClick={() => setFilter(f)}>
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </Button>
                ))}
              </div>
            </div>
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search members..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
            </div>
          </div>

          {filtered.length === 0 && (
            <div className="text-center py-12">
              {search ? (
                <><Search className="w-10 h-10 text-muted-foreground/50 mx-auto mb-3" /><h3 className="font-semibold text-foreground mb-1">No results found</h3><p className="text-sm text-muted-foreground">Try a different search term.</p></>
              ) : (
                <><Users className="w-10 h-10 text-muted-foreground/50 mx-auto mb-3" /><h3 className="font-semibold text-foreground mb-1">No members yet</h3><p className="text-sm text-muted-foreground mb-4">Import your first members to get started.</p><Button variant="outline" onClick={() => router.push('/admin/import-members')}>Import Members</Button></>
              )}
            </div>
          )}

          {/* Desktop Table */}
          {filtered.length > 0 && (
            <div className="hidden lg:block overflow-x-auto border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs uppercase tracking-wider">Member</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider">Email</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider">Status</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider">{activeFilter === 'deactivated' ? 'Deactivated' : 'Joined'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(member => {
                    const statusColor = member.deleted_at ? 'bg-destructive' : member.subscription_status === 'active' ? 'bg-green-500' : 'bg-muted-foreground/50';
                    return (
                      <TableRow key={member.id} className="cursor-pointer hover:bg-accent/50" onClick={() => openEdit(member)}>
                        <TableCell className="font-medium py-3">
                          <span className="flex items-center gap-3">
                            <MemberAvatar name={member.full_name || member.email} />
                            <span className="flex items-center gap-2">
                              {member.full_name || 'No name'}
                              {adminUserIds.has(member.id) && <Badge className="bg-primary/10 text-primary hover:bg-primary/20 text-xs"><Shield className="w-3 h-3 mr-1" />Admin</Badge>}
                              {member.imported_at && <Badge variant="outline" className="text-xs">Imported</Badge>}
                            </span>
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{member.email}</TableCell>
                        <TableCell>
                          <span className="flex items-center gap-2">
                            <span className={cn('w-2 h-2 rounded-full shrink-0', statusColor)} />
                            {member.deleted_at ? <span className="text-destructive text-sm">Deactivated</span> : <span className="text-sm capitalize">{member.subscription_status || 'Inactive'}</span>}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {activeFilter === 'deactivated' && member.deleted_at ? format(new Date(member.deleted_at), 'MMM d, yyyy') : format(new Date(member.created_at), 'MMM d, yyyy')}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Mobile Card Layout */}
          {filtered.length > 0 && (
            <div className="lg:hidden divide-y divide-border">
              {filtered.map(member => {
                const statusColor = member.deleted_at ? 'bg-destructive' : member.subscription_status === 'active' ? 'bg-green-500' : 'bg-muted-foreground/50';
                const statusText = member.deleted_at ? 'Deactivated' : (member.subscription_status || 'Inactive');
                return (
                  <div key={member.id} className="flex items-center gap-3 py-3 px-1 cursor-pointer active:bg-accent/30" onClick={() => openEdit(member)}>
                    <MemberAvatar name={member.full_name || member.email} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">{member.full_name || 'No name'}</span>
                        {adminUserIds.has(member.id) && <Badge className="bg-primary/10 text-primary text-[10px] px-1.5 py-0">Admin</Badge>}
                        {member.imported_at && <Badge variant="outline" className="text-[10px] px-1.5 py-0">Imported</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{member.email}</p>
                      <p className="text-xs text-muted-foreground/70">Joined {format(new Date(member.created_at), 'MMM d, yyyy')}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={cn('w-2 h-2 rounded-full', statusColor)} />
                      <span className="text-xs capitalize text-muted-foreground">{statusText}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {totalCount > PAGE_SIZE && (
            <div className="flex items-center justify-between pt-4">
              <p className="text-sm text-muted-foreground">Showing {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, totalCount)} of {totalCount}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="w-4 h-4 mr-1" /> Previous</Button>
                <Button variant="outline" size="sm" disabled={page * PAGE_SIZE >= totalCount} onClick={() => setPage(p => p + 1)}>Next <ChevronRight className="w-4 h-4 ml-1" /></Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Member Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Member</DialogTitle>
            <DialogDescription>Update member details below.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label>Email</Label><Input value={editingMember?.email || ''} disabled /></div>
            <div className="space-y-2"><Label htmlFor="full_name">Full Name</Label><Input id="full_name" value={form.full_name} onChange={e => setForm(prev => ({ ...prev, full_name: e.target.value }))} placeholder="Member name" /></div>
            <div className="space-y-2">
              <Label>Subscription Status</Label>
              <Select value={form.subscription_status} onValueChange={v => setForm(prev => ({ ...prev, subscription_status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="past_due">Past Due</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="membership_override" className="text-sm font-medium">Manual Membership</Label>
                <p className="text-xs text-muted-foreground">Prevents automatic downgrade for members without a Stripe account</p>
              </div>
              <Switch id="membership_override" checked={form.membership_override} onCheckedChange={c => setForm(prev => ({ ...prev, membership_override: c }))} />
            </div>
            {/* Admin Access */}
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium flex items-center gap-1.5"><Shield className="w-4 h-4" /> Admin Access</Label>
                <p className="text-xs text-muted-foreground">{editingMemberIsAdmin ? 'This user has admin privileges' : 'Grant admin dashboard access'}</p>
              </div>
              {editingMemberIsAdmin ? (
                <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" disabled={removeAdminMutation.isPending || editingMember?.id === user?.id} onClick={() => setShowRemoveAdminConfirm(true)}>
                  <ShieldOff className="w-4 h-4 mr-1" />{editingMember?.id === user?.id ? "Can't remove self" : 'Remove Admin'}
                </Button>
              ) : (
                <Button variant="outline" size="sm" disabled={makeAdminMutation.isPending} onClick={() => editingMember && makeAdminMutation.mutate(editingMember)}>
                  <Shield className="w-4 h-4 mr-1" />{makeAdminMutation.isPending ? 'Updating...' : 'Make Admin'}
                </Button>
              )}
            </div>
            {/* Setup Email */}
            {editingMember?.imported_at && (
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium flex items-center gap-1.5"><Mail className="w-4 h-4" /> Setup Email</Label>
                  <p className="text-xs text-muted-foreground">Resend the password setup email to this member</p>
                </div>
                <Button variant="outline" size="sm" disabled={resendingEmail} onClick={handleResendSetupEmail}>
                  {resendingEmail ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Sending...</> : <><Mail className="w-4 h-4 mr-1" /> Resend</>}
                </Button>
              </div>
            )}
            {/* Welcome Email */}
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium flex items-center gap-1.5"><Mail className="w-4 h-4" /> Welcome Email</Label>
                <p className="text-xs text-muted-foreground">Resend the welcome email with calendar link</p>
              </div>
              <Button variant="outline" size="sm" disabled={resendingWelcome} onClick={handleResendWelcomeEmail}>
                {resendingWelcome ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Sending...</> : <><Mail className="w-4 h-4 mr-1" /> Resend</>}
              </Button>
            </div>
          </div>
          <DialogFooter className="flex justify-between sm:justify-between">
            {editingMember?.deleted_at ? (
              <Button variant="outline" onClick={() => editingMember && reactivateMutation.mutate(editingMember.id)} disabled={reactivateMutation.isPending}>{reactivateMutation.isPending ? 'Reactivating...' : 'Reactivate Member'}</Button>
            ) : (
              <Button variant="destructive" onClick={() => setShowDeactivateConfirm(true)} disabled={editingMember?.id === user?.id}>Deactivate Member</Button>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={updateMemberMutation.isPending}>{updateMemberMutation.isPending ? 'Updating...' : 'Update'}</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialogs */}
      <DeleteConfirmDialog open={showRemoveAdminConfirm} onOpenChange={setShowRemoveAdminConfirm} onConfirm={() => editingMember && removeAdminMutation.mutate(editingMember.id)} title="Remove Admin Access" description={`Are you sure you want to remove admin access for "${editingMember?.full_name || editingMember?.email}"?`} isLoading={removeAdminMutation.isPending} />
      <DeleteConfirmDialog open={showDeactivateConfirm} onOpenChange={setShowDeactivateConfirm} onConfirm={() => editingMember && deactivateMutation.mutate(editingMember.id)} title="Deactivate Member" description={`Are you sure you want to deactivate "${editingMember?.full_name || editingMember?.email}"? They will no longer be able to log in.`} isLoading={deactivateMutation.isPending} />
      <QuickAddMemberDialog open={quickAddOpen} onOpenChange={setQuickAddOpen} onSuccess={invalidateMembers} />
    </div>
  );
}
