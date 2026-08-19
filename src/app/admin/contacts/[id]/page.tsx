'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Calendar, Gift, Mail, DollarSign, MapPin, Trash2 } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { parseContactRouteId } from '@/lib/admin/unified-contacts';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { AdminMemberBillingCard } from '@/components/admin/AdminMemberBillingCard';
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

interface ContactNoteRow {
  id: string;
  contact_id: string;
  author_id: string;
  content: string;
  created_at: string;
  author_name?: string | null;
  author_email?: string | null;
  author_avatar?: string | null;
}

interface AttendedEventRow {
  id: string;
  source: 'ticket' | 'public_rsvp';
  event_id: string;
  event_title: string;
  event_date: string | null;
  rsvp_date: string | null;
  checked_in_at: string | null;
  type: string | null;
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
  const { isSuperAdmin } = useAuth();
  const raw = typeof params.id === 'string' ? params.id : '';
  const parsed = useMemo(() => parseContactRouteId(raw), [raw]);

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [contactRow, setContactRow] = useState<Record<string, unknown> | null>(null);
  const [emails, setEmails] = useState<{ subject: string; template: string; created_at: string }[]>([]);
  const [payments, setPayments] = useState<{ description: string | null; amount: number; created_at: string | null; status: string }[]>([]);
  const [guestPassEvents, setGuestPassEvents] = useState<GuestPassEventRow[]>([]);

  // Resolved cross-table ids (so notes/events/settings can target the correct rows
  // regardless of whether the route is profiles:{id} or contacts:{id})
  const [resolvedContactId, setResolvedContactId] = useState<string | null>(null);
  const [resolvedProfileId, setResolvedProfileId] = useState<string | null>(null);

