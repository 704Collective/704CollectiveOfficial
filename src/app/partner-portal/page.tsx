'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { format, formatDistanceToNow } from 'date-fns';
import { AlertCircle, Calendar, Mail } from 'lucide-react';
import { SectionErrorBoundary } from '@/components/SectionErrorBoundary';
import { PartnerPortalDashboardSkeleton } from '@/components/dashboard/DashboardLoadingSkeletons';
import { InquiryModal } from '@/components/partner/InquiryModal';
import type { PartnerInquiryType } from '@/app/actions/partnerPortalActions';
import { toast } from 'sonner';

type PartnerApplicationRow = {
  status: string;
  denial_reason: string | null;
};

type InquiryRow = {
  id: string;
  inquiry_type: string;
  status: string;
  created_at: string;
  event_id: string | null;
  events: { title: string } | null;
};

type EventRow = {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  description: string | null;
  image_url: string | null;
  location_name: string | null;
  location_address: string | null;
  open_for_venue_partner: boolean | null;
  open_for_sponsor_inquiry: boolean | null;
  vendor_booth_spots_available: number | null;
};

function statusBadgeClass(s: string) {
  switch (s) {
    case 'approved':
      return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25';
    case 'denied':
      return 'bg-red-500/15 text-red-400 border-red-500/25';
    case 'reviewing':
      return 'bg-amber-500/15 text-amber-400 border-amber-500/25';
    default:
      return 'bg-white/10 text-white/70 border-white/15';
  }
}

function needsVenue(e: EventRow) {
  if (e.open_for_venue_partner != null) return e.open_for_venue_partner;
  return !e.location_name?.trim() && !e.location_address?.trim();
}

