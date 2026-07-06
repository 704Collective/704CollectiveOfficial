'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Loader2, CheckCircle2, Clock, UserCheck, Check, Trash2 } from 'lucide-react';

interface AttendeeRow {
  id: string; // attendance_credentials id
  kind: 'member' | 'guest' | 'public';
  full_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  checked_in_at: string | null;
  rsvp_date: string | null;
  contact_route_id: string | null;
  has_payment: boolean;
}

interface EventAttendeesDialogProps {
  eventId: string | null;
  eventTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  adminId: string | null;
}

export function EventAttendeesDialog({
  eventId,
  eventTitle,
  open,
  onOpenChange,
  adminId,
}: EventAttendeesDialogProps) {
  const router = useRouter();
  const [attendees, setAttendees] = useState<AttendeeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkChecking, setBulkChecking] = useState(false);
  const [bulkRemoving, setBulkRemoving] = useState(false);

  const fetchAttendees = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    setAttendees([]);
    setSelected(new Set());

    // Canonical roster: attendance_credentials (replaces tickets + event_public_rsvps).
    const { data: creds, error: credErr } = await supabase
      .from('attendance_credentials')
      .select('id, person_id, credential_type, status, checked_in_at, created_at, metadata')
      .eq('event_id', eventId)
      .in('status', ['active', 'used']);

    if (credErr || !creds) {
      setAttendees([]);
      setLoading(false);
      return;
    }

    // Resolve names/emails via people.
    const personIds = [...new Set(creds.map(c => c.person_id).filter(Boolean))];
    const peopleById: Record<string, { full_name: string | null; email: string | null }> = {};
    if (personIds.length > 0) {
      const { data: people } = await supabase
        .from('people')
        .select('id, full_name, email')
        .in('id', personIds);
      for (const p of (people || [])) peopleById[p.id] = { full_name: p.full_name, email: p.email };
    }

    // Avatars/phones come from profiles, matched on lower-cased email.
    const emails = [...new Set(
      Object.values(peopleById).map(p => p.email).filter(Boolean) as string[]
    )];
    const profileByEmail: Record<string, { id: string; avatar_url: string | null; phone: string | null }> = {};
    if (emails.length > 0) {
      const lookupEmails = [...new Set([...emails, ...emails.map(e => e.toLowerCase())])];
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, email, avatar_url, phone')
        .in('email', lookupEmails);
      for (const p of (profs || [])) {
        if (p.email) profileByEmail[p.email.toLowerCase()] = { id: p.id, avatar_url: p.avatar_url, phone: p.phone };
      }
    }

    const merged: AttendeeRow[] = creds.map(c => {
      const person = peopleById[c.person_id];
      const prof = person?.email ? profileByEmail[person.email.toLowerCase()] : undefined;
      const kind: AttendeeRow['kind'] =
        c.credential_type === 'member' || c.credential_type === 'member_rsvp' ? 'member'
        : c.credential_type === 'guest_pass' ? 'guest'
        : 'public';
      return {
        id: c.id,
        kind,
        full_name: person?.full_name || 'Unknown',
        email: person?.email || '',
        phone: prof?.phone ?? null,
        avatar_url: prof?.avatar_url ?? null,
        checked_in_at: c.checked_in_at,
        rsvp_date: c.created_at,
        contact_route_id: prof ? encodeURIComponent('profiles:' + prof.id) : null,
        has_payment: !!(c.metadata as Record<string, unknown> | null)?.stripe_payment_id,
      };
    }).sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));

    setAttendees(merged);
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    if (!open || !eventId) return;
    void fetchAttendees();
  }, [open, eventId, fetchAttendees]);

  useEffect(() => {
    if (!open) setSelected(new Set());
  }, [open]);

  const selKey = (a: AttendeeRow) => a.id;

  const toggleSelect = (a: AttendeeRow, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelected(prev => {
      const next = new Set(prev);
      const k = selKey(a);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });
  };

  const handleRowClick = (a: AttendeeRow) => {
    if (!a.contact_route_id) return;
    onOpenChange(false);
    router.push('/admin/contacts/' + a.contact_route_id);
  };

  const handleBulkCheckIn = async () => {
    if (selected.size === 0) return;
    setBulkChecking(true);
    const now = new Date().toISOString();
    try {
      // Stamp the canonical attendance_credentials rows (selected keys are credential ids).
      const ids = [...selected];
      const updates = ids.map(id =>
        supabase
          .from('attendance_credentials')
          .update({ checked_in_at: now, status: 'used' })
          .eq('id', id),
      );
      const results = await Promise.all(updates);
      const errorCount = results.filter(r => r.error).length;

      // checked_in_by expects a people id; adminId is an auth user id.
      // Best-effort, mirroring CheckInFullScreen - check-ins already recorded above.
      if (adminId) {
        try {
          const { data: adminPerson } = await supabase
            .from('people')
            .select('id')
            .filter('metadata->>profile_id', 'eq', adminId)
            .maybeSingle();
          if (adminPerson) {
            await supabase
              .from('attendance_credentials')
              .update({ checked_in_by: adminPerson.id })
              .in('id', ids);
          }
        } catch {
          // non-fatal
        }
      }
      if (errorCount > 0) {
        toast.error(errorCount + ' check-in(s) failed');
      } else {
        toast.success('Checked in ' + selected.size + ' attendee' + (selected.size !== 1 ? 's' : ''));
      }
      setSelected(new Set());
      await fetchAttendees();
    } catch {
      toast.error('Bulk check-in failed');
    } finally {
      setBulkChecking(false);
    }
  };

  const handleBulkRemoveRefund = async () => {
    if (selected.size === 0) return;
    const confirmed = window.confirm(
      `Remove ${selected.size} attendee(s)? Paid tickets will be refunded via Stripe. This cannot be undone.`,
    );
    if (!confirmed) return;

    setBulkRemoving(true);
    try {
      let okCount = 0;
      let refundedCount = 0;
      for (const credentialId of selected) {
        const { data, error } = await supabase.functions.invoke('admin-refund-ticket', {
          body: { credential_id: credentialId },
        });
        if (error || data?.error) {
          let message: string = data?.error || error?.message || 'Unknown error';
          // Non-2xx responses surface as FunctionsHttpError; the real message is in the body.
          if (error && typeof error === 'object' && 'context' in error) {
            try {
              const body = await (error as { context: Response }).context.json();
              if (body?.error) message = body.error;
            } catch { /* keep fallback message */ }
          }
          const attendee = attendees.find(a => a.id === credentialId);
          const who = attendee?.full_name || credentialId;
          toast.error(`Failed to remove ${who}: ${message}`);
          continue;
        }
        okCount += 1;
        if (data?.refunded) refundedCount += 1;
      }
      if (okCount > 0) {
        toast.success(`${okCount} removed (${refundedCount} refunded)`);
      }
      setSelected(new Set());
      await fetchAttendees();
    } catch {
      toast.error('Remove & refund failed');
    } finally {
      setBulkRemoving(false);
    }
  };

  const totalCount = attendees.length;
  const checkedInCount = attendees.filter(a => a.checked_in_at).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[480px] max-h-[85vh] p-0 gap-0 flex flex-col">

        {/* Header */}
        <DialogHeader className="flex-shrink-0 px-6 pt-5 pb-4 border-b border-border">
          <DialogTitle className="pr-6 text-base truncate line-clamp-1">
            Attendees - {eventTitle}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
              {loading ? (
                <span>Loading&hellip;</span>
              ) : (
                <>
                  <span>{totalCount} RSVPs</span>
                  <span className="opacity-40">&middot;</span>
                  <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
                  <span>{checkedInCount} / {totalCount} checked in</span>
                </>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>

        {/* Bulk action bar */}
        {selected.size > 0 && (
          <div className="flex-shrink-0 flex flex-wrap items-center justify-end gap-3 px-6 py-3 bg-amber-500/10 border-b border-amber-500/20">
            <span className="mr-auto text-sm text-amber-400 font-medium">
              {selected.size} selected
            </span>
            <Button
              size="sm"
              className="bg-amber-500 hover:bg-amber-400 text-black font-semibold h-8 px-3 text-xs gap-1.5"
              onClick={handleBulkCheckIn}
              disabled={bulkChecking || bulkRemoving}
            >
              {bulkChecking ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <UserCheck className="w-3.5 h-3.5" />
              )}
              <span className="sm:hidden">Check in {selected.size}</span>
              <span className="hidden sm:inline">Check in {selected.size} attendee{selected.size !== 1 ? 's' : ''}</span>
            </Button>
            <Button
              size="sm"
              className="bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/30 font-semibold h-8 px-3 text-xs gap-1.5"
              onClick={handleBulkRemoveRefund}
              disabled={bulkChecking || bulkRemoving}
            >
              {bulkRemoving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
              Remove &amp; Refund
            </Button>
          </div>
        )}

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : attendees.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <p className="text-sm text-muted-foreground">No attendees yet.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {attendees.map(attendee => {
                const initials = (attendee.full_name || '?').charAt(0).toUpperCase();
                const isCheckedIn = !!attendee.checked_in_at;
                const key = selKey(attendee);
                const isSelected = selected.has(key);
                const clickable = !!attendee.contact_route_id;

                return (
                  <div
                    key={key}
                    className={[
                      'flex items-center gap-3 px-4 py-3 transition-colors',
                      clickable ? 'cursor-pointer hover:bg-muted/50' : '',
                      isSelected ? 'bg-muted/30' : '',
                    ].join(' ')}
                    onClick={() => handleRowClick(attendee)}
                  >
                    {/* Circular checkbox */}
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={isSelected}
                      onClick={e => toggleSelect(attendee, e)}
                      className={[
                        'w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors',
                        isSelected
                          ? 'bg-amber-500 border-amber-500'
                          : 'border-muted-foreground/40 hover:border-muted-foreground',
                      ].join(' ')}
                    >
                      {isSelected && <Check className="w-3 h-3 text-black" />}
                    </button>

                    {/* Avatar */}
                    <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0 text-sm font-semibold text-foreground overflow-hidden">
                      {attendee.avatar_url ? (
                        <img src={attendee.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" />
                      ) : (
                        initials
                      )}
                    </div>

                    {/* Name / phone / email */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-medium truncate">{attendee.full_name}</span>
                        {attendee.kind === 'member' ? (
                          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-background text-foreground border border-border">
                            Member
                          </span>
                        ) : attendee.kind === 'guest' ? (
                          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                            Guest
                          </span>
                        ) : (
                          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-400 text-black">
                            Public RSVP
                          </span>
                        )}
                      </div>
                      {attendee.phone && (
                        <p className="text-xs text-amber-400 truncate mt-0.5">{attendee.phone}</p>
                      )}
                      <p className="text-xs text-muted-foreground truncate">{attendee.email}</p>
                    </div>

                    {/* Date + check-in status stacked */}
                    <div className="shrink-0 flex flex-col items-end gap-0.5 min-w-[72px]">
                      {attendee.rsvp_date && (
                        <span className="text-[10px] text-muted-foreground/50 leading-none">
                          {format(new Date(attendee.rsvp_date), 'MMM d')}
                        </span>
                      )}
                      <div className="flex items-center gap-1 text-xs">
                        {isCheckedIn ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                            <span className="text-green-500 whitespace-nowrap">Checked in</span>
                          </>
                        ) : (
                          <>
                            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-muted-foreground whitespace-nowrap">Not yet</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