  // Current admin (for "You" comparison + author_id stamping on new notes)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Notes (contact_notes table)
  const [notesList, setNotesList] = useState<ContactNoteRow[]>([]);
  const [newNoteText, setNewNoteText] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);

  // Events attended (canonical attendance_credentials via the people layer)
  const [eventsAttended, setEventsAttended] = useState<AttendedEventRow[]>([]);

  // Settings form (controlled inputs + save)
  const [settingsForm, setSettingsForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    company: '',
  });
  const [savingSettings, setSavingSettings] = useState(false);

  // Email modal state
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [welcomeTemplate, setWelcomeTemplate] = useState<'welcome-new' | 'welcome-back'>('welcome-new');
  const [customSubject, setCustomSubject] = useState('');
  const [customBody, setCustomBody] = useState('');

  // Manual membership override state
  const [peopleRow, setPeopleRow] = useState<{ id: string; member_tier: string | null; member_status: string | null; override_paying: boolean | null; phone: string | null; full_name: string | null } | null>(null);
  const [overrideTier, setOverrideTier] = useState<string>('');
  const [overrideStatus, setOverrideStatus] = useState<string>('');
  const [overridePaying, setOverridePaying] = useState<boolean>(false);
  const [overridePhone, setOverridePhone] = useState<string>('');
  const [overrideSendEmail, setOverrideSendEmail] = useState<boolean>(false);
  const [overrideSaving, setOverrideSaving] = useState(false);
  const [overrideResult, setOverrideResult] = useState<string | null>(null);

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
        setResolvedProfileId(parsed.id);
        // Resolve linked contact id (if any) so notes + public RSVPs can be loaded
        const { data: linkedContact } = await supabase
          .from('contacts')
          .select('id')
          .eq('converted_to_member_id', parsed.id)
          .maybeSingle();
        setResolvedContactId((linkedContact as { id?: string } | null)?.id ?? null);
        if (isSuperAdmin) {
          const { data: pay } = await supabase
            .from('payments')
            .select('description, amount, created_at, status')
            .eq('user_id', parsed.id)
            .order('created_at', { ascending: false })
            .limit(20);
          setPayments((pay ?? []) as never);
        } else {
          setPayments([]);
        }
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
        setResolvedContactId(parsed.id);
        setResolvedProfileId((data as { converted_to_member_id?: string } | null)?.converted_to_member_id ?? null);
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
                  let eventTitle = '-';
                  let eventDate = '';
                  let inviterName = '-';

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
      // Load the canonical `people` row by email for the override panel
      // email-only by design: a contact may have no auth user
      const lookupEmail = parsed.table === 'profiles'
        ? ((await supabase.from('profiles').select('email').eq('id', parsed.id).maybeSingle()).data?.email ?? null)
        : ((await supabase.from('contacts').select('email').eq('id', parsed.id).maybeSingle()).data?.email ?? null);
      if (lookupEmail) {
        const { data: pplRow } = await supabase
          .from('people')
          .select('id, member_tier, member_status, override_paying, phone, full_name')
          .ilike('email', lookupEmail)
          .maybeSingle();
        if (pplRow) {
          const row = pplRow as { id: string; member_tier: string | null; member_status: string | null; override_paying: boolean | null; phone: string | null; full_name: string | null };
          setPeopleRow(row);
          setOverrideTier(row.member_tier ?? '');
          setOverrideStatus(row.member_status ?? '');
          setOverridePaying(row.override_paying ?? false);
          setOverridePhone(row.phone ?? '');
        } else {
          setPeopleRow(null);
          setOverrideTier('');
          setOverrideStatus('');
          setOverridePaying(false);
          setOverridePhone('');
        }
        // Default send_setup_email to ON if there's no profile row yet (orphan activation)
        const { data: existingProf } = await supabase
          .from('profiles')
          .select('id')
          .ilike('email', lookupEmail)
          .maybeSingle();
        setOverrideSendEmail(!existingProf);
      }
    } catch (e) {
      console.error(e);
      toast.error('Failed to load contact');
    } finally {
      setLoading(false);
    }
  }, [raw, isSuperAdmin]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setCurrentUserId(data.user?.id ?? null);
    });
    return () => { cancelled = true; };
  }, []);

  // ----- Notes (contact_notes) -----
  const loadNotes = useCallback(async () => {
    if (!resolvedContactId) {
      setNotesList([]);
      return;
    }
    const { data: rows, error } = await supabase
      .from('contact_notes')
      .select('id, contact_id, author_id, content, created_at')
      .eq('contact_id', resolvedContactId)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[contact_notes] load failed', error);
      setNotesList([]);
      return;
    }
    const authorIds = Array.from(
      new Set((rows ?? []).map((r) => (r as { author_id: string }).author_id).filter(Boolean))
    );
    const authorMap: Record<string, { full_name: string | null; email: string | null; avatar_url: string | null }> = {};
    if (authorIds.length > 0) {
      // author_id FKs auth.users; profiles.id == auth.users.id, so this works as a manual join
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url')
        .in('id', authorIds);
      (profs ?? []).forEach((p) => {
        const row = p as { id: string; full_name: string | null; email: string | null; avatar_url: string | null };
        authorMap[row.id] = { full_name: row.full_name, email: row.email, avatar_url: row.avatar_url };
      });
    }
    setNotesList(
      (rows ?? []).map((r) => {
        const row = r as { id: string; contact_id: string; author_id: string; content: string; created_at: string };
        const author = authorMap[row.author_id];
        return {
          id: row.id,
          contact_id: row.contact_id,
          author_id: row.author_id,
          content: row.content,
          created_at: row.created_at,
          author_name: author?.full_name ?? null,
          author_email: author?.email ?? null,
          author_avatar: author?.avatar_url ?? null,
        };
      })
    );
  }, [resolvedContactId]);

  const addNote = async () => {
    const text = newNoteText.trim();
    if (!text) return;
    if (!resolvedContactId) {
      toast.error('Cannot add a note: no linked contact record for this profile.');
      return;
    }
    if (!currentUserId) {
      toast.error('Not signed in');
      return;
    }
    setAddingNote(true);
    const { error } = await supabase.from('contact_notes').insert({
      contact_id: resolvedContactId,
      author_id: currentUserId,
      content: text,
    });
    setAddingNote(false);
    if (error) {
      toast.error(error.message || 'Failed to add note');
      return;
    }
    setNewNoteText('');
    void loadNotes();
  };

  const deleteNote = async (noteId: string) => {
    setDeletingNoteId(noteId);
    const { error } = await supabase.from('contact_notes').delete().eq('id', noteId);
    setDeletingNoteId(null);
    if (error) {
      toast.error(error.message || 'Failed to delete note');
      return;
    }
    setNotesList((prev) => prev.filter((n) => n.id !== noteId));
  };

  useEffect(() => { void loadNotes(); }, [loadNotes]);

  // ----- Events Attended (canonical attendance_credentials via people) -----
  const loadEventsAttended = useCallback(async () => {
    // Contact's primary email wins when both a contact and a profile exist.
    const email = ((contactRow?.email ?? profile?.email) as string | undefined)?.trim().toLowerCase();
    if (!email) {
      setEventsAttended([]);
      return;
    }

    const { data: personRows } = await supabase
      .from('people')
      .select('id')
      .eq('email_lower', email)
      .limit(1);
    const person = personRows?.[0];
    if (!person) {
      setEventsAttended([]);
      return;
    }

    const { data: creds } = await supabase
      .from('attendance_credentials')
      .select('id, event_id, credential_type, status, checked_in_at, created_at, events(id, title, start_time)')
      .eq('person_id', person.id)
      .in('status', ['active', 'used']);

    type CredRow = { id: string; event_id: string; credential_type: string | null; status: string; checked_in_at: string | null; created_at: string; events: { id: string; title: string; start_time: string } | null };

    const all: AttendedEventRow[] = ((creds ?? []) as unknown as CredRow[])
      .map((c) => ({
        id: c.id,
        source: (c.credential_type === 'public_rsvp' ? 'public_rsvp' : 'ticket') as AttendedEventRow['source'],
        event_id: c.event_id,
        event_title: c.events?.title ?? 'Unknown event',
        event_date: c.events?.start_time ?? null,
        rsvp_date: c.created_at,
        checked_in_at: c.checked_in_at,
        type: c.credential_type ?? null,
      }))
      .sort((a, b) => new Date(b.event_date || 0).getTime() - new Date(a.event_date || 0).getTime());
    setEventsAttended(all);
  }, [profile, contactRow]);

  useEffect(() => { void loadEventsAttended(); }, [loadEventsAttended]);

  // ----- Settings form (controlled state) -----
  useEffect(() => {
    const source = (profile ?? contactRow) as
      | { full_name?: string | null; email?: string | null; phone?: string | null; company?: string | null }
      | null;
    if (!source) return;
    setSettingsForm({
      full_name: source.full_name ?? '',
      email: source.email ?? '',
      phone: source.phone ?? '',
      company: source.company ?? '',
    });
  }, [profile, contactRow]);

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    let contactErr: { message: string } | null = null;
    let profileErr: { message: string } | null = null;

    if (resolvedContactId) {
      const { error } = await supabase
        .from('contacts')
        .update({
          full_name: settingsForm.full_name,
          email: settingsForm.email,
          phone: settingsForm.phone,
          company: settingsForm.company,
          updated_at: new Date().toISOString(),
        })
        .eq('id', resolvedContactId);
      contactErr = error;
    }

    if (resolvedProfileId) {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: settingsForm.full_name,
          email: settingsForm.email,
          phone: settingsForm.phone,
        })
        .eq('id', resolvedProfileId);
      profileErr = error;
    }

    setSavingSettings(false);
    if (contactErr || profileErr) {
      toast.error(contactErr?.message || profileErr?.message || 'Failed to save changes');
      return;
    }
    toast.success('Saved');
    void load();
  };

  const handleSaveOverride = async () => {
    setOverrideSaving(true);
    setOverrideResult(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) throw new Error('Not authenticated');

      const targetEmail = (profile?.email ?? contactRow?.email) as string | undefined;
      const targetName = (profile?.full_name ?? contactRow?.full_name ?? null) as string | null;
      if (!targetEmail) throw new Error('No email found on this contact');

      const payload = {
        email: targetEmail,
        full_name: targetName,
        member_tier: overrideTier || null,
        member_status: overrideStatus || null,
        override_paying: overridePaying,
        phone: overridePhone || null,
        send_setup_email: overrideSendEmail,
      };

      const res = await supabase.functions.invoke('admin-manual-membership-override', { body: payload });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);

      const changes = (res.data?.changes ?? []) as string[];
      const summary = changes.length > 0 ? changes.join(' · ') : 'No changes made';
      setOverrideResult(summary);
      toast.success('Override applied');
      void load();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to apply override';
      setOverrideResult(`ERROR: ${msg}`);
      toast.error(msg);
    } finally {
      setOverrideSaving(false);
    }
  };

  const handleSendEmail = async (mode: 'welcome' | 'custom') => {
    setEmailSending(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const recipientEmail = String(row?.email ?? '');
      const recipientName = String(profile?.full_name || contactRow?.full_name || recipientEmail || 'there');
      const recipientUserId = profile?.id as string | undefined;

      let payload: Record<string, unknown>;
      if (mode === 'welcome') {
        payload = {
          recipient_email: recipientEmail,
          recipient_name: recipientName,
          template: welcomeTemplate,
          recipient_user_id: recipientUserId,
        };
      } else {
        payload = {
          recipient_email: recipientEmail,
          recipient_name: recipientName,
          template: 'admin-custom',
          subject: customSubject.trim(),
          body_text: customBody.trim(),
        };
      }

      const res = await fetch('/api/admin/send-user-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json() as { error?: string };
      if (!res.ok) throw new Error(json.error || 'Failed to send email');

      toast.success('Email sent');
      setEmailModalOpen(false);
      setCustomSubject('');
      setCustomBody('');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to send email');
    } finally {
      setEmailSending(false);
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
                  <p className="font-semibold">{name || '-'}</p>
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
              <Button variant="outline" size="sm" onClick={() => setEmailModalOpen(true)}>
                <Mail className="w-4 h-4 mr-1.5" />
                Send Email
              </Button>
            </CardContent>
          </Card>

          <Tabs defaultValue="overview">
            <TabsList className="flex flex-wrap h-auto gap-1 bg-muted/40 p-1">
              {(['Overview', 'Activity', 'Emails', 'Messages', 'Payments', 'Settings'] as const)
                .filter(t => t !== 'Payments' || isSuperAdmin)
                .map((t) => (
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
                    <p className="text-3xl font-bold text-foreground">{eventsAttended.length}</p>
                    <p className="text-xs text-muted-foreground mt-1">{eventsAttended.length} total RSVPs</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-5 space-y-2 text-sm">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground/70 mb-2">Membership Info</p>
                    <div className="flex justify-between gap-2"><span className="text-muted-foreground">Type</span><span className="font-medium">{(row as { member_type?: string }).member_type || '-'}</span></div>
                    <div className="flex justify-between gap-2"><span className="text-muted-foreground">Since</span><span className="font-medium">{(row as { member_since?: string }).member_since ? format(new Date((row as { member_since?: string }).member_since!), 'MMM d, yyyy') : '-'}</span></div>
                    <div className="flex justify-between gap-2"><span className="text-muted-foreground">Manual Override</span><span className="font-medium">{(row as { membership_override?: boolean }).membership_override ? 'Yes' : 'No'}</span></div>
                    <div className="flex justify-between gap-2"><span className="text-muted-foreground">Phone</span><span className="font-medium">{(row as { phone?: string }).phone || '-'}</span></div>
                  </CardContent>
                </Card>
                {isMember && (
                  <AdminMemberBillingCard
                    profileId={typeof profile?.id === 'string' ? profile.id : null}
                    isSuperAdmin={isSuperAdmin}
                  />
                )}
                <Card>
                  <CardContent className="p-5 space-y-2 text-sm">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground/70 mb-2">Portal Status</p>
                    <div className="flex justify-between gap-2"><span className="text-muted-foreground">Account Created</span><span className="font-medium">{isMember ? 'Yes' : 'No'}</span></div>
                    <div className="flex justify-between gap-2"><span className="text-muted-foreground">Last Login</span><span className="font-medium">-</span></div>
                    <div className="flex justify-between gap-2"><span className="text-muted-foreground">Source</span><span className="font-medium capitalize">{(row as { source?: string }).source?.replace(/_/g, ' ') || '-'}</span></div>
                    <div className="flex justify-between gap-2"><span className="text-muted-foreground">Source Detail</span><span className="font-medium capitalize">{(row as { source_detail?: string }).source_detail?.replace(/_/g, ' ') || '-'}</span></div>
                    <div className="flex justify-between gap-2"><span className="text-muted-foreground">Created</span><span className="font-medium">{(row as { created_at?: string }).created_at ? format(new Date((row as { created_at?: string }).created_at!), 'MMM d, yyyy') : '-'}</span></div>
                  </CardContent>
                </Card>

                {/* Lead Sources - guest pass event tracking */}
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
                    <p className="text-lg font-semibold">{guestPassEvents.length > 0 ? guestPassEvents.length : '-'}</p>
                    {guestPassEvents.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">event{guestPassEvents.length !== 1 ? 's' : ''} sourced via guest pass</p>
                    )}
                  </CardContent>
                </Card>
              </div>
              <Card>
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground/70">Admin Notes</p>
                    <span className="text-xs text-muted-foreground">{notesList.length} note{notesList.length === 1 ? '' : 's'}</span>
                  </div>

                  {!resolvedContactId ? (
                    <p className="text-sm text-muted-foreground">
                      No linked contact record. Notes are stored against the contact row - link this profile to a contact to start tracking notes.
                    </p>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <Textarea
                          rows={3}
                          placeholder="Add a note about this contact..."
                          value={newNoteText}
                          onChange={(e) => setNewNoteText(e.target.value)}
                          disabled={addingNote}
                        />
                        <div className="flex justify-end">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => { void addNote(); }}
                            disabled={addingNote || !newNoteText.trim()}
                            className="bg-amber-500 hover:bg-amber-600 text-black"
                          >
                            {addingNote ? 'Adding...' : 'Add Note'}
                          </Button>
                        </div>
                      </div>

                      <div className="border-t border-border pt-4 space-y-3">
                        {notesList.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No notes yet.</p>
                        ) : (
                          notesList.map((n) => {
                            const isMine = currentUserId && n.author_id === currentUserId;
                            const displayName = isMine
                              ? 'You'
                              : (n.author_name || n.author_email || 'Unknown user');
                            const initialsSource = n.author_name || n.author_email || '?';
                            return (
                              <div key={n.id} className="flex gap-3 border border-border rounded-lg p-3">
                                {n.author_avatar ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={n.author_avatar}
                                    alt={displayName}
                                    className="w-8 h-8 rounded-full object-cover shrink-0"
                                  />
                                ) : (
                                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0 ${avatarColor(n.author_email || n.author_id)}`}>
                                    {initials(n.author_name ?? null, initialsSource)}
                                  </div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className="text-sm font-medium truncate">{displayName}</span>
                                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                                      </span>
                                    </div>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => { void deleteNote(n.id); }}
                                      disabled={deletingNoteId === n.id}
                                      className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                                    >
                                      <Trash2 className="w-3.5 h-3.5 mr-1" />
                                      {deletingNoteId === n.id ? 'Deleting...' : 'Delete'}
                                    </Button>
                                  </div>
                                  <p className="text-sm whitespace-pre-wrap break-words mt-1">{n.content}</p>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
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

            {isSuperAdmin && (
              <TabsContent value="payments" className="mt-4 space-y-2">
                {payments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No payments found.</p>
                ) : (
                  payments.map((p, i) => (
                    <div key={i} className="flex gap-3 border border-border rounded-lg p-3 items-center">
                      <DollarSign className="w-4 h-4" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{p.description || 'Payment'}</p>
                        <p className="text-xs text-muted-foreground">{p.created_at ? format(new Date(p.created_at), 'MMM d, yyyy') : '-'}</p>
                      </div>
                      <p className="font-medium">${(p.amount / 100).toFixed(2)}</p>
                      <span className="text-xs rounded-full px-2 py-0.5 bg-green-500/20 text-green-400 border border-green-500/30">Succeeded</span>
                    </div>
                  ))
                )}
              </TabsContent>
            )}

            <TabsContent value="settings" className="mt-4 space-y-6">
              {isSuperAdmin && (
                <Card className="border-amber-500/40">
                  <CardContent className="p-5 space-y-4">
                    <div>
                      <h3 className="text-sm font-semibold text-amber-400">Manual Membership Override</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        Super admin only. Toggles `people.member_tier` / `member_status` / `override_paying`. For orphan rows (no auth account), saving with status=active creates the account and optionally sends a password setup email.
                      </p>
                      {!peopleRow && (
                        <p className="text-xs text-amber-400 mt-2">
                          No `people` row exists for this contact yet. Saving will create one.
                        </p>
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <Label>Member Tier</Label>
                        <Select value={overrideTier || '__none'} onValueChange={(v) => setOverrideTier(v === '__none' ? '' : v)}>
                          <SelectTrigger><SelectValue placeholder="(no change)" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none">(unset)</SelectItem>
                            <SelectItem value="social">Social</SelectItem>
                            <SelectItem value="business">Business</SelectItem>
                            <SelectItem value="founder">Founder</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Member Status</Label>
                        <Select value={overrideStatus || '__none'} onValueChange={(v) => setOverrideStatus(v === '__none' ? '' : v)}>
                          <SelectTrigger><SelectValue placeholder="(no change)" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none">(unset)</SelectItem>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="canceled">Canceled</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-3 md:col-span-2">
                        <input
                          type="checkbox"
                          id="override-paying"
                          checked={overridePaying}
                          onChange={(e) => setOverridePaying(e.target.checked)}
                          className="w-4 h-4"
                        />
                        <Label htmlFor="override-paying" className="cursor-pointer">Override paying (comp membership — bypasses Stripe check)</Label>
                      </div>
                      <div className="md:col-span-2">
                        <Label>Phone (optional)</Label>
                        <Input value={overridePhone} onChange={(e) => setOverridePhone(e.target.value)} placeholder="704-555-1234" />
                      </div>
                      <div className="flex items-center gap-3 md:col-span-2">
                        <input
                          type="checkbox"
                          id="override-send-email"
                          checked={overrideSendEmail}
                          onChange={(e) => setOverrideSendEmail(e.target.checked)}
                          className="w-4 h-4"
                        />
                        <Label htmlFor="override-send-email" className="cursor-pointer">Send password setup email (only fires if a new auth account is created)</Label>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-2">
                      <p className="text-xs text-muted-foreground">
                        Current people row: {peopleRow ? `tier=${peopleRow.member_tier ?? '∅'} · status=${peopleRow.member_status ?? '∅'} · paying=${peopleRow.override_paying ? 'true' : 'false'}` : 'none'}
                      </p>
                      <Button
                        onClick={() => { void handleSaveOverride(); }}
                        disabled={overrideSaving}
                        className="bg-amber-500 hover:bg-amber-600 text-black"
                      >
                        {overrideSaving ? 'Saving…' : 'Save Override'}
                      </Button>
                    </div>
                    {overrideResult && (
                      <div className={`text-xs p-2 rounded ${overrideResult.startsWith('ERROR') ? 'bg-destructive/20 text-destructive' : 'bg-green-500/10 text-green-400'}`}>
                        {overrideResult}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
              {isMember ? (
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold">Member Settings</h3>
                  <div>
                    <Label>Full Name</Label>
                    <Input
                      value={settingsForm.full_name}
                      onChange={(e) => setSettingsForm({ ...settingsForm, full_name: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={settingsForm.email}
                      onChange={(e) => setSettingsForm({ ...settingsForm, email: e.target.value })}
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">Updating the email here only changes the profile/contact record - the auth login email is unchanged.</p>
                  </div>
                  <div>
                    <Label>Phone</Label>
                    <Input
                      value={settingsForm.phone}
                      onChange={(e) => setSettingsForm({ ...settingsForm, phone: e.target.value })}
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      onClick={() => { void handleSaveSettings(); }}
                      disabled={savingSettings}
                      className="bg-amber-500 hover:bg-amber-600 text-black"
                    >
                      {savingSettings ? 'Saving...' : 'Save Changes'}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Subscription, admin access, and billing are managed from the CRM and member admin tools.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold">Contact Settings</h3>
                  <div>
                    <Label>Name</Label>
                    <Input
                      value={settingsForm.full_name}
                      onChange={(e) => setSettingsForm({ ...settingsForm, full_name: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={settingsForm.email}
                      onChange={(e) => setSettingsForm({ ...settingsForm, email: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Phone</Label>
                    <Input
                      value={settingsForm.phone}
                      onChange={(e) => setSettingsForm({ ...settingsForm, phone: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Company</Label>
                    <Input
                      value={settingsForm.company}
                      onChange={(e) => setSettingsForm({ ...settingsForm, company: e.target.value })}
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      onClick={() => { void handleSaveSettings(); }}
                      disabled={savingSettings}
                      className="bg-amber-500 hover:bg-amber-600 text-black"
                    >
                      {savingSettings ? 'Saving...' : 'Save Changes'}
                    </Button>
                  </div>
                  <div className="border border-destructive/40 rounded-lg p-4 space-y-2">
                    <p className="text-sm font-medium text-destructive">Danger Zone</p>
                    <Button variant="destructive" size="sm" type="button">Delete Contact</Button>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>

          {/* Send Email modal */}
          <Dialog
            open={emailModalOpen}
            onOpenChange={(open) => {
              setEmailModalOpen(open);
              if (!open) { setCustomSubject(''); setCustomBody(''); }
            }}
          >
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Send Email</DialogTitle>
                <DialogDescription>{name || email}</DialogDescription>
              </DialogHeader>

              <Tabs defaultValue="welcome">
                <TabsList className="w-full">
                  <TabsTrigger value="welcome" className="flex-1">Welcome Email</TabsTrigger>
                  <TabsTrigger value="custom" className="flex-1">Custom Email</TabsTrigger>
                </TabsList>

                <TabsContent value="welcome" className="mt-4 space-y-4">
                  {!profile ? (
                    <p className="text-sm text-muted-foreground">Welcome emails can only be sent to members.</p>
                  ) : (
                    <div className="space-y-1.5">
                      <p className="text-sm font-medium">Template</p>
                      <Select
                        value={welcomeTemplate}
                        onValueChange={(v) => setWelcomeTemplate(v as 'welcome-new' | 'welcome-back')}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="welcome-new">Welcome (new member)</SelectItem>
                          <SelectItem value="welcome-back">Welcome Back (reactivated)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <DialogFooter className="gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEmailModalOpen(false)}
                      disabled={emailSending}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => { void handleSendEmail('welcome'); }}
                      disabled={emailSending || !profile}
                      className="bg-amber-500 hover:bg-amber-600 text-black"
                    >
                      {emailSending ? 'Sending...' : 'Send'}
                    </Button>
                  </DialogFooter>
                </TabsContent>

                <TabsContent value="custom" className="mt-4 space-y-4">
                  <div className="space-y-1.5">
                    <p className="text-sm font-medium">Subject</p>
                    <Input
                      value={customSubject}
                      onChange={(e) => setCustomSubject(e.target.value)}
                      placeholder="Email subject"
                      disabled={emailSending}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-sm font-medium">Message</p>
                    <Textarea
                      value={customBody}
                      onChange={(e) => setCustomBody(e.target.value)}
                      placeholder="Type your message..."
                      rows={8}
                      className="resize-none"
                      disabled={emailSending}
                    />
                  </div>
                  <DialogFooter className="gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEmailModalOpen(false)}
                      disabled={emailSending}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => { void handleSendEmail('custom'); }}
                      disabled={emailSending || !customSubject.trim() || !customBody.trim()}
                      className="bg-amber-500 hover:bg-amber-600 text-black"
                    >
                      {emailSending ? 'Sending...' : 'Send'}
                    </Button>
                  </DialogFooter>
                </TabsContent>
              </Tabs>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