export default function PartnerPortalDashboardPage() {
  const { user, profile } = useAuth();
  const p = profile as Record<string, unknown> | null;
  const partnerTypes = (p?.partner_types as string[] | undefined) ?? [];
  const partnerStatus = (p?.partner_status as string) ?? 'pending';
  const partnerApproved = partnerStatus === 'approved';

  const [application, setApplication] = useState<PartnerApplicationRow | null>(null);
  const [inquiries, setInquiries] = useState<InquiryRow[]>([]);
  const [upcoming, setUpcoming] = useState<EventRow[]>([]);
  const [teamUnread, setTeamUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [inquiryOpen, setInquiryOpen] = useState(false);
  const [inquiryType, setInquiryType] = useState<PartnerInquiryType>('new_event');
  const [inquiryEvent, setInquiryEvent] = useState<{ id: string; title: string } | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const { data: app, error: appErr } = await supabase
      .from('partner_applications')
      .select('status, denial_reason')
      .eq('user_id', user.id)
      .order('applied_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (appErr) {
      console.error('[partner-portal] partner_applications', appErr.message);
      toast.error('Could not load your application.');
    }
    setApplication(app as PartnerApplicationRow | null);

    const nowIso = new Date().toISOString();

    if (partnerApproved) {
      const { data: inq, error: inqErr } = await supabase
        .from('event_inquiries')
        .select('id, inquiry_type, status, created_at, event_id, events(title)')
        .eq('partner_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5);
      if (inqErr) {
        console.error('[partner-portal] event_inquiries', inqErr.message);
        toast.error('Could not load inquiries.');
      }
      setInquiries((inq ?? []) as unknown as InquiryRow[]);

      const { data: evs, error: evsErr } = await supabase
        .from('events')
        .select(
          'id, title, start_time, end_time, description, image_url, location_name, location_address, open_for_venue_partner, open_for_sponsor_inquiry, vendor_booth_spots_available'
        )
        .gte('start_time', nowIso)
        .order('start_time', { ascending: true })
        .limit(5);
      if (evsErr) {
        console.error('[partner-portal] events', evsErr.message);
        toast.error('Could not load events.');
      }
      setUpcoming((evs ?? []) as EventRow[]);

      const { data: conv } = await supabase
        .from('admin_conversations')
        .select('id')
        .eq('type', 'partner_inquiry')
        .eq('partner_id', user.id)
        .maybeSingle();

      if (conv?.id) {
        const { data: part } = await supabase
          .from('admin_conversation_participants')
          .select('last_read_at')
          .eq('conversation_id', conv.id)
          .eq('user_id', user.id)
          .maybeSingle();
        const lastRead = part?.last_read_at ? new Date(part.last_read_at).getTime() : 0;
        const { data: msgs } = await supabase
          .from('admin_messages')
          .select('sender_id, created_at')
          .eq('conversation_id', conv.id)
          .is('deleted_at', null);
        const unread = (msgs ?? []).filter((m) => {
          if (!m.sender_id || m.sender_id === user.id) return false;
          return new Date(m.created_at).getTime() > lastRead;
        }).length;
        setTeamUnread(unread);
      } else {
        setTeamUnread(0);
      }
    } else {
      setInquiries([]);
      setUpcoming([]);
      setTeamUnread(0);
    }

    setLoading(false);
  }, [user, partnerApproved]);

  useEffect(() => {
    load();
  }, [load]);

  const displayStatus =
    application?.status === 'reviewing' ? 'reviewing' : partnerStatus;

  const showReviewBanner =
    partnerStatus === 'pending' ||
    partnerStatus === 'reviewing' ||
    application?.status === 'reviewing' ||
    application?.status === 'pending';

  const showDeniedBanner = partnerStatus === 'denied';

  function openSuggestEvent() {
    setInquiryType('new_event');
    setInquiryEvent(null);
    setInquiryOpen(true);
  }

  if (loading) {
    return <PartnerPortalDashboardSkeleton />;
  }

  return (
    <SectionErrorBoundary>
    <div className="space-y-8">
      {showReviewBanner && !showDeniedBanner && (
        <div
          className="flex gap-3 rounded-xl border border-amber-500/25 p-4"
          style={{ backgroundColor: 'rgba(245, 158, 11, 0.08)' }}
        >
          <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-amber-200">Application under review</p>
            <p className="text-sm text-white/60 mt-1">
              Thanks for applying. The 704 Collective team is reviewing your partner application. You&apos;ll get full
              portal access once you&apos;re approved.
            </p>
          </div>
        </div>
      )}

      {showDeniedBanner && (
        <div
          className="flex gap-3 rounded-xl border border-red-500/25 p-4"
          style={{ backgroundColor: 'rgba(239, 68, 68, 0.08)' }}
        >
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-red-200">Application not approved</p>
            {application?.denial_reason ? (
              <p className="text-sm text-white/70 mt-2 whitespace-pre-wrap">{application.denial_reason}</p>
            ) : (
              <p className="text-sm text-white/60 mt-2">We weren&apos;t able to approve this application.</p>
            )}
            <Button asChild variant="outline" className="mt-4 border-white/20 text-white hover:bg-white/10">
              <Link href="/contact">
                <Mail className="w-4 h-4 mr-2" />
                Contact us
              </Link>
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-white/50">Status</span>
        <Badge variant="outline" className={statusBadgeClass(displayStatus)}>
          {displayStatus}
        </Badge>
      </div>

      {partnerTypes.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-white/50">Partner types</span>
          {partnerTypes.map((t) => (
            <Badge key={t} variant="secondary" className="bg-white/10 text-white/80 capitalize">
              {t}
            </Badge>
          ))}
        </div>
      )}

      {!partnerApproved ? null : (
        <>
          {teamUnread > 0 && (
            <Card className="border-[#C6A664]/30 bg-[#C6A664]/5">
              <CardContent className="py-4 flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium text-white">Unread messages from 704 Collective</p>
                  <p className="text-sm text-white/50">You have {teamUnread} unread in your team thread.</p>
                </div>
                <Button asChild className="bg-[#C6A664] text-black shrink-0">
                  <Link href="/partner-portal/messages">Open messages</Link>
                </Button>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-6 md:grid-cols-2">
            <Card className="border-white/10 bg-white/[0.02]">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base text-white">Recent inquiries</CardTitle>
                <Button variant="ghost" size="sm" asChild className="text-[#C6A664]">
                  <Link href="/partner-portal/inquiries">View all</Link>
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {inquiries.length === 0 ? (
                  <p className="text-sm text-white/45">No inquiries yet.</p>
                ) : (
                  inquiries.map((q) => {
                    const evTitle = q.events?.title ?? 'New Event Suggestion';
                    return (
                      <div
                        key={q.id}
                        className="flex items-start justify-between gap-2 rounded-lg border border-white/10 p-3"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-white truncate">{evTitle}</p>
                          <div className="flex flex-wrap gap-2 mt-2">
                            <Badge variant="outline" className="text-[0.65rem] capitalize border-white/15">
                              {q.inquiry_type.replace('_', ' ')}
                            </Badge>
                            <Badge variant="outline" className={`text-[0.65rem] capitalize ${statusBadgeClass(q.status)}`}>
                              {q.status}
                            </Badge>
                          </div>
                          <p className="text-xs text-white/40 mt-1">
                            {formatDistanceToNow(new Date(q.created_at), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-white/[0.02]">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base text-white flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[#C6A664]" />
                  Upcoming events
                </CardTitle>
                <Button variant="ghost" size="sm" asChild className="text-[#C6A664]">
                  <Link href="/partner-portal/events">Browse</Link>
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {upcoming.length === 0 ? (
                  <p className="text-sm text-white/45">No upcoming events.</p>
                ) : (
                  upcoming.map((e) => (
                    <div key={e.id} className="flex gap-3 rounded-lg border border-white/10 p-3">
                      <div className="relative h-16 w-16 rounded-lg overflow-hidden shrink-0 bg-white/5">
                        {e.image_url ? (
                          <Image
                            src={e.image_url}
                            alt={e.title}
                            fill
                            className="object-cover"
                            sizes="64px"
                            loading="lazy"
                            unoptimized
                          />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-white line-clamp-2">{e.title}</p>
                        <p className="text-xs text-white/45 mt-1">
                          {format(new Date(e.start_time), 'MMM d, yyyy · h:mm a')}
                        </p>
                        {needsVenue(e) && (
                          <p className="text-[0.65rem] text-amber-400/90 mt-1">Venue TBD — host opportunity</p>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              className="border-[#C6A664]/40 text-[#C6A664]"
              onClick={openSuggestEvent}
            >
              Suggest a new event
            </Button>
          </div>
        </>
      )}

      <InquiryModal open={inquiryOpen} onOpenChange={setInquiryOpen} inquiryType={inquiryType} event={inquiryEvent} />
    </div>
    </SectionErrorBoundary>
  );
}
