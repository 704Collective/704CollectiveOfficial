'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { BusinessPortalNav } from '@/components/business/BusinessPortalNav';
import { SectionErrorBoundary } from '@/components/SectionErrorBoundary';
import { ThankYouModal } from '@/components/ThankYouModal';
import { EventGridCard } from '@/components/EventGridCard';
import { EventListItem } from '@/components/EventListItem';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useTicketActions } from '@/hooks/useTicketActions';
import { createClient } from '@/lib/supabase/client';
import { deriveEventShape } from '@/lib/events/deriveEventShape';
import {
  format, addDays, startOfMonth, startOfWeek, endOfWeek, isSameMonth, isSameDay, isToday, addMonths, subMonths,
} from 'date-fns';
import {
  LayoutGrid, List, Calendar, ChevronLeft, ChevronRight, Briefcase,
} from 'lucide-react';

interface Event {
  id: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string;
  location_name: string | null;
  location_address: string | null;
  image_url: string | null;
  capacity: number | null;
  is_members_only: boolean;
  is_business_only: boolean;
  ticket_price: number;
  category: string | null;
  tags: string[] | null;
  access_level: string | null;
  ticket_mode: string | null;
}

const supabase = createClient();

async function fetchBusinessEvents(): Promise<Event[]> {
  const now = new Date().toISOString();
  const ninetyDaysLater = addDays(new Date(), 90).toISOString();
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .gte('start_time', now)
    .lte('start_time', ninetyDaysLater)
    .order('start_time', { ascending: true });
  if (error) throw error;
  return (data || []).map(deriveEventShape) as Event[];
}

async function fetchTicketCounts(eventIds: string[]): Promise<Record<string, number>> {
  if (eventIds.length === 0) return {};
  // Counts attendance_credentials (status active|used) via a SECURITY DEFINER
  // batch RPC, so list-page counts match the event detail page. Replaces the
  // old get_ticket_counts RPC which counted the legacy tickets table.
  const { data, error } = await supabase.rpc('get_event_attendance_counts', { p_event_ids: eventIds });
  if (error) return {};
  const counts: Record<string, number> = {};
  for (const row of (data || [])) counts[row.event_id] = Number(row.count);
  return counts;
}

type ViewMode = 'grid' | 'list' | 'calendar';

