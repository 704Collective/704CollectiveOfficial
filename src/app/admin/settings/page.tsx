'use client';

import { useAuth } from '@/hooks/useAuth';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AdminLayout } from '@/components/AdminLayout';
import { usePageTitle } from '@/hooks/usePageTitle';
import { supabase } from '@/integrations/supabase/client';
import { AdminHomepageImages } from '@/components/AdminHomepageImages';
import { Apple, AlertCircle, Users, Check, X, Trash2, Loader2, Shield, Image, UserPlus } from 'lucide-react';
import { GeneralSettings } from '@/components/admin/GeneralSettings';
import { MembershipSettings } from '@/components/admin/MembershipSettings';
import { HubSpotIntegrationCard } from '@/components/HubSpotIntegrationCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

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
}

const TABS = [
  { key: 'team', label: 'Team' },
  { key: 'appearance', label: 'Appearance' },
  { key: 'integrations', label: 'Integrations' },
  { key: 'general', label: 'General' },
  { key: 'membership', label: 'Membership' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export default function AdminSettings() {
  const router = useRouter();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isAdmin, isLoading, profile } = useAuth();
  usePageTitle('Admin Settings');

  const activeTab = (TABS.find(t => t.key === searchParams.get('tab'))?.key || 'team') as TabKey;
  const setActiveTab = (tab: TabKey) => setSearchParams({ tab });

  const [pendingRequests, setPendingRequests] = useState<AdminRequest[]>([]);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const [inviteFirstName, setInviteFirstName] = useState('');
  const [inviteLastName, setInviteLastName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteSubmitting, setInviteSubmitting] = useState(false);

  useEffect(() => {
    if (!isLoading && (!user || !isAdmin)) {
      router.push('/admin/login');
    }
  }, [user, isAdmin, isLoading, navigate]);

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

    const { data: roles } = await supabase
      .from('user_roles')
      .select('id, user_id')
      .eq('role', 'admin');

    if (roles && roles.length > 0) {
      const userIds = roles.map(r => r.user_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .in('id', userIds)
        .is('deleted_at', null);

      const adminsList = roles.map(role => {
        const profile = profiles?.find(p => p.id === role.user_id);
        return {
          id: role.id,
          user_id: role.user_id,
          email: profile?.email || '',
          full_name: profile?.full_name || null,
        };
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
        .from('user_roles')
        .insert({ user_id: request.user_id, role: 'admin' });
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
        .from('user_roles')
        .delete()
        .eq('id', admin.id);
      if (error) throw error;
      toast.success(`Admin access removed for ${admin.full_name || admin.email}`);
      fetchAdminData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove admin');
    } finally {
      setProcessingId(null);
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

  if (isLoading) {
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
        {/* Tab bar — scrollable on mobile with scroll-snap */}
        <div className="overflow-x-auto -mx-4 px-4 lg:-mx-0 lg:px-0 mb-6 scrollbar-none">
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

        {/* Tab content */}
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

              {/* Current Admins */}
              <div className="mb-5">
                <h4 className="text-sm font-medium mb-3">Current Admins</h4>
                {loadingData ? (
                  <div className="text-sm text-muted-foreground">Loading...</div>
                ) : admins.length > 0 ? (
                  <div className="space-y-2">
                    {admins.map((admin) => (
                      <div key={admin.id} className="flex items-center justify-between p-3 rounded-lg border border-border gap-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
                            <span className="text-sm font-bold text-primary-foreground">
                              {(admin.full_name || admin.email).charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">
                              {admin.full_name || 'No name'}
                              {admin.user_id === user?.id && (
                                <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">{admin.email}</p>
                          </div>
                        </div>
                        {admin.user_id !== user?.id && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRemoveAdmin(admin)}
                            disabled={processingId === admin.id}
                            className="shrink-0"
                          >
                            {processingId === admin.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No admins found</p>
                )}
              </div>

              {/* Invite Admin Form */}
              <div className="border-t border-border pt-5">
                <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <UserPlus className="w-4 h-4" />
                  Invite Admin
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
                        disabled={inviteSubmitting}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="invite_last_name">Last Name *</Label>
                      <Input
                        id="invite_last_name"
                        value={inviteLastName}
                        onChange={(e) => setInviteLastName(e.target.value)}
                        placeholder="Last name"
                        disabled={inviteSubmitting}
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
                      disabled={inviteSubmitting}
                    />
                  </div>
                  <Button type="submit" disabled={inviteSubmitting} className="w-full sm:w-auto">
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
                </form>
              </div>

              {/* Pending Requests */}
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


          {activeTab === 'appearance' && (
            <div className="card-elevated p-4 sm:p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Image className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">Homepage Images</h3>
                  <p className="text-sm text-muted-foreground">
                    Manage the images displayed on the homepage hero
                  </p>
                </div>
              </div>
              <AdminHomepageImages userId={user?.id || ''} />
            </div>
          )}

          {activeTab === 'integrations' && (
            <div className="space-y-4">
              <HubSpotIntegrationCard />

              {/* Google Card */}
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
                    <h3 className="font-semibold">Google</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Used for Google Wallet digital membership cards and calendar integrations.
                    </p>
                    <div className="flex items-center gap-2 mt-3">
                      <div className="flex items-center gap-2 text-sm text-amber-500">
                        <AlertCircle className="w-4 h-4" />
                        <span>Not connected</span>
                      </div>
                    </div>
                    <Button className="mt-3" variant="outline" size="sm" disabled>Connect Google</Button>
                    <p className="text-xs text-muted-foreground mt-2">Google Wallet integration coming soon</p>
                  </div>
                </div>
              </div>

              {/* Apple Developer Card */}
              <div className="card-elevated p-4 sm:p-6">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
                    <Apple className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold">Apple Developer</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Upload your Apple Developer certificates to enable Apple Wallet passes.
                    </p>
                    <div className="flex items-center gap-2 mt-3">
                      <div className="flex items-center gap-2 text-sm text-amber-500">
                        <AlertCircle className="w-4 h-4" />
                        <span>Certificates required</span>
                      </div>
                    </div>
                    <Button className="mt-3" variant="outline" size="sm" disabled>Upload Certificates</Button>
                    <p className="text-xs text-muted-foreground mt-2">
                      Apple Wallet integration coming soon. Requires $99/year Apple Developer Program.
                    </p>
                  </div>
                </div>
              </div>
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
    </AdminLayout>
  );
}
