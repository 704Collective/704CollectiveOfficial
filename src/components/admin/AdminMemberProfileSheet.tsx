'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  User, Calendar, CreditCard, Shield, Settings,
  Mail, Loader2, Check, AlertTriangle, ShieldOff,
  ExternalLink, LogIn, RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useMutation, useQueryClient } from '@tanstack/react-query';

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

interface StripeCharge {
  id: string;
  amount: number;
  currency: string;
  description: string | null;
  status: string;
  created: number;
  payment_intent: string | null;
}

interface MemberDetails {
  lastSignInAt: string | null;
  emailConfirmedAt: string | null;
  stripeCharges: StripeCharge[];
  stripeCustomerId: string | null;
}

interface Ticket {
  id: string;
  status: string;
  checked_in_at: string | null;
  created_at: string;
  events: { id: string; title: string; start_time: string } | null;
}

interface Payment {
  id: string;
  amount: number;
  status: string;
  description: string | null;
  created_at: string;
}

interface AdminMemberProfileSheetProps {
  member: Member | null;
  adminUserIds: Set<string>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMemberUpdated: () => void;
}

export function AdminMemberProfileSheet({
  member,
  adminUserIds,
  open,
  onOpenChange,
  onMemberUpdated,
}: AdminMemberProfileSheetProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState('overview');
  const [details, setDetails] = useState<MemberDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);

  // Edit form state
  const [fullName, setFullName] = useState('');
  const [subscriptionStatus, setSubscriptionStatus] = useState('');
  const [membershipOverride, setMembershipOverride] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resendingSetup, setResendingSetup] = useState(false);
  const [resendingWelcome, setResendingWelcome] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [reactivating, setReactivating] = useState(false);

  const isAdmin = member ? adminUserIds.has(member.id) : false;
  const isSelf = member?.id === user?.id;

  // Reset state when member changes
  useEffect(() => {
    if (member) {
      setFullName(member.full_name || '');
      setSubscriptionStatus(member.subscription_status || 'inactive');
      setMembershipOverride(member.membership_override ?? false);
      setActiveTab('overview');
      setDetails(null);
      setTickets([]);
      setPayments([]);
    }
  }, [member?.id]);

  // Load details tab
  useEffect(() => {
    if (!member || activeTab !== 'access') return;
    if (details) return;
    setDetailsLoading(true);
    supabase.functions.invoke('admin-member-details', { body: { memberId: member.id } })
      .then(({ data }) => { if (data) setDetails(data); })
      .finally(() => setDetailsLoading(false));
  }, [activeTab, member?.id]);

  // Load activity tab
  useEffect(() => {
    if (!member || activeTab !== 'activity') return;
    if (tickets.length) return;
    const load = async () => {
      setTicketsLoading(true);
      try {
        const { data } = await supabase.from('tickets')
          .select('id, status, checked_in_at, created_at, events(id, title, start_time)')
          .eq('user_id', member.id)
          .order('created_at', { ascending: false })
          .limit(20);
        if (data) setTickets(data as unknown as Ticket[]);
      } finally {
        setTicketsLoading(false);
      }
    };
    load();
  }, [activeTab, member?.id]);

  // Load payments tab
  useEffect(() => {
    if (!member || activeTab !== 'payments') return;
    if (payments.length) return;
    const load = async () => {
      setPaymentsLoading(true);
      try {
        const { data } = await supabase.from('payments')
          .select('id, amount, status, description, created_at')
          .eq('user_id', member.id)
          .order('created_at', { ascending: false });
        if (data) setPayments(data as Payment[]);
      } finally {
        setPaymentsLoading(false);
      }
    };
    load();
  }, [activeTab, member?.id]);

  const makeAdminMutation = useMutation({
    mutationFn: async () => {
      if (!member) return;
      const { error } = await supabase.from('user_roles').insert({ user_id: member.id, role: 'admin' });
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Admin access granted'); onMemberUpdated(); },
    onError: () => toast.error('Failed to grant admin access'),
  });

  const removeAdminMutation = useMutation({
    mutationFn: async () => {
      if (!member) return;
      const { error } = await supabase.from('user_roles').delete().eq('user_id', member.id).eq('role', 'admin');
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Admin access removed'); onMemberUpdated(); },
    onError: () => toast.error('Failed to remove admin access'),
  });

  const handleSaveOverview = async () => {
    if (!member) return;
    setSaving(true);
    const { error } = await supabase.from('profiles').update({
      full_name: fullName.trim() || null,
      subscription_status: subscriptionStatus,
      membership_override: membershipOverride,
    }).eq('id', member.id);
    setSaving(false);
    if (error) { toast.error('Failed to save'); return; }
    toast.success('Member updated');
    onMemberUpdated();
  };

  const handleResendSetup = async () => {
    if (!member) return;
    setResendingSetup(true);
    try {
      const { data, error } = await supabase.functions.invoke('resend-setup-email', {
        body: { userId: member.id, template: isAdmin ? 'admin-invite' : 'password-setup', origin: window.location.origin },
      });
      if (error || data?.error) throw new Error(error?.message || data?.error);
      toast.success(`Setup email sent to ${member.email}`);
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Failed'); }
    finally { setResendingSetup(false); }
  };

  const handleResendWelcome = async () => {
    if (!member) return;
    setResendingWelcome(true);
    try {
      const { data: profile } = await supabase.from('profiles').select('calendar_token').eq('id', member.id).maybeSingle();
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
      const calendarToken = (profile as any)?.calendar_token ?? '';
      const calendarUrl = `webcal://${supabaseUrl.replace('https://', '')}/functions/v1/calendar-feed?token=${calendarToken}`;
      const { data, error } = await supabase.functions.invoke('send-email', {
        body: { to: member.email, template: 'welcome', data: { name: member.full_name || 'there', calendarUrl, origin: window.location.origin } },
      });
      if (error || data?.error) throw new Error(error?.message || data?.error);
      toast.success(`Welcome email sent`);
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Failed'); }
    finally { setResendingWelcome(false); }
  };

  const handleDeactivate = async () => {
    if (!member || isSelf) return;
    if (!confirm(`Deactivate ${member.full_name || member.email}? They'll lose access.`)) return;
    setDeactivating(true);
    const { error } = await supabase.functions.invoke('admin-delete-user', { body: { userId: member.id } });
    setDeactivating(false);
    if (error) { toast.error('Failed to deactivate'); return; }
    toast.success('Member deactivated');
    onMemberUpdated();
    onOpenChange(false);
  };

  const handleReactivate = async () => {
    if (!member) return;
    setReactivating(true);
    const { error } = await supabase.functions.invoke('admin-reactivate-user', { body: { userId: member.id } });
    setReactivating(false);
    if (error) { toast.error('Failed to reactivate'); return; }
    toast.success('Member reactivated');
    onMemberUpdated();
  };

  if (!member) return null;

  const statusColor =
    member.deleted_at ? 'bg-destructive/10 text-destructive border-destructive/30' :
    member.subscription_status === 'active' ? 'bg-green-500/10 text-green-500 border-green-500/30' :
    'bg-muted text-muted-foreground';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto p-0">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-border">
          <SheetHeader>
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center shrink-0 text-lg font-bold">
                {(member.full_name || member.email).charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <SheetTitle className="text-left truncate">{member.full_name || 'No name'}</SheetTitle>
                <p className="text-sm text-muted-foreground truncate mt-0.5">{member.email}</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  <Badge className={statusColor}>
                    {member.deleted_at ? 'Deactivated' : (member.subscription_status || 'Inactive')}
                  </Badge>
                  {isAdmin && <Badge className="bg-primary/10 text-primary border-primary/20"><Shield className="w-3 h-3 mr-1" />Admin</Badge>}
                  {member.imported_at && <Badge variant="outline">Imported</Badge>}
                </div>
              </div>
            </div>
          </SheetHeader>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
          <TabsList className="w-full rounded-none border-b border-border bg-transparent h-auto px-6 gap-0 justify-start">
            {[
              { value: 'overview', icon: User, label: 'Overview' },
              { value: 'activity', icon: Calendar, label: 'Activity' },
              { value: 'payments', icon: CreditCard, label: 'Payments' },
              { value: 'access', icon: Shield, label: 'Access' },
              { value: 'actions', icon: Settings, label: 'Actions' },
            ].map(tab => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-3 py-3 text-xs font-medium gap-1.5"
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="p-6 space-y-4 mt-0">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={member.email} disabled />
            </div>
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Full name" />
            </div>
            <div className="space-y-2">
              <Label>Subscription Status</Label>
              <Select value={subscriptionStatus} onValueChange={setSubscriptionStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="canceled">Canceled</SelectItem>
                  <SelectItem value="past_due">Past Due</SelectItem>
                  <SelectItem value="trialing">Trialing</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Manual Membership Override</p>
                <p className="text-xs text-muted-foreground">Bypasses Stripe status for this member</p>
              </div>
              <Switch checked={membershipOverride} onCheckedChange={setMembershipOverride} />
            </div>
            <div className="pt-2 grid grid-cols-2 gap-3 text-sm text-muted-foreground">
              <div><span className="font-medium text-foreground">Joined:</span> {format(new Date(member.created_at), 'MMM d, yyyy')}</div>
              {member.imported_at && <div><span className="font-medium text-foreground">Imported:</span> {format(new Date(member.imported_at), 'MMM d, yyyy')}</div>}
            </div>
            <Button onClick={handleSaveOverview} disabled={saving} className="w-full">
              {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : 'Save Changes'}
            </Button>
          </TabsContent>

          {/* Activity Tab */}
          <TabsContent value="activity" className="p-6 mt-0">
            {ticketsLoading ? (
              <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
            ) : tickets.length === 0 ? (
              <div className="text-center py-12">
                <Calendar className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No tickets found</p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{tickets.length} tickets</p>
                {tickets.map(ticket => (
                  <div key={ticket.id} className="flex items-start justify-between gap-3 p-3 rounded-lg border border-border">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{(ticket.events as any)?.title || 'Unknown Event'}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {(ticket.events as any)?.start_time ? format(new Date((ticket.events as any).start_time), 'MMM d, yyyy') : '—'}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant={ticket.status === 'confirmed' ? 'default' : 'secondary'} className="text-xs">{ticket.status}</Badge>
                      {ticket.checked_in_at && <span className="text-[10px] text-green-500 flex items-center gap-1"><Check className="w-3 h-3" />Checked in</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Payments Tab */}
          <TabsContent value="payments" className="p-6 mt-0">
            {paymentsLoading ? (
              <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
            ) : payments.length === 0 ? (
              <div className="text-center py-12">
                <CreditCard className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No payment history</p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{payments.length} payments</p>
                {payments.map(payment => (
                  <div key={payment.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">${(payment.amount / 100).toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground truncate">{payment.description || 'Membership'}</p>
                      <p className="text-xs text-muted-foreground">{format(new Date(payment.created_at), 'MMM d, yyyy')}</p>
                    </div>
                    <Badge variant={payment.status === 'succeeded' ? 'default' : 'secondary'} className="text-xs shrink-0">{payment.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Access Tab */}
          <TabsContent value="access" className="p-6 space-y-4 mt-0">
            {detailsLoading ? (
              <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
            ) : (
              <>
                {/* Auth info */}
                <div className="space-y-3 p-4 rounded-lg border border-border">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Auth Info</p>
                  <div className="grid grid-cols-1 gap-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Email confirmed</span>
                      <span>{details?.emailConfirmedAt ? format(new Date(details.emailConfirmedAt), 'MMM d, yyyy') : '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Last sign in</span>
                      <span>{details?.lastSignInAt ? format(new Date(details.lastSignInAt), 'MMM d, yyyy h:mm a') : '—'}</span>
                    </div>
                    {details?.stripeCustomerId && (
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Stripe customer</span>
                        <a
                          href={`https://dashboard.stripe.com/customers/${details.stripeCustomerId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary flex items-center gap-1 text-xs hover:underline"
                        >
                          {details.stripeCustomerId.slice(0, 16)}... <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    )}
                  </div>
                </div>

                {/* Admin role */}
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium flex items-center gap-1.5"><Shield className="w-4 h-4" /> Admin Access</p>
                    <p className="text-xs text-muted-foreground">{isAdmin ? 'This member has admin privileges' : 'Grant access to the admin dashboard'}</p>
                  </div>
                  {isAdmin ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      disabled={isSelf || removeAdminMutation.isPending}
                      onClick={() => removeAdminMutation.mutate()}
                    >
                      <ShieldOff className="w-4 h-4 mr-1" />
                      {isSelf ? "Can't remove self" : 'Remove'}
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" disabled={makeAdminMutation.isPending} onClick={() => makeAdminMutation.mutate()}>
                      <Shield className="w-4 h-4 mr-1" />
                      Make Admin
                    </Button>
                  )}
                </div>

                {/* Recent Stripe charges */}
                {details?.stripeCharges && details.stripeCharges.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recent Stripe Charges</p>
                    {details.stripeCharges.slice(0, 5).map(charge => (
                      <div key={charge.id} className="flex items-center justify-between p-2 rounded-lg border border-border text-sm">
                        <div>
                          <span className="font-medium">${(charge.amount / 100).toFixed(2)}</span>
                          <span className="text-muted-foreground ml-2">{format(new Date(charge.created * 1000), 'MMM d, yyyy')}</span>
                        </div>
                        <Badge variant={charge.status === 'succeeded' ? 'default' : 'secondary'} className="text-xs">{charge.status}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </TabsContent>

          {/* Actions Tab */}
          <TabsContent value="actions" className="p-6 space-y-3 mt-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Email Actions</p>

            {member.imported_at && (
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Resend Setup Email</p>
                  <p className="text-xs text-muted-foreground">Password setup link for imported members</p>
                </div>
                <Button variant="outline" size="sm" disabled={resendingSetup} onClick={handleResendSetup}>
                  {resendingSetup ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                </Button>
              </div>
            )}

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Resend Welcome Email</p>
                <p className="text-xs text-muted-foreground">Welcome email with calendar link</p>
              </div>
              <Button variant="outline" size="sm" disabled={resendingWelcome} onClick={handleResendWelcome}>
                {resendingWelcome ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              </Button>
            </div>

            <div className="border-t border-border pt-4 mt-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Account Actions</p>
              {member.deleted_at ? (
                <Button variant="outline" className="w-full" disabled={reactivating} onClick={handleReactivate}>
                  {reactivating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                  Reactivate Member
                </Button>
              ) : (
                <Button
                  variant="destructive"
                  className="w-full"
                  disabled={isSelf || deactivating}
                  onClick={handleDeactivate}
                >
                  {deactivating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  {isSelf ? "Can't deactivate yourself" : 'Deactivate Member'}
                </Button>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
