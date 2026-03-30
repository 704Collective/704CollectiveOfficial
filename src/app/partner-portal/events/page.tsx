'use client';

import { useEffect, useState, useCallback } from 'react';
import Image from 'next/image';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { format } from 'date-fns';
import { InquiryModal } from '@/components/partner/InquiryModal';
import { SectionErrorBoundary } from '@/components/SectionErrorBoundary';
import { PartnerPortalEventsSkeleton } from '@/components/dashboard/DashboardLoadingSkeletons';
import { toast } from 'sonner';
import type { PartnerInquiryType } from '@/app/actions/partnerPortalActions';

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

function needsVenue(e: EventRow) {
  if (e.open_for_venue_partner != null) return e.open_for_venue_partner;
  return !e.location_name?.trim() && !e.location_address?.trim();
}

function sponsorsOpen(e: EventRow) {
  return e.open_for_sponsor_inquiry !== false;
}

function vendorSpots(e: EventRow) {
  return Math.max(0, e.vendor_booth_spots_available ?? 0);
}

export default function PartnerPortalEventsPage() {
  const { profile } = useAuth();
  const p = profile as Record<string, unknown> | null;
  const partnerTypes = (p?.partner_types as string[] | undefined) ?? [];
  const partnerApproved = (p?.partner_status as string) === 'approved';

  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<PartnerInquiryType>('vendor');
  const [modalEvent, setModalEvent] = useState<{ id: string; title: string } | null>(null);

  const isVenue = partnerTypes.includes('venue');
  const isSponsor = partnerTypes.includes('sponsor');
  const isVendor = partnerTypes.includes('vendor');

  const load = useCallback(async () => {
    setLoading(true);
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from('events')
      .select(
        'id, title, start_time, end_time, description, image_url, location_name, location_address, open_for_venue_partner, open_for_sponsor_inquiry, vendor_booth_spots_available'
      )
      .gte('start_time', nowIso)
      .order('start_time', { ascending: true });
    if (error) {
      console.error('[partner-portal/events]', error.message);
      toast.error('Could not load events.');
      setEvents([]);
    } else {
      setEvents((data ?? []) as EventRow[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openInquiry(type: PartnerInquiryType, ev: EventRow | null) {
    setModalType(type);
    setModalEvent(ev ? { id: ev.id, title: ev.title } : null);
    setModalOpen(true);
  }

  if (!partnerApproved) {
    return (
      <p className="text-white/50 text-center py-16">
        Full events access is available once your partner application is approved.
      </p>
    );
  }

  if (loading) {
    return <PartnerPortalEventsSkeleton />;
  }

  return (
    <SectionErrorBoundary>
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Events</h2>
          <p className="text-sm text-white/50 mt-1">Browse upcoming events and send inquiries to the team.</p>
        </div>
        <Button
          type="button"
          className="bg-[#C6A664] text-black hover:bg-[#d4b87a] shrink-0"
          onClick={() => openInquiry('new_event', null)}
        >
          Suggest new event
        </Button>
      </div>

      <div className="space-y-6">
        {events.length === 0 ? (
          <p className="text-white/45 text-center py-12">No upcoming events scheduled.</p>
        ) : (
          events.map((e) => (
            <Card key={e.id} className="border-white/10 bg-white/[0.02] overflow-hidden">
              <div className="md:flex">
                <div className="relative h-48 md:h-auto md:w-72 shrink-0 bg-white/5">
                  {e.image_url ? (
                    <Image
                      src={e.image_url}
                      alt={e.title}
                      fill
                      className="object-cover"
                      sizes="(max-width:768px) 100vw, 288px"
                      loading="lazy"
                      unoptimized
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-white/20 text-sm">No image</div>
                  )}
                </div>
                <CardContent className="p-6 flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-white">{e.title}</h3>
                  <p className="text-sm text-[#C6A664] mt-1">
                    {format(new Date(e.start_time), 'EEEE, MMMM d, yyyy')}
                    <span className="text-white/40"> · </span>
                    {format(new Date(e.start_time), 'h:mm a')}
                    {' – '}
                    {format(new Date(e.end_time), 'h:mm a')}
                  </p>
                  <p className="text-sm text-white/55 mt-2">
                    {[e.location_name, e.location_address].filter(Boolean).join(' · ') || 'Location TBD'}
                  </p>
                  {e.description ? (
                    <p className="text-sm text-white/65 mt-4 whitespace-pre-wrap line-clamp-6">{e.description}</p>
                  ) : null}

                  <div className="flex flex-wrap gap-2 mt-6">
                    {needsVenue(e) && isVenue && (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="bg-white/10 text-white hover:bg-white/15"
                        onClick={() => openInquiry('venue', e)}
                      >
                        Apply to host
                      </Button>
                    )}
                    {sponsorsOpen(e) && isSponsor && (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="bg-white/10 text-white hover:bg-white/15"
                        onClick={() => openInquiry('sponsor', e)}
                      >
                        Inquire to sponsor
                      </Button>
                    )}
                    {vendorSpots(e) > 0 && isVendor && (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="bg-white/10 text-white hover:bg-white/15"
                        onClick={() => openInquiry('vendor', e)}
                      >
                        Apply to vend
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="border-[#C6A664]/40 text-[#C6A664]"
                      onClick={() => openInquiry('new_event', null)}
                    >
                      Suggest new event
                    </Button>
                  </div>
                </CardContent>
              </div>
            </Card>
          ))
        )}
      </div>

      <InquiryModal open={modalOpen} onOpenChange={setModalOpen} inquiryType={modalType} event={modalEvent} />
    </div>
    </SectionErrorBoundary>
  );
}
