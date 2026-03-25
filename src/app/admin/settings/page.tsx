'use client';

import { Suspense } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AdminLayout } from '@/components/AdminLayout';
import { usePageTitle } from '@/hooks/usePageTitle';
import { supabase } from '@/integrations/supabase/client';
import { Apple, AlertCircle, Users, Check, X, Trash2, Loader2, Shield, UserPlus, ExternalLink, CalendarDays } from 'lucide-react';
import { GeneralSettings } from '@/components/admin/GeneralSettings';
import { AdamUniversalInboxToggle } from '@/components/admin/AdamUniversalInboxToggle';
import { MembershipSettings } from '@/components/admin/MembershipSettings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

interface AdminRequest {
  id: string;
  email: string;
  full_name: string | null;
  status: string;
  user_id: string | null;
  requested_at: string;
}

interface AdminUser {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  role: string;
  member_type: string | null;
  membership_override: boolean;
}

const TABS = [
  { key: 'team', label: 'Team' },
  { key: 'integrations', label: 'Integrations' },
  { key: 'general', label: 'General' },
  { key: 'membership', label: 'Membership' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export default function AdminSettingsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><Skeleton className="h-8 w-48" /></div>}>
      <AdminSettings />
    </Suspense>
  );
}

function AdminSettings() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isAdmin, loading, profile } = useAuth();
  usePageTitle('Admin Settings');

  const activeTab = (TABS.find(t => t.key === searchParams.get('tab'))?.key || 'team') as TabKey;
  const setActiveTab = (tab: TabKey) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    router.replace(`?${params.toString()}`);
  };

  const [pendingRequests, setPendingRequests] = useState<AdminRequest[]>([]);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const [inviteFirstName, setInviteFirstName] = useState('');
  const [inviteLastName, setInviteLastName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteSubmitting, setInviteSubmitting] = useState(false);

  const [addByEmail, setAddByEmail] = useState('');
  const [addByEmailLoading, setAddByEmailLoading] = useState(false);
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);
  const [adminToRevoke, setAdminToRevoke] = useState<AdminUser | null>(null);
  const [revokeLoading, setRevokeLoading] = useState(false);

  const isSuperAdmin = (profile as any)?.role === 'super_admin';

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) {
      router.push('/admin/login');
    }
  }, [user, isAdmin, loading, router]);

  useEffect(() => {
    if (isAdmin) {
      fetchAdminData();
    }
  }, [isAdmin]);

  const fetchAdminData = async () => {
    const { data: requests } = await supabase
      .from('admin_requests')
      .select('*')
      .eq('status', 'pending')
      .order('requested_at', { ascending: false });

    // Query profiles directly so super_admins and the current user are always included
    const { data: adminProfiles } = await supabase
      .from('profiles')
      .select('id, email, full_name, role, member_type, membership_override')
      .in('role', ['admin', 'super_admin'])
      .is('deleted_at', null);

    if (adminProfiles && adminProfiles.length > 0) {
      const adminsList: AdminUser[] = adminProfiles.map(p => ({
        id: p.id,
        user_id: p.id,
        email: p.email || '',
        full_name: p.full_name || null,
        role: p.role,
        member_type: p.member_type || null,
        membership_override: p.membership_override ?? false,
      }));
      // Sort: super_admins first, then by name
      adminsList.sort((a, b) => {
        if (a.role === 'super_admin' && b.role !== 'super_admin') return -1;
        if (b.role === 'super_admin' && a.role !== 'super_admin') return 1;
        return (a.full_name || '').localeCompare(b.full_name || '');
      });
      setAdmins(adminsList);
    } else {
      setAdmins([]);
    }

    setPendingRequests(requests || []);
    setLoadingData(false);
  };

  const handleApprove = async (request: AdminRequest) => {
    if (!request.user_id) {
      toast.error('User account not found for this request');
      return;
    }
    setProcessingId(request.id);
    try {
      const { error: roleError } = await supabase
        .from('profiles')
        .update({ role: 'admin' })
        .eq('id', request.user_id);
      if (roleError) throw roleError;

      const { error: updateError } = await supabase
        .from('admin_requests')
        .update({
          status: 'approved',
          reviewed_at: new Date().toISOString(),
          reviewed_by: user?.id,
        })
        .eq('id', request.id);
      if (updateError) throw updateError;

      try {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('full_name, email')
          .eq('id', request.user_id)
          .is('deleted_at', null)
          .single();
        if (profileData?.email) {
          await supabase.functions.invoke('send-email', {
            body: {
              to: profileData.email,
              template: 'admin-invite',
              data: { name: profileData.full_name || request.full_name || '', loginUrl: `${window.location.origin}/admin` },
            },
          });
        }
      } catch {
        toast.warning('Admin role assigned but invite email couldn\'t be sent');
      }

      toast.success(`${request.full_name || request.email} is now an admin`);
      fetchAdminData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to approve request');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (request: AdminRequest) => {
    setProcessingId(request.id);
    try {
      const { error } = await supabase
        .from('admin_requests')
        .update({
          status: 'rejected',
          reviewed_at: new Date().toISOString(),
          reviewed_by: user?.id,
        })
        .eq('id', request.id);
      if (error) throw error;
      toast.success('Request rejected');
      fetchAdminData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to reject request');
    } finally {
      setProcessingId(null);
    }
  };

  const handleRemoveAdmin = async (admin: AdminUser) => {
    if (admin.user_id === user?.id) {
      toast.error("You can't remove yourself as admin");
      return;
    }
    if (!confirm(`Remove admin access for ${admin.full_name || admin.email}? They will still be able to log in as a regular member.`)) return;
    setProcessingId(admin.id);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role: 'lead' })
        .eq('id', admin.user_id);
      if (error) throw error;
      toast.success(`Admin access removed for ${admin.full_name || admin.email}`);
      fetchAdminData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove admin');
    } finally {
      setProcessingId(null);
    }
  };

  const handleChangeRole = async (admin: AdminUser, newRole: 'admin' | 'super_admin') => {
    if (admin.user_id === user?.id) {
      toast.error("You can't change your own role");
      return;
    }
    setProcessingId(admin.id);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', admin.user_id);
      if (error) throw error;
      toast.success(`${admin.full_name || admin.email} is now a ${newRole === 'super_admin' ? 'Super Admin' : 'Admin'}`);
      fetchAdminData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to change role');
    } finally {
      setProcessingId(null);
    }
  };

  const handleToggleOverride = async (admin: AdminUser) => {
    setProcessingId(admin.id);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ membership_override: !admin.membership_override })
        .eq('id', admin.user_id);
      if (error) throw error;
      toast.success(`Membership override ${!admin.membership_override ? 'enabled' : 'disabled'} for ${admin.full_name || admin.email}`);
      fetchAdminData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to toggle override');
    } finally {
      setProcessingId(null);
    }
  };

  const handleAddByEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailTrimmed = addByEmail.trim().toLowerCase();
    if (!emailTrimmed) return;
    setAddByEmailLoading(true);
    try {
      const { data: found } = await supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .eq('email', emailTrimmed)
        .is('deleted_at', null)
        .maybeSingle();

      if (!found) {
        toast.error('No account found with that email address');
        return;
      }

      if (found.role === 'admin' || found.role === 'super_admin') {
        toast.error(`${found.full_name || found.email} already has an admin role`);
        return;
      }

      const { error: roleErr } = await supabase
        .from('profiles')
        .update({ role: 'admin', membership_override: true, member_type: 'business' })
        .eq('id', found.id);
      if (roleErr) throw roleErr;

      toast.success(`${found.full_name || found.email} is now an admin`);
      setAddByEmail('');
      fetchAdminData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to add admin');
    } finally {
      setAddByEmailLoading(false);
    }
  };

  const handleRevokeAccess = async () => {
    if (!adminToRevoke) return;
    setRevokeLoading(true);
    try {
      const { error: roleErr } = await supabase
        .from('profiles')
        .update({ role: 'lead' })
        .eq('id', adminToRevoke.user_id);
      if (roleErr) throw roleErr;

      toast.success(`Admin access removed for ${adminToRevoke.full_name || adminToRevoke.email}`);
      setShowRevokeConfirm(false);
      setAdminToRevoke(null);
      fetchAdminData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove admin access');
    } finally {
      setRevokeLoading(false);
    }
  };

  const handleInviteAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteFirstName.trim() || !inviteLastName.trim()) {
      toast.error('First and last name are required');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!inviteEmail.trim() || !emailRegex.test(inviteEmail.trim())) {
      toast.error('A valid email is required');
      return;
    }
    setInviteSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-invite', {
        body: {
          firstName: inviteFirstName.trim(),
          lastName: inviteLastName.trim(),
          email: inviteEmail.trim(),
          origin: window.location.origin,
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      if (data?.isNewUser) {
        toast.success(`Invite sent to ${inviteEmail.trim()}`);
      } else {
        toast.success(`${inviteFirstName.trim()} ${inviteLastName.trim()} has been made an admin`);
      }
      setInviteFirstName('');
      setInviteLastName('');
      setInviteEmail('');
      fetchAdminData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to invite admin');
    } finally {
      setInviteSubmitting(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout title="Settings">
        <div className="space-y-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card-elevated p-6 animate-pulse">
              <div className="h-6 bg-muted rounded w-1/4 mb-4" />
              <div className="h-4 bg-muted rounded w-3/4" />
            </div>
          ))}
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Settings">
      <div className="max-w-2xl">
        <div className="overflow-x-auto -mx-4 px-4 lg:-mx-0 lg:px-0 mb-6">
          <div className="flex border-b border-border" style={{ minWidth: 'max-content' }}>
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "px-4 py-3 text-sm font-medium transition-colors relative whitespace-nowrap shrink-0",
                  activeTab === tab.key
                    ? "text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-primary after:rounded-full"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {activeTab === 'team' && (
            <div className="card-elevated p-4 sm:p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Shield className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">Admin Team</h3>
                  <p className="text-sm text-muted-foreground">Manage admins and send invites</p>
                </div>
              </div>

              {/* Role management list */}
              <div className="mb-5">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-medium">Admin Team</h4>
                  {!isSuperAdmin && (
                    <span className="text-xs text-muted-foreground">View only — super admin required to make changes</span>
                  )}
                </div>
                {loadingData ? (
                  <div className="text-sm text-muted-foreground">Loading...</div>
                ) : admins.length > 0 ? (
                  <div className="space-y-2">
                    {admins.map((admin) => (
                      <div key={admin.id} className="rounded-lg border border-border p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
                              <span className="text-sm font-bold text-primary-foreground">
                                {(admin.full_name || admin.email).charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className="font-medium text-sm truncate">
                                  {admin.full_name || 'No name'}
                                  {admin.user_id === user?.id && (
                                    <span className="ml-1 text-xs text-muted-foreground">(you)</span>
                                  )}
                                </p>
                                <span className={cn(
                                  'text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
                                  admin.role === 'super_admin'
                                    ? 'bg-primary/15 text-primary'
                                    : 'bg-blue-500/10 text-blue-400'
                                )}>
                                  {admin.role === 'super_admin' ? 'Super Admin' : 'Admin'}
                                </span>
                                {admin.membership_override && (
                                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-400">Override</span>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground truncate">{admin.email}</p>
                              {admin.member_type && (
                                <p className="text-xs text-muted-foreground capitalize">{admin.member_type.replace(/_/g, ' ')}</p>
                              )}
                            </div>
                          </div>
                          {isSuperAdmin && admin.user_id !== user?.id && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleRemoveAdmin(admin)}
                              disabled={processingId === admin.id}
                              className="shrink-0 text-destructive hover:text-destructive"
                            >
                              {processingId === admin.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                            </Button>
                          )}
                        </div>

                        {/* Super-admin controls */}
                        {isSuperAdmin && admin.user_id !== user?.id && (
                          <div className="flex flex-wrap gap-2 pt-1 border-t border-border/50">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              disabled={processingId === admin.id}
                              onClick={() => handleChangeRole(admin, admin.role === 'super_admin' ? 'admin' : 'super_admin')}
                            >
                              {processingId === admin.id ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                              {admin.role === 'super_admin' ? 'Demote to Admin' : 'Promote to Super Admin'}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              disabled={processingId === admin.id}
                              onClick={() => handleToggleOverride(admin)}
                            >
                              {admin.membership_override ? 'Remove Override' : 'Enable Override'}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs text-destructive hover:text-destructive border-destructive/30 hover:border-destructive/60"
                              disabled={processingId === admin.id}
                              onClick={() => { setAdminToRevoke(admin); setShowRevokeConfirm(true); }}
                            >
                              Remove Access
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No admins found</p>
                )}

                {/* Team summary */}
                {!loadingData && admins.length > 0 && (
                  <div className="flex gap-4 mt-4 pt-3 border-t border-border/60 text-xs text-muted-foreground">
                    <span>
                      <strong className="text-foreground">{admins.filter(a => a.role === 'super_admin').length}</strong>{' '}
                      Super Admin{admins.filter(a => a.role === 'super_admin').length !== 1 ? 's' : ''}
                    </span>
                    <span>
                      <strong className="text-foreground">{admins.filter(a => a.role === 'admin').length}</strong>{' '}
                      Admin{admins.filter(a => a.role === 'admin').length !== 1 ? 's' : ''}
                    </span>
                    <span>
                      <strong className="text-foreground">{admins.length}</strong> Total
                    </span>
                  </div>
                )}
              </div>

              {/* Add admin by email (super_admin only) */}
              {isSuperAdmin && (
                <div className="border-t border-border pt-5 mb-5">
                  <h4 className="text-sm font-medium mb-1 flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    Add Admin by Email
                  </h4>
                  <p className="text-xs text-muted-foreground mb-3">
                    Finds an existing member by email, grants admin role, enables membership override, and sets member_type to business.
                  </p>
                  <form onSubmit={handleAddByEmail} className="flex gap-2">
                    <Input
                      type="email"
                      placeholder="member@example.com"
                      value={addByEmail}
                      onChange={e => setAddByEmail(e.target.value)}
                      disabled={addByEmailLoading}
                      className="flex-1"
                    />
                    <Button type="submit" disabled={addByEmailLoading || !addByEmail.trim()} className="shrink-0">
                      {addByEmailLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add Admin'}
                    </Button>
                  </form>
                </div>
              )}

              <div className="border-t border-border pt-5">
                <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <UserPlus className="w-4 h-4" />
                  Invite New Admin
                </h4>
                <form onSubmit={handleInviteAdmin} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="invite_first_name">First Name *</Label>
                      <Input
                        id="invite_first_name"
                        value={inviteFirstName}
                        onChange={(e) => setInviteFirstName(e.target.value)}
                        placeholder="First name"
                        disabled={inviteSubmitting || !isSuperAdmin}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="invite_last_name">Last Name *</Label>
                      <Input
                        id="invite_last_name"
                        value={inviteLastName}
                        onChange={(e) => setInviteLastName(e.target.value)}
                        placeholder="Last name"
                        disabled={inviteSubmitting || !isSuperAdmin}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="invite_email">Email *</Label>
                    <Input
                      id="invite_email"
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="email@example.com"
                      disabled={inviteSubmitting || !isSuperAdmin}
                    />
                  </div>
                  <Button type="submit" disabled={inviteSubmitting || !isSuperAdmin} className="w-full sm:w-auto">
                    {inviteSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <UserPlus className="mr-2 h-4 w-4" />
                        Send Invite
                      </>
                    )}
                  </Button>
                  {!isSuperAdmin && (
                    <p className="text-xs text-muted-foreground">Only super admins can send invites.</p>
                  )}
                </form>
              </div>

              {pendingRequests.length > 0 && (
                <div className="border-t border-border pt-5 mt-5">
                  <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Pending Requests
                    <span className="px-2 py-0.5 bg-primary text-primary-foreground text-xs rounded-full">
                      {pendingRequests.length}
                    </span>
                  </h4>
                  <div className="space-y-2">
                    {pendingRequests.map((request) => (
                      <div key={request.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-lg border border-border bg-muted/30">
                        <div className="min-w-0">
                          <p className="font-medium text-sm">{request.full_name || 'No name'}</p>
                          <p className="text-sm text-muted-foreground truncate">{request.email}</p>
                          <p className="text-xs text-muted-foreground">
                            Requested {format(new Date(request.requested_at), 'MMM d, yyyy')}
                          </p>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <Button size="sm" variant="outline" onClick={() => handleApprove(request)} disabled={processingId === request.id} className="flex-1 sm:flex-none">
                            {processingId === request.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <><Check className="w-4 h-4 mr-1" /> Approve</>
                            )}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleReject(request)} disabled={processingId === request.id}>
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'integrations' && (
            <div className="space-y-4">

              {/* ── Google ── */}
              <div className="card-elevated p-4 sm:p-6">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5 text-blue-500" viewBox="0 0 24 24">
                      <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">Google</h3>
                      <span className="flex items-center gap-1 text-xs text-green-400 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                        Connected
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Google services are live for authentication, payments, and digital wallet passes.
                    </p>
                    <div className="mt-3 space-y-2">
                      {['Google Login', 'Google Pay', 'Google Wallet'].map(service => (
                        <div key={service} className="flex items-center gap-2 text-sm">
                          <Check className="w-3.5 h-3.5 text-green-400 shrink-0" />
                          <span className="text-foreground">{service}</span>
                          <span className="text-xs text-green-400 font-medium">Active</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Apple ── */}
              <div className="card-elevated p-4 sm:p-6">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
                    <Apple className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-muted-foreground">Apple</h3>
                      <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-medium">Coming Soon</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Apple services for authentication, payments, and Wallet passes.
                    </p>
                    <div className="mt-3 space-y-2 opacity-50">
                      {['Apple Login', 'Apple Pay', 'Apple Wallet'].map(service => (
                        <div key={service} className="flex items-center gap-2 text-sm">
                          <AlertCircle className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span className="text-muted-foreground">{service}</span>
                          <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-medium">Coming Soon</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-3">
                      Waiting on Apple Developer account ($99/yr program required).
                    </p>
                  </div>
                </div>
              </div>

              {/* ── Eventbrite ── */}
              <div className="card-elevated p-4 sm:p-6">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5 text-orange-500" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.5 14.25H7.5v-1.5h9v1.5zm0-3H7.5v-1.5h9v1.5zm0-3H7.5V8.75h9v1.5z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold">Eventbrite</h3>
                      <span className="flex items-center gap-1 text-xs text-green-400 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                        Active
                      </span>
                      <a
                        href="https://www.eventbrite.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors ml-auto"
                      >
                        eventbrite.com <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      API key configured. Event sync and ticket management are live.
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                      <div>
                        <span className="text-muted-foreground text-xs uppercase tracking-wider font-medium">Organization</span>
                        <p className="text-foreground font-medium mt-0.5">704 Collective</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground text-xs uppercase tracking-wider font-medium">Org ID</span>
                        <p className="text-foreground font-medium mt-0.5 font-mono text-xs">2989352320198</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Calendar Sync ── */}
              <div className="card-elevated p-4 sm:p-6">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <CalendarDays className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">Calendar Sync</h3>
                      <span className="flex items-center gap-1 text-xs text-green-400 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                        Active
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Members can subscribe to the 704 Collective event calendar directly from their dashboard.
                    </p>
                    <div className="mt-3 flex items-center gap-2 text-sm">
                      <Check className="w-3.5 h-3.5 text-green-400 shrink-0" />
                      <span className="text-foreground">calendar-feed edge function</span>
                      <span className="text-xs text-green-400 font-medium">Live</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Served as a live iCal feed — compatible with Apple Calendar, Google Calendar, and Outlook.
                    </p>
                  </div>
                </div>
              </div>

              <AdamUniversalInboxToggle email={profile?.email} />

            </div>
          )}

          {activeTab === 'general' && (
            <GeneralSettings userId={user?.id || ''} />
          )}

          {activeTab === 'membership' && (
            <MembershipSettings />
          )}
        </div>
      </div>

      {/* Revoke access confirmation dialog */}
      <Dialog open={showRevokeConfirm} onOpenChange={setShowRevokeConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Admin Access</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove admin access for{' '}
              <strong>{adminToRevoke?.full_name || adminToRevoke?.email}</strong>?{' '}
              Their role will be set back to <strong>lead</strong> and they will lose all admin privileges.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRevokeConfirm(false)} disabled={revokeLoading}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRevokeAccess} disabled={revokeLoading}>
              {revokeLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Removing...</> : 'Remove Access'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}