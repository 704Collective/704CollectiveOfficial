'use client';

import { format } from 'date-fns';
import { MapPin, Calendar, Clock, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CategoryBadge, EventCategory } from '@/components/CategoryBadge';
import { EventPlaceholder } from '@/components/EventPlaceholder';

interface Event {
  id: string;
  title: string;
  description?: string | null;
  start_time: string;
  end_time: string;
  location_name?: string | null;
  image_url?: string | null;
  ticket_price: number | null;
  is_members_only: boolean | null;
  category?: string | null;
}

interface FeaturedEventBannerProps {
  event: Event;
  userHasTicket: boolean;
  isUserMember: boolean;
  isLoggedIn: boolean;
  capacity?: number | null;
  ticketCount?: number;
  onClick: () => void;
}

export function FeaturedEventBanner({
  event,
  userHasTicket,
  isUserMember,
  isLoggedIn,
  capacity,
  ticketCount = 0,
  onClick,
}: FeaturedEventBannerProps) {
  const startDate = new Date(event.start_time);

  const spotsLeft = capacity != null ? capacity - ticketCount : null;
  const isSoldOut = spotsLeft != null && spotsLeft <= 0;
  const fillPercent = capacity != null && capacity > 0 ? (ticketCount / capacity) * 100 : 0;

  const renderCapacityBadge = () => {
    if (capacity == null) return null;
    if (isSoldOut) {
      return <Badge className="bg-destructive/10 text-destructive border-destructive/20">Sold Out</Badge>;
    }
    const isAlmostFull = fillPercent >= 80;
    return (
      <Badge className={isAlmostFull ? 'bg-orange-500/10 text-orange-600 border-orange-500/20' : 'bg-green-500/10 text-green-600 border-green-500/20'}>
        {spotsLeft} {spotsLeft === 1 ? 'spot' : 'spots'} left
      </Badge>
    );
  };

  return (
    <div
      onClick={onClick}
      className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[hsl(0_0%_21%)] to-card border border-white/[0.10] hover:border-white/[0.15] transition-all duration-300 ease-out cursor-pointer group shadow-none hover:scale-[1.01] transform-gpu"
    >
      <div className="flex flex-col md:flex-row">
        {/* Image */}
        <div className="relative md:w-2/5 aspect-video max-h-[200px] sm:max-h-none md:aspect-auto overflow-hidden bg-muted">
          {event.image_url ? (
            <img
              src={event.image_url}
              alt={event.title}
              loading="lazy"
              className="w-full h-full object-cover object-center transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <EventPlaceholder size="lg" className="h-full min-h-[200px]" />
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent to-card/80 hidden md:block" />
          <div className="absolute inset-0 bg-gradient-to-t from-card to-transparent md:hidden" />
          
          {/* Featured label */}
          <div className="absolute top-4 left-4">
            <Badge className="bg-primary text-primary-foreground font-semibold px-3 py-1">
              Up Next
            </Badge>
          </div>
        </div>

        {/* Content */}
        <div className="relative flex-1 p-6 md:p-8 flex flex-col justify-center">
          <div className="space-y-4">
            {event.category && event.category !== 'other' && (
              <CategoryBadge category={event.category as EventCategory} size="sm" />
            )}
            
            <h2 className="text-2xl md:text-3xl font-semibold text-foreground group-hover:text-primary transition-colors">
              {event.title}
            </h2>
            
            {event.description && (
              <p className="text-muted-foreground line-clamp-2 max-w-xl">
                {event.description}
              </p>
            )}

            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                <span>{format(startDate, 'EEEE, MMMM d')}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                <span>{format(startDate, 'h:mm a')}</span>
              </div>
              {event.location_name && (
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  <span>{event.location_name}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-4 pt-2">
              {userHasTicket ? (
                <Badge className="bg-primary/20 text-primary border-primary/30">
                  RSVP'd ✓
                </Badge>
              ) : isSoldOut ? (
                <Badge variant="destructive">Sold Out</Badge>
              ) : (
                <Button className="gap-2">
                  View Details
                  <ArrowRight className="w-4 h-4" />
                </Button>
              )}
              
              <div className="text-sm">
                {isUserMember || (event.ticket_price ?? 0) <= 0 ? (
                  <span className="text-primary font-semibold">Free Event</span>
                ) : (
                  <span className="font-semibold text-foreground">
                    ${((event.ticket_price ?? 0) / 100).toFixed(0)}
                  </span>
                )}
              </div>

              {renderCapacityBadge()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
