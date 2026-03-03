'use client';

import { format } from 'date-fns';
import { MapPin, Users, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CategoryBadge, EventCategory } from '@/components/CategoryBadge';
import { EventPlaceholder } from '@/components/EventPlaceholder';

interface EventListItemProps {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  locationName?: string;
  imageUrl?: string;
  ticketPrice: number;
  isActiveMembersOnly: boolean;
  userHasTicket: boolean;
  isUserMember: boolean;
  isLoggedIn: boolean;
  category?: string | null;
  capacity?: number | null;
  ticketCount?: number;
  tags?: string[] | null;
  loading?: boolean;
  onGetTicket: () => void;
  onGuestPurchase: () => void;
  onClick: () => void;
}

export function EventListItem({
  title,
  startTime,
  endTime,
  locationName,
  imageUrl,
  ticketPrice,
  isActiveMembersOnly,
  userHasTicket,
  isUserMember,
  isLoggedIn,
  category,
  capacity,
  ticketCount = 0,
  tags,
  loading,
  onGetTicket,
  onGuestPurchase,
  onClick,
}: EventListItemProps) {
  const startDate = new Date(startTime);
  const endDate = new Date(endTime);

  const spotsLeft = capacity != null ? capacity - ticketCount : null;
  const isSoldOut = spotsLeft != null && spotsLeft <= 0;
  const fillPercent = capacity != null && capacity > 0 ? (ticketCount / capacity) * 100 : 0;

  const renderCapacityBadge = () => {
    if (capacity == null) return null;
    if (isSoldOut) {
      return <Badge className="bg-destructive/10 text-destructive border-destructive/20 text-xs">Sold Out</Badge>;
    }
    const isAlmostFull = fillPercent >= 80;
    return (
      <Badge className={`text-xs ${isAlmostFull ? 'bg-orange-500/10 text-orange-600 border-orange-500/20' : 'bg-green-500/10 text-green-600 border-green-500/20'}`}>
        {spotsLeft} {spotsLeft === 1 ? 'spot' : 'spots'} left
      </Badge>
    );
  };

  const renderActionButton = () => {
    if (userHasTicket) {
      return (
        <Badge variant="secondary" className="bg-primary/10 text-primary whitespace-nowrap">
          RSVP'd ✓
        </Badge>
      );
    }

    if (isSoldOut) {
      return (
        <Badge variant="destructive" className="whitespace-nowrap text-xs">
          Sold Out
        </Badge>
      );
    }

    if (isActiveMembersOnly && !isUserMember) {
      return (
        <Badge variant="outline" className="whitespace-nowrap">
          <Users className="w-3 h-3 mr-1" />
          Members Only
        </Badge>
      );
    }

    return (
      <Button size="sm" variant="outline" className="min-h-[44px] min-w-[44px]" disabled={loading}>
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'RSVP'}
      </Button>
    );
  };

  return (
    <div
      onClick={onClick}
      className="flex items-center gap-4 p-4 bg-card rounded-lg border border-border hover:border-primary/30 hover:shadow-sm transition-all cursor-pointer group"
    >
      {/* Date Badge */}
      <div className="flex-shrink-0 w-14 text-center">
        <div className="text-2xl font-bold text-foreground">{format(startDate, 'd')}</div>
        <div className="text-xs text-muted-foreground uppercase">{format(startDate, 'EEE')}</div>
      </div>

      {/* Thumbnail */}
      {imageUrl ? (
        <div className="flex-shrink-0 w-12 h-12 rounded-md overflow-hidden bg-muted">
          <img src={imageUrl} alt={title} loading="lazy" className="w-full h-full object-cover object-center" />
        </div>
      ) : (
        <EventPlaceholder size="sm" />
      )}

      {/* Event Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors truncate">
            {title}
          </h3>
          {category && category !== 'other' && (
            <CategoryBadge category={category as EventCategory} size="sm" />
          )}
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground mt-0.5">
          <span>
            {format(startDate, 'h:mm a')} - {format(endDate, 'h:mm a')}
          </span>
          {locationName && (
            <>
              <span className="text-border">•</span>
              <span className="flex items-center gap-1 truncate">
                <MapPin className="w-3 h-3 flex-shrink-0" />
                {locationName}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {ticketPrice <= 0 ? (
            <span className="text-sm font-semibold text-green-500">Free</span>
          ) : (
            <>
              <span className="text-sm font-bold text-foreground">Non-Member: ${(ticketPrice / 100).toFixed(0)}</span>
              <span className="text-xs font-semibold text-green-500">Free for Members</span>
            </>
          )}
        </div>
        {tags && tags.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap mt-1">
            {tags.slice(0, 3).map(tag => (
              <span key={tag} className="px-2 py-0.5 rounded text-xs bg-muted text-muted-foreground">{tag}</span>
            ))}
            {tags.length > 3 && (
              <span className="text-xs text-muted-foreground">+{tags.length - 3} more</span>
            )}
          </div>
        )}
      </div>

      {/* Action */}
      <div className="flex-shrink-0 flex items-center gap-2">
        {renderCapacityBadge()}
        {renderActionButton()}
      </div>
    </div>
  );
}
