'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Header } from '@/components/Header';
import { DashboardNav } from '@/components/DashboardNav';
import { SectionErrorBoundary } from '@/components/SectionErrorBoundary';
import { ThankYouModal } from '@/components/ThankYouModal';
import { EventListItem } from '@/components/EventListItem';
import { EventGridCard } from '@/components/EventGridCard';
import { EventCalendarView } from '@/components/EventCalendarView';
import { FeaturedEventBanner } from '@/components/FeaturedEventBanner';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useTicketActions } from '@/hooks/useTicketActions';
import { createClient } from '@/lib/supabase/client';
import { format, addDays, startOfMonth, subMinutes } from 'date-fns';
import { Search, X, Crown, LayoutGrid, List, Calendar } from 'lucide-react';
import { EventCategory, CATEGORY_CONFIG } from '@/components/CategoryBadge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface Event {
  id: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string | null;
  location_name: string | null;
  location_address: string | null;
  image_url: string | null;
  capacity: number | null;
  is_members_only: boolean;
  is_business_only: boolean;
  ticket_price: number;
  category: string | null;
  tags: string[] | null;
}

const supabase = createClient();

async function fetchEvents(): Promise<Event[]> {
  const thirtyMinsAgo = subMinutes(new Date(), 30).toISOString();
  const sixtyDaysLater = addDays(new Date(), 60).toISOString();
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('is_published', true)
    .lte('start_time', sixtyDaysLater)
    .or(`end_time.gte.${thirtyMinsAgo},and(end_time.is.null,start_time.gte.${thirtyMinsAgo})`)
    .order('start_time', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function fetchTicketCounts(eventIds: string[]): Promise<Record<string, number>> {
  if (eventIds.length === 0) return {};
  const { data, error } = await supabase.rpc('get_ticket_counts', { event_ids: eventIds });
  if (error) return {};
  const counts: Record<string, number> = {};
  for (const row of (data || [])) counts[row.event_id] = Number(row.count);
  return counts;
}

export default function BrowseEventsPage() {
  const router = useRouter();
  const { user, isActiveMember } = useAuth();
  usePageTitle('Browse Events');

  const {
    userTicketIds,
    rsvpLoadingId,
    showThankYou,
    setShowThankYou,
    thankYouType,
    registerMemberTicket,
  } = useTicketActions();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [view, setView] = useState<'grid' | 'list' | 'calendar'>('grid');
  const [showMembersOnly, setShowMembersOnly] = useState(false);
  const [ticketCounts, setTicketCounts] = useState<Record<string, number>>({});

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['browseEvents'],
    queryFn: fetchEvents,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (events.length > 0) {
      fetchTicketCounts(events.map(e => e.id)).then(setTicketCounts);
    }
  }, [events, userTicketIds]);

  const filteredEvents = useMemo(() => {
    return events.filter(event => {
      const matchesSearch = !searchQuery ||
        event.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        event.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        event.location_name?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = !selectedCategory || event.category === selectedCategory;
      const matchesMembersOnly = !showMembersOnly || event.is_members_only;
      return matchesSearch && matchesCategory && matchesMembersOnly;
    });
  }, [events, searchQuery, selectedCategory, showMembersOnly]);

  const featuredEvent = filteredEvents[0];
  const remainingEvents = filteredEvents.slice(1);
  const hasActiveFilters = searchQuery || selectedCategory || showMembersOnly;

  const groupedEvents = useMemo(() => {
    const groups: Record<string, Event[]> = {};
    const eventsToGroup = hasActiveFilters ? filteredEvents : remainingEvents;
    eventsToGroup.forEach(event => {
      const monthKey = format(startOfMonth(new Date(event.start_time)), 'MMMM yyyy');
      if (!groups[monthKey]) groups[monthKey] = [];
      groups[monthKey].push(event);
    });
    return groups;
  }, [remainingEvents, filteredEvents, hasActiveFilters]);

  const activeCategories = useMemo(() => {
    const categoriesWithEvents = new Set<string>();
    events.forEach(event => {
      if (event.category && event.category !== 'other') categoriesWithEvents.add(event.category);
    });
    return Object.keys(CATEGORY_CONFIG).filter(c => c !== 'other' && c !== 'members_only' && categoriesWithEvents.has(c));
  }, [events]);

  const handleGetTicket = async (event: Event) => {
    if (!user) { router.push('/login'); return; }
    if (isActiveMember) {
      const success = await registerMemberTicket({ ...event, end_time: event.end_time ?? '' });
      if (success) fetchTicketCounts(events.map(e => e.id)).then(setTicketCounts);
    } else {
      router.push(`/events/${event.id}`);
    }
  };

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedCategory(null);
    setShowMembersOnly(false);
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#000000' }}>
      <Header />

      <DashboardNav />

      <main id="main-content" className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6 lg:px-8 sm:py-8">
        <div>
          <h1 className="text-2xl font-semibold mb-1">Browse Events</h1>
          <p className="text-sm text-muted-foreground">
            Discover and RSVP to upcoming 704 Collective events.
          </p>
        </div>

        {/* Filters */}
        <div className="space-y-3">
          {/* Search + View Toggle */}
          <div className="flex gap-2 items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search events..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-1">
              <Button
                variant={view === 'grid' ? 'default' : 'outline'}
                size="icon"
                onClick={() => setView('grid')}
                aria-label="Grid view"
              >
                <LayoutGrid className="w-4 h-4" />
              </Button>
              <Button
                variant={view === 'list' ? 'default' : 'outline'}
                size="icon"
                onClick={() => setView('list')}
                aria-label="List view"
              >
                <List className="w-4 h-4" />
              </Button>
              <Button
                variant={view === 'calendar' ? 'default' : 'outline'}
                size="icon"
                onClick={() => setView('calendar')}
                aria-label="Calendar view"
              >
                <Calendar className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Category Chips */}
          {activeCategories.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {activeCategories.map(cat => {
                const config = CATEGORY_CONFIG[cat as EventCategory];
                const Icon = config.icon;
                const isSelected = selectedCategory === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(isSelected ? null : cat)}
                    className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full text-xs px-3 py-1.5 border transition-all shrink-0 ${
                      isSelected
                        ? 'border-[#C6A664] bg-[#C6A664]/15 text-[#C6A664]'
                        : 'border-border text-muted-foreground hover:text-foreground hover:border-border/80'
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    {config.label}
                    {isSelected && <X className="w-3 h-3 ml-0.5" />}
                  </button>
                );
              })}
            </div>
          )}

          {/* Members-only Toggle */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setShowMembersOnly(!showMembersOnly)}
              className={`relative w-9 h-5 rounded-full border-0 cursor-pointer transition-colors shrink-0 ${showMembersOnly ? 'bg-[#C6A664]' : 'bg-muted'}`}
              role="switch"
              aria-checked={showMembersOnly}
              aria-label="Show members-only events"
            >
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${showMembersOnly ? 'left-[18px]' : 'left-0.5'}`} />
            </button>
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Crown className="w-3.5 h-3.5" />
              Members-only events
            </span>
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-56 rounded-xl" />)}
          </div>
        ) : filteredEvents.length === 0 && view !== 'calendar' ? (
          <div className="text-center py-20">
            <Calendar className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">
              {hasActiveFilters ? 'No results found' : 'No upcoming events'}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {hasActiveFilters ? 'Try a different search term or category.' : "Check back soon - we're planning something great."}
            </p>
            {hasActiveFilters && (
              <Button variant="outline" size="sm" onClick={clearFilters}>Clear Filters</Button>
            )}
          </div>
        ) : (
          <SectionErrorBoundary>
            <div className="space-y-10">

              {/* Calendar view */}
              {view === 'calendar' && (
                <EventCalendarView
                  events={filteredEvents}
                  isUserMember={!!isActiveMember}
                  onEventClick={(id) => router.push(`/events/${id}`)}
                  theme="dark"
                />
              )}

              {/* Grid view */}
              {view === 'grid' && (
                <>
                  {featuredEvent && !hasActiveFilters && (
                    <FeaturedEventBanner
                      event={{ ...featuredEvent, end_time: featuredEvent.end_time ?? '', is_business_only: featuredEvent.is_business_only ?? false }}
                      userHasTicket={userTicketIds.has(featuredEvent.id)}
                      isUserMember={!!isActiveMember}
                      isLoggedIn={!!user}
                      capacity={featuredEvent.capacity}
                      ticketCount={ticketCounts[featuredEvent.id] || 0}
                      onClick={() => router.push(`/events/${featuredEvent.id}`)}
                    />
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {(hasActiveFilters ? filteredEvents : remainingEvents).map(event => (
                      <EventGridCard
                        key={event.id}
                        id={event.id}
                        title={event.title}
                        description={event.description || undefined}
                        startTime={event.start_time}
                        endTime={event.end_time || event.start_time}
                        locationName={event.location_name || undefined}
                        imageUrl={event.image_url || undefined}
                        ticketPrice={event.ticket_price || 0}
                        isActiveMembersOnly={event.is_members_only || false}
                        isBusinessOnly={event.is_business_only || false}
                        userHasTicket={userTicketIds.has(event.id)}
                        isUserMember={!!isActiveMember}
                        isLoggedIn={!!user}
                        category={event.category}
                        capacity={event.capacity}
                        ticketCount={ticketCounts[event.id] || 0}
                        tags={event.tags}
                        loading={rsvpLoadingId === event.id}
                        onGetTicket={() => handleGetTicket(event)}
                        onGuestPurchase={() => router.push(`/events/${event.id}`)}
                        onClick={() => router.push(`/events/${event.id}`)}
                      />
                    ))}
                  </div>
                </>
              )}

              {/* List view */}
              {view === 'list' && (
                <>
                  {featuredEvent && !hasActiveFilters && (
                    <FeaturedEventBanner
                      event={{ ...featuredEvent, end_time: featuredEvent.end_time ?? '', is_business_only: featuredEvent.is_business_only ?? false }}
                      userHasTicket={userTicketIds.has(featuredEvent.id)}
                      isUserMember={!!isActiveMember}
                      isLoggedIn={!!user}
                      capacity={featuredEvent.capacity}
                      ticketCount={ticketCounts[featuredEvent.id] || 0}
                      onClick={() => router.push(`/events/${featuredEvent.id}`)}
                    />
                  )}
                  <div className="space-y-10">
                    {Object.entries(groupedEvents).map(([month, monthEvents]) => (
                      <div key={month}>
                        <h2 className="text-base font-semibold text-foreground mb-3 pb-3 border-b border-border">
                          {month}
                        </h2>
                        <div>
                          {monthEvents.map(event => (
                            <EventListItem
                              key={event.id}
                              id={event.id}
                              title={event.title}
                              startTime={event.start_time}
                              endTime={event.end_time || event.start_time}
                              locationName={event.location_name || undefined}
                              imageUrl={event.image_url || undefined}
                              ticketPrice={event.ticket_price || 0}
                              isActiveMembersOnly={event.is_members_only || false}
                              isBusinessOnly={event.is_business_only || false}
                              userHasTicket={userTicketIds.has(event.id)}
                              isUserMember={!!isActiveMember}
                              isLoggedIn={!!user}
                              category={event.category}
                              capacity={event.capacity}
                              ticketCount={ticketCounts[event.id] || 0}
                              tags={event.tags}
                              loading={rsvpLoadingId === event.id}
                              onGetTicket={() => handleGetTicket(event)}
                              onGuestPurchase={() => router.push(`/events/${event.id}`)}
                              onClick={() => router.push(`/events/${event.id}`)}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </SectionErrorBoundary>
        )}
      </main>

      <ThankYouModal open={showThankYou} onOpenChange={setShowThankYou} type={thankYouType} />
    </div>
  );
}