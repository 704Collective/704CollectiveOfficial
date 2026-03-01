'use client';

import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useMemo } from 'react';
import { Header } from '@/components/Header';
import { HeroSection } from '@/components/HeroSection';
import { HowItWorksSection } from '@/components/HowItWorksSection';
import { FeaturesSection } from '@/components/FeaturesSection';
import { IsItRightSection } from '@/components/IsItRightSection';
import { ValueBreakdownSection } from '@/components/ValueBreakdownSection';
import { MembershipCtaSection } from '@/components/MembershipCtaSection';
import { Testimonials } from '@/components/Testimonials';
import { EventsSection } from '@/components/EventsSection';
import { FaqSection } from '@/components/FaqSection';
import { FinalCtaSection } from '@/components/FinalCtaSection';
import { ThankYouModal } from '@/components/ThankYouModal';
import { SEOJsonLd } from '@/components/SEOJsonLd';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useTicketActions } from '@/hooks/useTicketActions';
import { supabase } from '@/integrations/supabase/client';
import { format, addDays } from 'date-fns';

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
}

export default function Index() {
  const { user, isMember, isLoading } = useAuth();
  const router = useRouter();
  usePageTitle("704 Collective | Charlotte's Young Professionals Community");

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

  // Redirect logged-in users to dashboard
  useEffect(() => {
    if (!isLoading && user) {
      router.push('/dashboard', { replace: true });
    }
  }, [user, isLoading, navigate]);

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    const now = new Date();
    const thirtyDaysFromNow = addDays(now, 30);

    const { data, error } = await supabase
      .from('events')
      .select('*')
      .gte('start_time', now.toISOString())
      .lte('start_time', thirtyDaysFromNow.toISOString())
      .order('start_time', { ascending: true })
      .limit(6);

    if (!error && data) {
      setEvents(data);
    }
    setLoading(false);
  };

  const monthsTitle = useMemo(() => {
    if (events.length === 0) return 'Upcoming Events';
    const months = new Set(events.map(e => format(new Date(e.start_time), 'MMMM')));
    const monthArray = Array.from(months);
    if (monthArray.length === 1) return `${monthArray[0]} Events`;
    if (monthArray.length === 2) return `${monthArray[0]} & ${monthArray[1]} Events`;
    return 'Upcoming Events';
  }, [events]);

  const handleGuestPurchase = (eventId: string) => {
    router.push(`/events/${eventId}`);
  };

  const handleGetTicket = async (event: Event) => {
    if (!user) {
      router.push('/login');
      return;
    }

    if (isMember) {
      await registerMemberTicket(event);
    } else {
      router.push(`/events/${event.id}`);
    }
  };

  // Prevent flash of sales page
  if (isLoading || user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header user={null} isAdmin={false} />
      <SEOJsonLd type="organization" />

      <main>
        <HeroSection />
        <HowItWorksSection />
        <FeaturesSection />
        <IsItRightSection />
        <ValueBreakdownSection />
        <Testimonials />
        <MembershipCtaSection />

        <div id="events-section">
          <EventsSection
            events={events}
            loading={loading}
            title={monthsTitle}
            isMember={false}
            isLoggedIn={false}
            userTicketEventIds={userTicketIds}
            rsvpLoadingId={rsvpLoadingId}
            onGuestPurchase={handleGuestPurchase}
            onGetTicket={handleGetTicket}
          />
        </div>

        <FaqSection />
        <FinalCtaSection />
      </main>

      <ThankYouModal 
        open={showThankYou} 
        onOpenChange={setShowThankYou} 
        type={thankYouType} 
      />
    </div>
  );
}
