'use client';

import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useMemo } from 'react';
import { SectionErrorBoundary } from '@/components/SectionErrorBoundary';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Search, X, Calendar, Crown } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { format, addDays, startOfMonth } from 'date-fns';
import { Header } from '@/components/Header';
import { EventListItem } from '@/components/EventListItem';
import { EventGridCard } from '@/components/EventGridCard';
import { FeaturedEventBanner } from '@/components/FeaturedEventBanner';
import { ViewToggle } from '@/components/ViewToggle';
import { ThankYouModal } from '@/components/ThankYouModal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { useTicketActions } from '@/hooks/useTicketActions';
import { toast } from 'sonner';
import { EventCategory, CATEGORY_CONFIG } from '@/components/CategoryBadge';

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
  ticket_price: number;
  category: string | null;
  tags: string[] | null;
}

export default function Events() {
  const router = useRouter();
  const { user, profile, isMember, isAdmin } = useAuth();
  usePageTitle('Upcoming Events');

  const {
    userTicketIds,
    rsvpLoadingId,
    showThankYou,
    setShowThankYou,
    thankYouType,
    registerMemberTicket,
  } = useTicketActions();

  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [showMembersOnly, setShowMembersOnly] = useState(false);
  const [ticketCounts, setTicketCounts] = useState<Record<string, number>>({});

  const isUserMember = isMember;

  const fetchEvents = async () => {
    try {
      const now = new Date().toISOString();
      const sixtyDaysLater = addDays(new Date(), 60).toISOString();

      const { data, error } = await supabase
        .from('events')
        .select('*')
        .gte('start_time', now)
        .lte('start_time', sixtyDaysLater)
        .order('start_time', { ascending: true });

      if (error) throw error;
      setEvents(data || []);
    } catch (error) {
      console.error('Error fetching events:', error);
      toast.error('Failed to load events');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchTicketCounts = async (eventIds: string[]) => {
    if (eventIds.length === 0) return;
    try {
      const { data, error } = await supabase.rpc('get_ticket_counts', {
        event_ids: eventIds,
      });
      if (error) {
        console.error('Error fetching ticket counts:', error);
        return;
      }
      const counts: Record<string, number> = {};
      if (data) {
        for (const row of data) {
          counts[row.event_id] = Number(row.count);
        }
      }
      setTicketCounts(counts);
    } catch (error) {
      console.error('Error fetching ticket counts:', error);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  useEffect(() => {
    if (events.length > 0) {
      fetchTicketCounts(events.map(e => e.id));
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

  const groupedEvents = useMemo(() => {
    const groups: Record<string, Event[]> = {};
    const eventsToGroup = selectedCategory || searchQuery ? filteredEvents : remainingEvents;
    eventsToGroup.forEach(event => {
      const monthKey = format(startOfMonth(new Date(event.start_time)), 'MMMM yyyy');
      if (!groups[monthKey]) groups[monthKey] = [];
      groups[monthKey].push(event);
    });
    return groups;
  }, [remainingEvents, filteredEvents, selectedCategory, searchQuery]);

  const handleGetTicket = async (event: Event) => {
    if (!user) {
      router.push('/login');
      return;
    }

    if (isUserMember) {
      const success = await registerMemberTicket(event);
      if (success) {
        // Refresh counts after successful RSVP
        fetchTicketCounts(events.map(e => e.id));
      }
    } else {
      toast.info('Join as a member for free tickets!');
    }
  };

  const handleGuestPurchase = (event: Event) => {
    router.push(`/events/${event.id}`);
  };

  // Only show categories that have at least one upcoming event
  const activeCategories = useMemo(() => {
    const categoriesWithEvents = new Set<string>();
    events.forEach(event => {
      if (event.category && event.category !== 'other') {
        categoriesWithEvents.add(event.category);
      }
    });
    return Object.keys(CATEGORY_CONFIG).filter(c => c !== 'other' && c !== 'members_only' && categoriesWithEvents.has(c));
  }, [events]);

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedCategory(null);
    setShowMembersOnly(false);
  };

  const hasActiveFilters = searchQuery || selectedCategory || showMembersOnly;

  return (
    <div className="min-h-screen bg-background">
      <Header 
        user={user ? { 
          email: user.email, 
          name: profile?.full_name || undefined,
          avatarUrl: profile?.avatar_url || undefined
        } : null}
        isAdmin={isAdmin}
      />
      
      <main className="container mx-auto px-4 py-10 md:py-14 max-w-6xl">
        {/* Header */}
        <div className="mb-10">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-2">All Events</p>
          <h1 className="text-3xl md:text-4xl font-semibold text-foreground mb-2">Upcoming Events</h1>
          <p className="text-muted-foreground">Discover and RSVP to upcoming 704 Collective events</p>
        </div>

        {/* Filters */}
        <div className="sticky top-16 z-10 bg-background/95 backdrop-blur-sm py-4 mb-8 -mx-4 px-4 border-b border-border/50 space-y-3">
          {/* Row 1: Search + View Toggle */}
          <div className="flex gap-3 items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search events..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-muted/50"
              />
            </div>
            <ViewToggle view={view} onViewChange={setView} />
          </div>

          {/* Row 2: Horizontal scrollable category chips */}
          {activeCategories.length > 0 && (
            <div className="relative">
              <div className="absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
              <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />
              <div className="flex gap-2 overflow-x-auto hide-scrollbar px-1 py-1">
                {activeCategories.map(cat => {
                  const config = CATEGORY_CONFIG[cat as EventCategory];
                  const Icon = config.icon;
                  const isSelected = selectedCategory === cat;
                  return (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(isSelected ? null : cat)}
                      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full text-xs px-3 py-1.5 transition-colors shrink-0 ${
                        isSelected
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground border border-border/50 hover:bg-accent'
                      }`}
                    >
                      <Icon className="w-3 h-3" />
                      <span>{config.label}</span>
                      {isSelected && <X className="w-3 h-3 ml-0.5" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Row 3: Members-only toggle */}
          <div className="flex items-center gap-2">
            <Switch
              id="members-only"
              checked={showMembersOnly}
              onCheckedChange={setShowMembersOnly}
            />
            <label htmlFor="members-only" className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer">
              <Crown className="w-3.5 h-3.5" />
              Members-only events only
            </label>
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="rounded-xl border border-border overflow-hidden">
                <Skeleton className="h-40 w-full" />
                <div className="p-4 space-y-3">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-8 w-24" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="text-center py-16">
            <Calendar className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {hasActiveFilters ? 'No results found' : 'No upcoming events'}
            </h3>
            <p className="text-muted-foreground mb-4">
              {hasActiveFilters ? 'Try a different search term.' : 'Check back soon — we\'re planning something great.'}
            </p>
            {hasActiveFilters && (
              <Button variant="outline" onClick={clearFilters}>Clear Filters</Button>
            )}
          </div>
        ) : (
          <SectionErrorBoundary>
          <div className="space-y-10">
            {featuredEvent && !hasActiveFilters && (
              <FeaturedEventBanner
                event={featuredEvent}
                userHasTicket={userTicketIds.has(featuredEvent.id)}
                isUserMember={isUserMember}
                isLoggedIn={!!user}
                capacity={featuredEvent.capacity}
                ticketCount={ticketCounts[featuredEvent.id] || 0}
                onClick={() => router.push(`/events/${featuredEvent.id}`)}
              />
            )}

            {/* Events Grid/List */}
            {view === 'grid' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {(hasActiveFilters ? filteredEvents : remainingEvents).map(event => (
                  <EventGridCard
                    key={event.id}
                    id={event.id}
                    title={event.title}
                    description={event.description || undefined}
                    startTime={event.start_time}
                    endTime={event.end_time}
                    locationName={event.location_name || undefined}
                    imageUrl={event.image_url || undefined}
                    ticketPrice={event.ticket_price || 0}
                    isMembersOnly={event.is_members_only || false}
                    userHasTicket={userTicketIds.has(event.id)}
                    isUserMember={isUserMember}
                    isLoggedIn={!!user}
                    category={event.category}
                    capacity={event.capacity}
                    ticketCount={ticketCounts[event.id] || 0}
                    tags={event.tags}
                    isLoading={rsvpLoadingId === event.id}
                    onGetTicket={() => handleGetTicket(event)}
                    onGuestPurchase={() => handleGuestPurchase(event)}
                    onClick={() => router.push(`/events/${event.id}`)}
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-6">
                {Object.entries(groupedEvents).map(([month, monthEvents]) => (
                  <div key={month}>
                    <h2 className="text-lg font-semibold text-foreground mb-4 sticky top-[120px] bg-background/95 backdrop-blur-sm py-2 z-[5] border-b border-border">
                      {month}
                    </h2>
                    <div className="space-y-2">
                      {monthEvents.map(event => (
                        <EventListItem
                          key={event.id}
                          id={event.id}
                          title={event.title}
                          startTime={event.start_time}
                          endTime={event.end_time}
                          locationName={event.location_name || undefined}
                          imageUrl={event.image_url || undefined}
                          ticketPrice={event.ticket_price || 0}
                          isMembersOnly={event.is_members_only || false}
                          userHasTicket={userTicketIds.has(event.id)}
                          isUserMember={isUserMember}
                          isLoggedIn={!!user}
                          category={event.category}
                          capacity={event.capacity}
                          ticketCount={ticketCounts[event.id] || 0}
                          tags={event.tags}
                          isLoading={rsvpLoadingId === event.id}
                          onGetTicket={() => handleGetTicket(event)}
                          onGuestPurchase={() => handleGuestPurchase(event)}
                          onClick={() => router.push(`/events/${event.id}`)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          </SectionErrorBoundary>
        )}
      </main>

      <ThankYouModal 
        open={showThankYou} 
        onOpenChange={setShowThankYou} 
        type={thankYouType} 
      />
    </div>
  );
}
