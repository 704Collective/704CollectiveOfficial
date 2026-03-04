'use client';

import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useMemo } from 'react';
import Nav from '@/components/Nav';
import { Footer } from '@/components/Footer';
import { SectionErrorBoundary } from '@/components/SectionErrorBoundary';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Search, X, Calendar, Crown, LayoutGrid, List } from 'lucide-react';
import { format, addDays, startOfMonth } from 'date-fns';
import { EventListItem } from '@/components/EventListItem';
import { EventGridCard } from '@/components/EventGridCard';
import { FeaturedEventBanner } from '@/components/FeaturedEventBanner';
import { ThankYouModal } from '@/components/ThankYouModal';
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
  const { user, isActiveMember } = useAuth();
  usePageTitle('Upcoming Events | 704 Collective');

  const {
    userTicketIds,
    rsvpLoadingId,
    showThankYou,
    setShowThankYou,
    thankYouType,
    registerMemberTicket,
  } = useTicketActions();

  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [view, setView] = useState<'grid' | 'list'>('list');
  const [showMembersOnly, setShowMembersOnly] = useState(false);
  const [ticketCounts, setTicketCounts] = useState<Record<string, number>>({});

  const isUserMember = isActiveMember;

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
      setLoading(false);
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
        fetchTicketCounts(events.map(e => e.id));
      }
    } else {
      router.push(`/events/${event.id}`);
    }
  };

  const handleGuestPurchase = (event: Event) => {
    router.push(`/events/${event.id}`);
  };

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
    <>
      <Nav />
      <div style={{ paddingTop: '64px', minHeight: '100vh', backgroundColor: '#000000' }}>
        <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '48px 24px 80px' }}>
          {/* Page Header */}
          <div style={{ marginBottom: '40px', textAlign: 'center' }}>
            <p
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                color: '#C6A664',
                marginBottom: '12px',
              }}
            >
              All Events
            </p>
            <h1
              style={{
                fontSize: 'clamp(2rem, 5vw, 3rem)',
                fontWeight: 700,
                letterSpacing: '-0.02em',
                color: '#FFFFFF',
                marginBottom: '12px',
              }}
            >
              Upcoming Events
            </h1>
            <p style={{ fontSize: '1.0625rem', color: 'rgba(255, 255, 255, 0.5)', lineHeight: 1.6, maxWidth: '500px', margin: '0 auto' }}>
              Discover and RSVP to upcoming 704 Collective events. Members get in free — non-members can purchase tickets.
            </p>
          </div>

          {/* Filters Bar */}
          <div
            style={{
              position: 'sticky',
              top: '64px',
              zIndex: 10,
              backgroundColor: 'rgba(0, 0, 0, 0.92)',
              backdropFilter: 'blur(12px)',
              padding: '16px 0',
              marginBottom: '40px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
            }}
          >
            {/* Search + View Toggle */}
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Search
                  style={{
                    position: 'absolute',
                    left: '14px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: '16px',
                    height: '16px',
                    color: 'rgba(255, 255, 255, 0.3)',
                  }}
                />
                <input
                  placeholder="Search events..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '11px 16px 11px 42px',
                    backgroundColor: '#1A1A1A',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '8px',
                    color: '#FFFFFF',
                    fontSize: '0.875rem',
                    outline: 'none',
                    boxSizing: 'border-box',
                    transition: 'border-color 200ms ease',
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = '#C6A664'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)'; }}
                />
              </div>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  onClick={() => setView('grid')}
                  style={{
                    padding: '10px',
                    backgroundColor: view === 'grid' ? '#2E2E2E' : 'transparent',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '8px',
                    color: view === 'grid' ? '#FFFFFF' : 'rgba(255, 255, 255, 0.4)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                  aria-label="Grid view"
                >
                  <LayoutGrid size={16} />
                </button>
                <button
                  onClick={() => setView('list')}
                  style={{
                    padding: '10px',
                    backgroundColor: view === 'list' ? '#2E2E2E' : 'transparent',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '8px',
                    color: view === 'list' ? '#FFFFFF' : 'rgba(255, 255, 255, 0.4)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                  aria-label="List view"
                >
                  <List size={16} />
                </button>
              </div>
            </div>

            {/* Category Chips */}
            {activeCategories.length > 0 && (
              <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', padding: '4px 0', marginBottom: '12px' }}>
                {activeCategories.map(cat => {
                  const config = CATEGORY_CONFIG[cat as EventCategory];
                  const Icon = config.icon;
                  const isSelected = selectedCategory === cat;
                  return (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(isSelected ? null : cat)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        whiteSpace: 'nowrap',
                        borderRadius: '100px',
                        fontSize: '0.75rem',
                        padding: '7px 16px',
                        border: isSelected ? '1px solid #C6A664' : '1px solid rgba(255, 255, 255, 0.1)',
                        backgroundColor: isSelected ? 'rgba(198, 166, 100, 0.15)' : 'transparent',
                        color: isSelected ? '#C6A664' : 'rgba(255, 255, 255, 0.5)',
                        cursor: 'pointer',
                        transition: 'all 200ms ease',
                        flexShrink: 0,
                      }}
                    >
                      <Icon style={{ width: '12px', height: '12px' }} />
                      <span>{config.label}</span>
                      {isSelected && <X style={{ width: '12px', height: '12px', marginLeft: '2px' }} />}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Members-only Toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                onClick={() => setShowMembersOnly(!showMembersOnly)}
                style={{
                  width: '36px',
                  height: '20px',
                  borderRadius: '10px',
                  border: 'none',
                  backgroundColor: showMembersOnly ? '#C6A664' : '#2E2E2E',
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'background-color 200ms ease',
                  flexShrink: 0,
                }}
                role="switch"
                aria-checked={showMembersOnly}
                aria-label="Show members-only events"
              >
                <div
                  style={{
                    width: '16px',
                    height: '16px',
                    borderRadius: '50%',
                    backgroundColor: '#FFFFFF',
                    position: 'absolute',
                    top: '2px',
                    left: showMembersOnly ? '18px' : '2px',
                    transition: 'left 200ms ease',
                  }}
                />
              </button>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8125rem', color: 'rgba(255, 255, 255, 0.5)' }}>
                <Crown style={{ width: '14px', height: '14px' }} />
                Members-only events
              </span>
            </div>
          </div>

          {/* Content */}
          {loading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '24px' }}>
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div
                  key={i}
                  style={{
                    borderRadius: '12px',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    overflow: 'hidden',
                    backgroundColor: '#1A1A1A',
                  }}
                >
                  <div style={{ height: '160px', backgroundColor: '#2E2E2E', animation: 'pulse 2s infinite' }} />
                  <div style={{ padding: '20px' }}>
                    <div style={{ height: '20px', width: '75%', backgroundColor: '#2E2E2E', borderRadius: '4px', marginBottom: '12px' }} />
                    <div style={{ height: '16px', width: '50%', backgroundColor: '#2E2E2E', borderRadius: '4px', marginBottom: '12px' }} />
                    <div style={{ height: '16px', width: '60%', backgroundColor: '#2E2E2E', borderRadius: '4px' }} />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredEvents.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 0' }}>
              <Calendar style={{ width: '48px', height: '48px', color: 'rgba(255, 255, 255, 0.15)', margin: '0 auto 16px' }} />
              <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#FFFFFF', marginBottom: '8px' }}>
                {hasActiveFilters ? 'No results found' : 'No upcoming events'}
              </h3>
              <p style={{ fontSize: '0.9375rem', color: 'rgba(255, 255, 255, 0.45)', marginBottom: '20px' }}>
                {hasActiveFilters ? 'Try a different search term or category.' : "Check back soon — we're planning something great."}
              </p>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  style={{
                    padding: '10px 24px',
                    backgroundColor: 'transparent',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '8px',
                    color: '#FFFFFF',
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                  }}
                >
                  Clear Filters
                </button>
              )}
            </div>
          ) : (
            <SectionErrorBoundary>
              <div>
                {/* Featured Event */}
                {featuredEvent && !hasActiveFilters && (
                  <div style={{ marginBottom: '48px' }}>
                    <FeaturedEventBanner
                      event={featuredEvent}
                      userHasTicket={userTicketIds.has(featuredEvent.id)}
                      isUserMember={isUserMember}
                      isLoggedIn={!!user}
                      capacity={featuredEvent.capacity}
                      ticketCount={ticketCounts[featuredEvent.id] || 0}
                      onClick={() => router.push(`/events/${featuredEvent.id}`)}
                    />
                  </div>
                )}

                {/* Events Grid/List */}
                {view === 'grid' ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '24px' }}>
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
                        isActiveMembersOnly={event.is_members_only || false}
                        userHasTicket={userTicketIds.has(event.id)}
                        isUserMember={isUserMember}
                        isLoggedIn={!!user}
                        category={event.category}
                        capacity={event.capacity}
                        ticketCount={ticketCounts[event.id] || 0}
                        tags={event.tags}
                        loading={rsvpLoadingId === event.id}
                        onGetTicket={() => handleGetTicket(event)}
                        onGuestPurchase={() => handleGuestPurchase(event)}
                        onClick={() => router.push(`/events/${event.id}`)}
                      />
                    ))}
                  </div>
                ) : (
                  <div>
                    {Object.entries(groupedEvents).map(([month, monthEvents]) => (
                      <div key={month} style={{ marginBottom: '40px' }}>
                        <h2
                          style={{
                            fontSize: '1.125rem',
                            fontWeight: 600,
                            color: '#FFFFFF',
                            marginBottom: '16px',
                            paddingBottom: '12px',
                            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                          }}
                        >
                          {month}
                        </h2>
                        <div>
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
                              isActiveMembersOnly={event.is_members_only || false}
                              userHasTicket={userTicketIds.has(event.id)}
                              isUserMember={isUserMember}
                              isLoggedIn={!!user}
                              category={event.category}
                              capacity={event.capacity}
                              ticketCount={ticketCounts[event.id] || 0}
                              tags={event.tags}
                              loading={rsvpLoadingId === event.id}
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
      <Footer />

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </>
  );
}