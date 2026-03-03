'use client';

import { format } from 'date-fns';
import { MapPin, Users, Clock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CategoryBadge, EventCategory } from '@/components/CategoryBadge';
import { EventPlaceholder } from '@/components/EventPlaceholder';

interface EventGridCardProps {
  id: string;
  title: string;
  description?: string;
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

export function EventGridCard({
  title,
  description,
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
}: EventGridCardProps) {
  const startDate = new Date(startTime);
  const endDate = new Date(endTime);
  const hasImage = !!imageUrl;

  const visibleTags = tags?.slice(0, 3) || [];
  const extraTagCount = (tags?.length || 0) - 3;

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
        <Badge className="bg-primary/20 text-primary border-primary/30 hover:bg-primary/30">
          RSVP'd ✓
        </Badge>
      );
    }

    if (isSoldOut) {
      return (
        <Badge variant="destructive" className="text-xs">
          Sold Out
        </Badge>
      );
    }

    if (isActiveMembersOnly && !isUserMember) {
      return (
        <Badge variant="outline" className="border-muted-foreground/30 text-muted-foreground">
          <Users className="w-3 h-3 mr-1" />
          Members Only
        </Badge>
      );
    }

    return (
      <Button 
        size="sm" 
        className="bg-primary hover:bg-primary/90 text-primary-foreground min-h-[44px] min-w-[44px]"
        disabled={loading}
        onClick={(e) => {
          e.stopPropagation();
          if (isLoggedIn) {
            onGetTicket();
          } else {
            onGuestPurchase();
          }
        }}
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'RSVP'}
      </Button>
    );
  };

  // Compact row layout for events without images
  if (!hasImage) {
    return (
      <div
        onClick={onClick}
        className="group bg-card rounded-2xl border border-white/[0.08] overflow-hidden hover:bg-[hsl(0_0%_21%)] hover:border-white/[0.12] transition-all duration-300 ease-out cursor-pointer col-span-full shadow-none hover:scale-[1.01] transform-gpu"
      >
        <div className="flex items-center gap-3 sm:gap-4 p-4 sm:p-5">
          {/* Date badge */}
          <div className="flex-shrink-0 w-12 sm:w-14 text-center">
            <div className="text-xl sm:text-2xl font-bold text-foreground leading-none">{format(startDate, 'd')}</div>
            <div className="text-xs text-muted-foreground uppercase font-medium">{format(startDate, 'MMM')}</div>
          </div>

          {/* Event info */}
          <div className="flex-1 min-w-0 space-y-0.5 sm:space-y-1">
            <h3 className="font-semibold text-foreground text-sm sm:text-base leading-tight group-hover:text-primary transition-colors line-clamp-1 sm:line-clamp-2">
              {title}
            </h3>
            <div className="flex items-center gap-1.5 text-xs sm:text-sm text-muted-foreground">
              <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0" />
              <span className="truncate">{format(startDate, 'EEE, MMM d')} • {format(startDate, 'h:mm a')}</span>
            </div>
            {locationName && (
              <div className="flex items-center gap-1.5 text-xs sm:text-sm text-muted-foreground">
                <MapPin className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0" />
                <span className="truncate">{locationName}</span>
              </div>
            )}
            {/* Price - visible on mobile */}
            <div className="flex items-center gap-2 text-xs sm:text-sm">
            {ticketPrice <= 0 ? (
                <span className="text-sm md:text-base font-semibold text-green-500">Free</span>
              ) : (
                <div className="flex flex-col">
                  <span className="text-sm md:text-base font-bold text-foreground">Non-Member: ${(ticketPrice / 100).toFixed(0)}</span>
                  <span className="text-xs md:text-sm font-semibold text-green-500">Free for Members</span>
                </div>
              )}
              <span className="sm:hidden">{renderCapacityBadge()}</span>
            </div>
          </div>

          {/* Action + capacity */}
          <div className="flex-shrink-0 flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-sm">
              {renderCapacityBadge()}
            </div>
            {renderActionButton()}
          </div>
        </div>
      </div>
    );
  }

  // Standard card layout for events with images
  return (
    <div
      onClick={onClick}
      className="group bg-card rounded-2xl border border-white/[0.08] overflow-hidden hover:bg-[hsl(0_0%_21%)] hover:border-white/[0.12] transition-all duration-300 ease-out cursor-pointer shadow-none hover:scale-[1.02] transform-gpu"
    >
      {/* Image Section */}
      <div className="relative aspect-video max-h-[200px] sm:max-h-none overflow-hidden bg-muted">
        <img 
          src={imageUrl} 
          alt={title} 
          loading="lazy"
          className="w-full h-full object-cover object-center transition-transform duration-500 group-hover:scale-105"
        />
        
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-transparent to-transparent" />
        
        {/* Date badge */}
        <div className="absolute top-3 left-3 bg-background/95 backdrop-blur-sm rounded-lg px-3 py-2 text-center shadow-lg">
          <div className="text-xl font-bold text-foreground leading-none">{format(startDate, 'd')}</div>
          <div className="text-xs text-muted-foreground uppercase font-medium">{format(startDate, 'MMM')}</div>
        </div>
        
        {/* Category badge */}
        {category && category !== 'other' && (
          <div className="absolute top-3 right-3">
            <CategoryBadge category={category as EventCategory} size="sm" />
          </div>
        )}
      </div>

      {/* Content Section */}
      <div className="p-4 sm:p-6 space-y-3">
        <h3 className="font-semibold text-foreground text-lg leading-tight line-clamp-2 group-hover:text-primary transition-colors">
          {title}
        </h3>
        
        {description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {description}
          </p>
        )}

        {visibleTags.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {visibleTags.map(tag => (
              <span key={tag} className="px-2 py-0.5 rounded text-xs bg-muted text-muted-foreground">{tag}</span>
            ))}
            {extraTagCount > 0 && (
              <span className="text-xs text-muted-foreground">+{extraTagCount} more</span>
            )}
          </div>
        )}
        
        <div className="flex flex-col gap-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 flex-shrink-0" />
            <span>{format(startDate, 'EEE, MMM d')} • {format(startDate, 'h:mm a')}</span>
          </div>
          {locationName && (
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">{locationName}</span>
            </div>
          )}
        </div>
        
        <div className="flex items-center justify-between pt-2 border-t border-border/50">
          <div className="flex items-center gap-2 text-sm">
            {ticketPrice <= 0 ? (
              <span className="text-sm md:text-base font-semibold text-green-500">Free</span>
            ) : (
              <div className="flex flex-col">
                <span className="text-sm md:text-base font-bold text-foreground">Non-Member: ${(ticketPrice / 100).toFixed(0)}</span>
                <span className="text-xs md:text-sm font-semibold text-green-500">Free for Members</span>
              </div>
            )}
            {renderCapacityBadge()}
          </div>
          {renderActionButton()}
        </div>
      </div>
    </div>
  );
}