export default function BusinessEventsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const {
    userTicketIds, rsvpLoadingId, showThankYou, setShowThankYou,
    thankYouType, thankYouEvent, registerMemberTicket,
  } = useTicketActions();

  const [view, setView] = useState<ViewMode>('grid');
  const [showSocialEvents, setShowSocialEvents] = useState(false);
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [ticketCounts, setTicketCounts] = useState<Record<string, number>>({});

  const { data: allEvents = [], isLoading } = useQuery({
    queryKey: ['businessEvents'],
    queryFn: fetchBusinessEvents,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (allEvents.length > 0) {
      fetchTicketCounts(allEvents.map(e => e.id)).then(setTicketCounts);
    }
  }, [allEvents, userTicketIds]);

  // Business members see: business-only events always + social/members-only if toggled
  const filteredEvents = useMemo(() => {
    return allEvents.filter(event => {
      if (event.is_business_only) return true;
      if (showSocialEvents && event.is_members_only) return true;
      if (showSocialEvents && !event.is_members_only) return true;
      return false;
    });
  }, [allEvents, showSocialEvents]);

  const groupedByMonth = useMemo(() => {
    const groups: Record<string, Event[]> = {};
    filteredEvents.forEach(event => {
      const key = format(startOfMonth(new Date(event.start_time)), 'MMMM yyyy');
      if (!groups[key]) groups[key] = [];
      groups[key].push(event);
    });
    return groups;
  }, [filteredEvents]);

  const eventsOnDay = (day: Date) =>
    filteredEvents.filter(e => isSameDay(new Date(e.start_time), day));

  const handleGetTicket = async (event: Event) => {
    if (!user) { router.push('/login'); return; }
    const success = await registerMemberTicket(event as any);
    if (success) fetchTicketCounts(allEvents.map(e => e.id)).then(setTicketCounts);
  };

  const businessCount = allEvents.filter(e => e.is_business_only).length;

  // ── Calendar grid ──────────────────────────────────────────────────────────
  const renderCalendar = () => {
    const monthStart = startOfMonth(calendarDate);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const weeks: Date[][] = [];
    let current = calStart;
    while (weeks.length < 6) {
      const week: Date[] = [];
      for (let d = 0; d < 7; d++) {
        week.push(current);
        current = addDays(current, 1);
      }
      weeks.push(week);
      if (current > endOfWeek(addDays(monthStart, 31), { weekStartsOn: 0 })) break;
    }

    return (
      <div>
        {/* Month nav */}
        <div className="flex items-center justify-between mb-4">
          <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#FFFFFF' }}>
            {format(calendarDate, 'MMMM yyyy')}
          </h2>
          <div className="flex gap-2">
            <Button variant="outline" size="icon" aria-label="Previous month" onClick={() => setCalendarDate(d => subMonths(d, 1))}
              style={{ borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'transparent', color: 'rgba(255,255,255,0.5)' }}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCalendarDate(new Date())}
              style={{ borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'transparent', color: 'rgba(255,255,255,0.5)', fontSize: '0.8125rem' }}>
              Today
            </Button>
            <Button variant="outline" size="icon" aria-label="Next month" onClick={() => setCalendarDate(d => addMonths(d, 1))}
              style={{ borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'transparent', color: 'rgba(255,255,255,0.5)' }}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 mb-1">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} style={{ textAlign: 'center', fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.25)', padding: '6px 0', textTransform: 'uppercase' }}>
              {d}
            </div>
          ))}
        </div>

        {/* Weeks */}
        <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', overflow: 'hidden' }}>
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7" style={{ borderBottom: wi < weeks.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
              {week.map((day, di) => {
                const dayEvents = eventsOnDay(day);
                const inMonth = isSameMonth(day, calendarDate);
                const today = isToday(day);
                return (
                  <div
                    key={di}
                    style={{
                      minHeight: '80px',
                      padding: '8px',
                      backgroundColor: today ? 'rgba(198,166,100,0.06)' : 'transparent',
                      borderRight: di < 6 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                      opacity: inMonth ? 1 : 0.35,
                    }}
                  >
                    <div style={{
                      width: '26px', height: '26px', borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      backgroundColor: today ? '#C6A664' : 'transparent',
                      color: today ? '#1A1A1A' : inMonth ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.25)',
                      fontSize: '0.8125rem', fontWeight: today ? 700 : 400,
                      marginBottom: '4px',
                    }}>
                      {format(day, 'd')}
                    </div>
                    <div className="space-y-0.5">
                      {dayEvents.slice(0, 2).map(event => (
                        <button
                          key={event.id}
                          onClick={() => router.push(`/events/${event.id}`)}
                          style={{
                            display: 'block', width: '100%', textAlign: 'left',
                            fontSize: '0.625rem', fontWeight: 600, lineHeight: 1.3,
                            padding: '2px 5px', borderRadius: '4px',
                            backgroundColor: event.is_business_only ? 'rgba(198,166,100,0.2)' : 'rgba(255,255,255,0.08)',
                            color: event.is_business_only ? '#C6A664' : 'rgba(255,255,255,0.6)',
                            border: 'none', cursor: 'pointer',
                            overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                          }}
                        >
                          {event.title}
                        </button>
                      ))}
                      {dayEvents.length > 2 && (
                        <p style={{ fontSize: '0.5625rem', color: 'rgba(255,255,255,0.3)', paddingLeft: '5px' }}>
                          +{dayEvents.length - 2} more
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <>
      <BusinessPortalNav />
      <main id="main-content" className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p style={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#C6A664', marginBottom: '6px' }}>
              Business Portal
            </p>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#FFFFFF' }}>
              Events
            </h1>
            {!isLoading && (
              <p style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.35)', marginTop: '4px' }}>
                {businessCount} business event{businessCount !== 1 ? 's' : ''} upcoming
              </p>
            )}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Social events toggle */}
            <button
              onClick={() => setShowSocialEvents(v => !v)}
              className="flex items-center gap-2"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              <div style={{
                width: '36px', height: '20px', borderRadius: '10px',
                backgroundColor: showSocialEvents ? '#C6A664' : 'rgba(255,255,255,0.1)',
                position: 'relative', transition: 'background-color 0.2s', flexShrink: 0,
              }}>
                <div style={{
                  position: 'absolute', top: '3px',
                  left: showSocialEvents ? '19px' : '3px',
                  width: '14px', height: '14px', borderRadius: '50%',
                  backgroundColor: '#FFFFFF', transition: 'left 0.2s',
                }} />
              </div>
              <span style={{ fontSize: '0.8125rem', color: showSocialEvents ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.35)', fontWeight: 500, whiteSpace: 'nowrap' }}>
                Show social events
              </span>
            </button>

            {/* View toggles */}
            <div className="flex gap-1">
              {([
                { mode: 'grid' as ViewMode, Icon: LayoutGrid, label: 'Grid' },
                { mode: 'list' as ViewMode, Icon: List, label: 'List' },
                { mode: 'calendar' as ViewMode, Icon: Calendar, label: 'Calendar' },
              ]).map(({ mode, Icon, label }) => (
                <Button
                  key={mode}
                  variant={view === mode ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setView(mode)}
                  style={view === mode ? {
                    backgroundColor: '#C6A664', color: '#1A1A1A', borderColor: '#C6A664', fontWeight: 700,
                  } : {
                    borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'transparent', color: 'rgba(255,255,255,0.4)',
                  }}
                >
                  <Icon className="w-4 h-4 mr-1.5" />{label}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#C6A664' }} />
            <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>Business only</span>
          </div>
          <div className="flex items-center gap-2">
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.2)' }} />
            <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>All members</span>
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-56 rounded-xl" />)}
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="text-center py-24">
            <Briefcase className="w-12 h-12 mx-auto mb-4" style={{ color: 'rgba(255,255,255,0.15)' }} />
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.9375rem' }}>
              No business events scheduled yet.
            </p>
          </div>
        ) : (
          <SectionErrorBoundary>

            {/* Calendar view */}
            {view === 'calendar' && renderCalendar()}

            {/* Grid view */}
            {view === 'grid' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredEvents.map(event => (
                  <div key={event.id} style={{ position: 'relative' }}>
                    {event.is_business_only && (
                      <div style={{
                        position: 'absolute', top: '10px', left: '10px', zIndex: 10,
                        display: 'flex', alignItems: 'center', gap: '4px',
                        backgroundColor: 'rgba(198,166,100,0.9)', borderRadius: '6px',
                        padding: '3px 8px', fontSize: '0.625rem', fontWeight: 700,
                        color: '#1A1A1A', letterSpacing: '0.06em', textTransform: 'uppercase',
                      }}>
                        <Briefcase style={{ width: '10px', height: '10px' }} />
                        Business
                      </div>
                    )}
                    <EventGridCard
                      id={event.id}
                      title={event.title}
                      description={event.description || undefined}
                      startTime={event.start_time}
                      endTime={event.end_time}
                      locationName={event.location_name || undefined}
                      imageUrl={event.image_url || undefined}
                      ticketPrice={event.ticket_price || 0}
                      isActiveMembersOnly={event.is_members_only || false}
                      isBusinessOnly={event.is_business_only || false}
                      categoryPortalTone="businessPortal"
                      userHasTicket={userTicketIds.has(event.id)}
                      isUserMember={true}
                      isLoggedIn={true}
                      category={event.category}
                      capacity={event.capacity}
                      ticketCount={ticketCounts[event.id] || 0}
                      tags={event.tags}
                      loading={rsvpLoadingId === event.id}
                      onGetTicket={() => handleGetTicket(event)}
                      onGuestPurchase={() => router.push(`/events/${event.id}`)}
                      onClick={() => router.push(`/events/${event.id}`)}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* List view */}
            {view === 'list' && (
              <div className="space-y-10">
                {Object.entries(groupedByMonth).map(([month, monthEvents]) => (
                  <div key={month}>
                    <h2 style={{
                      fontSize: '0.875rem', fontWeight: 700, color: 'rgba(255,255,255,0.4)',
                      marginBottom: '12px', paddingBottom: '12px',
                      borderBottom: '1px solid rgba(255,255,255,0.07)',
                      display: 'flex', alignItems: 'center', gap: '8px',
                    }}>
                      <Calendar className="w-4 h-4" style={{ color: '#C6A664' }} />
                      {month}
                    </h2>
                    <div>
                      {monthEvents.map(event => (
                        <div key={event.id} style={{ position: 'relative' }}>
                          {event.is_business_only && (
                            <div style={{
                              position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                              zIndex: 10, display: 'flex', alignItems: 'center', gap: '4px',
                              backgroundColor: 'rgba(198,166,100,0.15)', borderRadius: '6px',
                              padding: '3px 8px', fontSize: '0.625rem', fontWeight: 700,
                              color: '#C6A664', letterSpacing: '0.06em', textTransform: 'uppercase',
                            }}>
                              <Briefcase style={{ width: '10px', height: '10px' }} />
                              Business
                            </div>
                          )}
                          <EventListItem
                            id={event.id}
                            title={event.title}
                            startTime={event.start_time}
                            endTime={event.end_time}
                            locationName={event.location_name || undefined}
                            imageUrl={event.image_url || undefined}
                            ticketPrice={event.ticket_price || 0}
                            isActiveMembersOnly={event.is_members_only || false}
                            isBusinessOnly={event.is_business_only || false}
                            categoryPortalTone="businessPortal"
                            userHasTicket={userTicketIds.has(event.id)}
                            isUserMember={true}
                            isLoggedIn={true}
                            category={event.category}
                            capacity={event.capacity}
                            ticketCount={ticketCounts[event.id] || 0}
                            tags={event.tags}
                            loading={rsvpLoadingId === event.id}
                            onGetTicket={() => handleGetTicket(event)}
                            onGuestPurchase={() => router.push(`/events/${event.id}`)}
                            onClick={() => router.push(`/events/${event.id}`)}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

          </SectionErrorBoundary>
        )}
      </main>

      <ThankYouModal
        open={showThankYou}
        onOpenChange={setShowThankYou}
        type={thankYouType}
        event={thankYouEvent ?? undefined}
      />
    </>
  );
}