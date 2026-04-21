'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Calendar, Gift, Mail, DollarSign, MapPin } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { parseContactRouteId } from '@/lib/admin/unified-contacts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';

interface GuestPassEventRow {
  id: string;
  guest_pass_code: string;
  event_id: string | null;
  inviter_user_id: string | null;
  created_at: string;
  eventTitle?: string;
  eventDate?: string;
  inviterName?: string;
}

function initials(name: string | null, email: string) {
  const s = (name || email).trim();
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return s.slice(0, 2).toUpperCase();
}

function avatarColor(email: string) {
  const palette = ['bg-rose-600', 'bg-amber-600', 'bg-emerald-600', 'bg-cyan-600', 'bg-blue-600', 'bg-violet-600', 'bg-pink-600', 'bg-teal-600', 'bg-indigo-600', 'bg-orange-600'];
  let h = 0;
  for (let i = 0; i < email.length; i++) h = (h + email.charCodeAt(i) * 13) % 997;
  return palette[h % palette.length];
}

export default function AdminContactDetailPage() {
  const params = useParams();
  const router = useRouter();
  const raw = typeof params.id === 'string' ? params.id : '';
  const parsed = useMemo(() => parseContactRouteId(raw), [raw]);

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [contactRow, setContactRow] = useState<Record<string, unknown> | null>(null);
  const [emails, setEmails] = useState<{ subject: string; template: string; created_at: string }[]>([]);
  const [payments, setPayments] = useState<{ description: string | null; amount: number; created_at: string | null; status: string }[]>([]);
  const [notes, setNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [rsvpCount, setRsvpCount] = useState(0);
  const [guestPassEvents, setGuestPassEvents] = useState<GuestPassEventRow[]>([]);

  const load = useCallback(async () => {
    const parsed = parseContactRouteId(raw);
    if (!parsed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      if (parsed.table === 'profiles') {
        const { data, error } = await supabase.from('profiles').select('*').eq('id', parsed.id).maybeSingle();
        if (error) throw error;
        setProfile(data as Record<string, unknown>);
        setContactRow(null);
        setNotes((data as { admin_notes?: string | null })?.admin_notes ?? '');
        const { count } = await supabase
          .from('tickets')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', parsed.id)
          .in('status', ['confirmed', 'rsvp']);
        setRsvpCount(count ?? 0);
        const { data: pay } = await supabase
          .from('payments')
          .select('description, amount, created_at, status')
          .eq('user_id', parsed.id)
          .order('created_at', { ascending: false })
          .limit(20);
        setPayments((pay ?? []) as never);
        const em = (data as { email?: string })?.email;
        if (em) {
          const { data: logs } = await supabase
            .from('email_log')
            .select('subject, template, created_at')
            .eq('to_email', em)
            .order('created_at', { ascending: false })
            .limit(30);
          setEmails((logs ?? []) as never);
        } else setEmails([]);
      } else {
        const { data, error } = await supabase.from('contacts').select('*').eq('id', parsed.id).maybeSingle();
        if (error) throw error;
        setContactRow((data as Record<string, unknown>) ?? null);
        setProfile(null);
        setNotes(String((data as { notes?: string })?.notes ?? ''));
        setRsvpCount(0);
        setPayments([]);
        setEmails([]);

        // Load guest pass event lead sources for non-member contacts
        if (parsed.id) {
          try {
            const { data: gpeRows } = await (supabase as any)
              .from('guest_pass_events')
              .select('id, guest_pass_code, event_id, inviter_user_id, created_at')
              .eq('contact_id', parsed.id)
              .order('created_at', { ascending: false });

            if (gpeRows && gpeRows.length > 0) {
              // Enrich with event + inviter names
              const enriched = await Promise.all(
                (gpeRows as GuestPassEventRow[]).map(async (row) => {
                  let eventTitle = '—';
                  let eventDate = '';
                  let inviterName = '—';

                  if (row.event_id) {
                    const { data: ev } = await supabase
                      .from('events')
                      .select('title, start_time')
                      .eq('id', row.event_id)
                      .single();
                    if (ev) {
                      eventTitle = ev.title;
                      eventDate = format(new Date(ev.start_time), 'MMM d, yyyy');
                    }
                  }

                  if (row.inviter_user_id) {
                    const { data: inv } = await supabase
                      .from('profiles')
                      .select('full_name')
                      .eq('id', row.inviter_user_id)
                      .is('deleted_at', null)
                      .single();
                    if (inv?.full_name) inviterName = inv.full_name;
                  }

                  return { ...row, eventTitle, eventDate, inviterName };
                })
              );
              setGuestPassEvents(enriched);
            } else {
              setGuestPassEvents([]);
            }
          } catch {
            setGuestPassEvents([]);
          }
        }
      }
    } catch (e) {
      console.error(e);
      toast.error('Failed to load contact');
    } finally {
      setLoading(false);
    }
  }, [raw]);

  useEffect(() => { void load(); }, [load]);

  const saveNotesBlur = async () => {
    if (!parsed) return;
    setSavingNotes(true);
    try {
      if (parsed.table === 'profiles') {
        const { error } = await supabase.from('profiles').update({ admin_notes: notes || null }).eq('id', parsed.id);
        if (error) throw error;
      } else if (parsed.table === 'contacts') {
        const { error } = await supabase
          .from('contacts')
          .update({ notes: notes || null, updated_at: new Date().toISOString() })
          .eq('id', parsed.id);
        if (error) throw error;
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to save notes');
    } finally {
      setSavingNotes(false);
    }
  };

  if (!parsed) {
    return <p className="text-sm text-muted-foreground">Invalid contact link.</p>;
  }

  const row = profile ?? contactRow;
  if (!loading && !row) {
    return <p className="text-sm text-muted-foreground">Contact not found.</p>;
  }

  const email = String(row?.email ?? '');
  const name = (row?.full_name as string | null) ?? null;
  const isMember = parsed.table === 'profiles';
  const type = isMember ? 'member' : String((contactRow as { contact_type?: string } | null)?.contact_type ?? 'prospect');
  const active = isMember
    ? Boolean((row as { membership_override?: boolean } | null)?.membership_override
      || (row as { subscription_status?: string } | null)?.subscription_status === 'active')
    : String((row as { status?: string } | null)?.status ?? '') === 'active';

  return (
    <div className="space-y-6 pb-10 max-w-4xl">
      <button
        type="button"
        onClick={() => router.push('/admin/contacts')}
        className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Contacts
      </button>

      {loading || !row ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : (
        <>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className={`flex h-16 w-16 items-center justify-center rounded-full text-lg font-semibold text-white ${avatarColor(email)}`}>
                {initials(name, email)}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">{name || email}</h1>
                <p className="text-muted-foreground text-sm">{email}</p>
                <span className="mt-2 inline-block text-[11px] capitalize rounded-md px-1.5 py-0.5 bg-green-500/15 text-green-400">{type}</span>
              </div>
            </div>
          </div>

          <Card>
            <CardContent className="p-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className={`flex h-12 w-12 items-center justify-center rounded-full text-sm font-semibold text-white ${avatarColor(email)}`}>
                  {initials(name, email)}
                </div>
                <div>
                  <p className="font-semibold">{name || '—'}</p>
                  <p className="text-sm text-muted-foreground">{email}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-xs rounded-full px-2 py-0.5 border ${active ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' : 'bg-muted text-muted-foreground border-border'}`}>
                  {active ? 'Active' : 'Inactive'}
                </span>
                {isMember && (
                  <span className="text-xs rounded-full px-2 py-0.5 border bg-muted text-foreground border-border">
                    {(row as { member_type?: string }).member_type === 'business' ? 'Business' : 'Social'}
                  </span>
                )}
                {isMember && (
                  <p className="text-xs text-muted-foreground w-full sm:w-auto mt-2 sm:mt-0">
                    Member since {format(new Date((row as { member_since?: string }).member_since || (row as { created_at?: string }).created_at || Date.now()), 'MMM d, yyyy')}
                    {' · '}Portal created {format(new Date((row as { created_at?: string }).created_at || Date.now()), 'MMM d, yyyy')}
                  </p>
                )}
              </div>
              <Button variant="outline" size="sm" asChild>
                <a href={`mailto:${email}`}>Send Email</a>
              </Button>
            </CardContent>
          </Card>

          <Tabs defaultValue="overview">
            <TabsList className="flex flex-wrap h-auto gap-1 bg-muted/40 p-1">
              {(['Overview', 'Activity', 'Emails', 'Messages', 'Payments', 'Settings'] as const).map((t) => (
                <TabsTrigger key={t} value={t.toLowerCase()} className="text-xs sm:text-sm">
                  {t}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="overview" className="space-y-4 mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardContent className="p-5">
                    <div className="flex justify-between items-start mb-3">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground/70">Events Attended</p>
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <p className="text-3xl font-bold text-foreground">{rsvpCount}</p>
                    <p className="text-xs text-muted-foreground mt-1">{rsvpCount} total RSVPs</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-5 space-y-2 text-sm">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground/70 mb-2">Membership Info</p>
                    <div className="flex justify-between gap-2"><span className="text-muted-foreground">Type</span><span className="font-medium">{(row as { member_type?: string }).member_type || '—'}</span></div>
                    <div className="flex justify-between gap-2"><span className="text-muted-foreground">Since</span><span className="font-medium">{(row as { member_since?: string }).member_since ? format(new Date((row as { member_since?: string }).member_since!), 'MMM d, yyyy') : '—'}</span></div>
                    <div className="flex justify-between gap-2"><span className="text-muted-foreground">Manual Override</span><span className="font-medium">{(row as { membership_override?: boolean }).membership_override ? 'Yes' : 'No'}</span></div>
                    <div className="flex justify-between gap-2"><span className="text-muted-foreground">Phone</span><span className="font-medium">{(row as { phone?: string }).phone || '—'}</span></div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-5 space-y-2 text-sm">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground/70 mb-2">Portal Status</p>
                    <div className="flex justify-between gap-2"><span className="text-muted-foreground">Account Created</span><span className="font-medium">{isMember ? 'Yes' : 'No'}</span></div>
                    <div className="flex justify-between gap-2"><span className="text-muted-foreground">Last Login</span><span className="font-medium">—</span></div>
                    <div className="flex justify-between gap-2"><span className="text-muted-foreground">Source</span><span className="font-medium capitalize">{(row as { source?: string }).source?.replace(/_/g, ' ') || '—'}</span></div>
                    <div className="flex justify-between gap-2"><span className="text-muted-foreground">Source Detail</span><span className="font-medium capitalize">{(row as { source_detail?: string }).source_detail?.replace(/_/g, ' ') || '—'}</span></div>
                    <div className="flex justify-between gap-2"><span className="text-muted-foreground">Created</span><span className="font-medium">{(row as { created_at?: string }).created_at ? format(new Date((row as { created_at?: string }).created_at!), 'MMM d, yyyy') : '—'}</span></div>
                  </CardContent>
                </Card>

                {/* Lead Sources — guest pass event tracking */}
                {(!isMember && guestPassEvents.length > 0) && (
                  <Card className="md:col-span-2">
                    <CardContent className="p-5">
                      <div className="flex justify-between items-start mb-3">
                        <p className="text-xs uppercase tracking-wider text-muted-foreground/70">Lead Sources</p>
                        <MapPin className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div className="space-y-3">
                        {guestPassEvents.map((gpe) => (
                          <div key={gpe.id} className="flex flex-col gap-0.5 text-sm border-b border-border last:border-0 pb-3 last:pb-0">
                            <div className="flex items-center justify-between">
                              <span className="font-medium">{gpe.eventTitle}</span>
                              <span className="text-xs text-muted-foreground">{gpe.eventDate}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Gift className="w-3 h-3 shrink-0" />
                              <span>Invited by <span className="text-foreground font-medium">{gpe.inviterName}</span></span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>Source: guest_pass · Pass: <span className="font-mono">{gpe.guest_pass_code.slice(0, 8)}…</span></span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardContent className="p-5">
                    <div className="flex justify-between items-start mb-3">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground/70">Guest Passes</p>
                      <Gift className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <p className="text-lg font-semibold">{guestPassEvents.length > 0 ? guestPassEvents.length : '—'}</p>
                    {guestPassEvents.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">event{guestPassEvents.length !== 1 ? 's' : ''} sourced via guest pass</p>
                    )}
                  </CardContent>
                </Card>
              </div>
              <div>
                <Label>Admin Notes</Label>
                <Textarea
                  rows={4}
                  placeholder="Add notes about this member..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  onBlur={() => { void saveNotesBlur(); }}
                  disabled={savingNotes}
                />
                <p className="text-xs text-muted-foreground mt-1">Auto-saves when you click away</p>
              </div>
            </TabsContent>

            <TabsContent value="activity" className="mt-4 text-sm text-muted-foreground">
              <p>Joined as member · {format(new Date(), 'MMM d, yyyy - h:mm a')}</p>
            </TabsContent>

            <TabsContent value="emails" className="mt-4 space-y-2">
              {emails.length === 0 ? (
                <p className="text-sm text-muted-foreground">No emails logged yet.</p>
              ) : (
                emails.map((e, i) => (
                  <div key={i} className="flex gap-3 border border-border rounded-lg p-3">
                    <Mail className="w-4 h-4 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">{e.subject}</p>
                      <p className="text-xs text-muted-foreground">{e.template}</p>
                      <p className="text-xs text-muted-foreground mt-1">{format(new Date(e.created_at), 'MMM d, yyyy')}</p>
                    </div>
                    <span className="text-xs rounded-full px-2 py-0.5 bg-green-500/20 text-green-400 border border-green-500/30">Sent</span>
                  </div>
                ))
              )}
            </TabsContent>

            <TabsContent value="messages" className="mt-4 text-sm text-muted-foreground">
              No messages for this contact.
            </TabsContent>

            <TabsContent value="payments" className="mt-4 space-y-2">
              {payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No payments found.</p>
              ) : (
                payments.map((p, i) => (
                  <div key={i} className="flex gap-3 border border-border rounded-lg p-3 items-center">
                    <DollarSign className="w-4 h-4" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{p.description || 'Payment'}</p>
                      <p className="text-xs text-muted-foreground">{p.created_at ? format(new Date(p.created_at), 'MMM d, yyyy') : '—'}</p>
                    </div>
                    <p className="font-medium">${(p.amount / 100).toFixed(2)}</p>
                    <span className="text-xs rounded-full px-2 py-0.5 bg-green-500/20 text-green-400 border border-green-500/30">Succeeded</span>
                  </div>
                ))
              )}
            </TabsContent>

            <TabsContent value="settings" className="mt-4 space-y-6">
              {isMember ? (
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold">Member Settings</h3>
                  <div>
                    <Label>Email</Label>
                    <Input value={email} readOnly className="bg-muted/40" />
                  </div>
                  <div>
                    <Label>Full Name</Label>
                    <Input defaultValue={name ?? ''} />
                  </div>
                  <p className="text-xs text-muted-foreground">Subscription, admin access, and billing are managed from the CRM and member admin tools.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold">Contact Settings</h3>
                  <div><Label>Name</Label><Input defaultValue={String(contactRow?.full_name ?? '')} /></div>
                  <div><Label>Email</Label><Input defaultValue={email} /></div>
                  <div><Label>Phone</Label><Input defaultValue={String(contactRow?.phone ?? '')} /></div>
                  <div><Label>Company</Label><Input defaultValue={String(contactRow?.company ?? '')} /></div>
                  <div><Label>Notes</Label><Textarea rows={3} defaultValue={String(contactRow?.notes ?? '')} /></div>
                  <div className="border border-destructive/40 rounded-lg p-4 space-y-2">
                    <p className="text-sm font-medium text-destructive">Danger Zone</p>
                    <Button variant="destructive" size="sm" type="button">Delete Contact</Button>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
