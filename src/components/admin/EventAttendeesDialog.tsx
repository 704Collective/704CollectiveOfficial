'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, CheckCircle2, Clock } from 'lucide-react';

interface AttendeeRow {
  id: string;
  source: 'ticket' | 'public_rsvp';
  full_name: string;
  email: string;
  avatar_url: string | null;
  checked_in_at: string | null;
}

interface EventAttendeesDialogProps {
  eventId: string | null;
  eventTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EventAttendeesDialog({ eventId, eventTitle, open, onOpenChange }: EventAttendeesDialogProps) {
  const [attendees, setAttendees] = useState<AttendeeRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !eventId) return;

    let cancelled = false;
    setLoading(true);
    setAttendees([]);

    (async () => {
      const [ticketsResult, publicRsvpsResult] = await Promise.all([
        supabase
          .from('tickets')
          .select('id, user_id, checked_in_at, ticket_type, guest_email, guest_name, profiles!tickets_user_id_fkey ( id, email, full_name, avatar_url )')
          .eq('event_id', eventId)
          .in('status', ['confirmed', 'rsvp']),
        supabase
          .from('event_public_rsvps')
          .select('id, first_name, last_name, email, phone, checked_in_at, status')
          .eq('event_id', eventId)
          .eq('status', 'rsvp'),
      ]);

      if (cancelled) return;

      const ticketAttendees: AttendeeRow[] = (ticketsResult.data || []).map((t: any) => ({
        id: t.id,
        source: 'ticket' as const,
        full_name: t.profiles?.full_name || t.guest_name || 'Unknown',
        email: t.profiles?.email || t.guest_email || '',
        avatar_url: t.profiles?.avatar_url || null,
        checked_in_at: t.checked_in_at,
      }));

      const publicRsvpAttendees: AttendeeRow[] = (publicRsvpsResult.data || []).map((r: any) => ({
        id: r.id,
        source: 'public_rsvp' as const,
        full_name: `${r.first_name} ${r.last_name}`.trim(),
        email: r.email,
        avatar_url: null,
        checked_in_at: r.checked_in_at,
      }));

      const merged = [...ticketAttendees, ...publicRsvpAttendees].sort((a, b) =>
        (a.full_name || '').localeCompare(b.full_name || '')
      );

      setAttendees(merged);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [open, eventId]);

  const totalCount = attendees.length;
  const checkedInCount = attendees.filter(a => a.checked_in_at).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-lg mx-4 sm:mx-auto">
        <DialogHeader>
          <DialogTitle className="pr-6">Attendees — {eventTitle}</DialogTitle>
          <DialogDescription>
            {loading ? 'Loading…' : `${totalCount} attendee${totalCount !== 1 ? 's' : ''} · ${checkedInCount} checked in`}
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto" style={{ maxHeight: '60vh' }}>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : attendees.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-muted-foreground">No attendees yet.</p>
            </div>
          ) : (
            <div className="space-y-1 py-1">
              {attendees.map(attendee => {
                const initials = (attendee.full_name || '?').charAt(0).toUpperCase();
                const isCheckedIn = !!attendee.checked_in_at;
                return (
                  <div
                    key={`${attendee.source}-${attendee.id}`}
                    className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/50 transition-colors"
                  >
                    {/* Avatar */}
                    <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0 text-sm font-semibold text-foreground">
                      {attendee.avatar_url ? (
                        <img src={attendee.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" />
                      ) : (
                        initials
                      )}
                    </div>

                    {/* Name + email */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium truncate">{attendee.full_name}</span>
                        {attendee.source === 'public_rsvp' && (
                          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
                            Public RSVP
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{attendee.email}</p>
                    </div>

                    {/* Check-in status */}
                    <div className="shrink-0 flex items-center gap-1 text-xs">
                      {isCheckedIn ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                          <span className="text-green-500 hidden sm:inline">Checked in</span>
                        </>
                      ) : (
                        <>
                          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-muted-foreground hidden sm:inline">Not yet</span>
                        </>
                      )}
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
