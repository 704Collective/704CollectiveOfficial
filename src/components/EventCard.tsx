'use client';

import { Calendar, MapPin, Users } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EventCardProps {
  id: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  locationName?: string;
  imageUrl?: string;
  capacity?: number;
  isActiveMembersOnly?: boolean;
  ticketPrice?: number;
  userHasTicket?: boolean;
  isUserMember?: boolean;
  isLoggedIn?: boolean;
  onGetTicket?: () => void;
  onGuestPurchase?: () => void;
  onClick?: () => void;
}

export function EventCard({
  title,
  description,
  startTime,
  locationName,
  imageUrl,
  capacity,
  isActiveMembersOnly,
  ticketPrice = 1000,
  userHasTicket,
  isUserMember,
  isLoggedIn,
  onGetTicket,
  onGuestPurchase,
  onClick,
}: EventCardProps) {
  const date = new Date(startTime);
  const formattedDate = format(date, "EEE, MMM d");
  const formattedTime = format(date, "h:mm a");

  const getTicketButton = () => {
    if (userHasTicket) {
      return (
        <div className="status-badge status-active">
          <span>RSVP'd ✓</span>
        </div>
      );
    }

    if (!isLoggedIn) {
      if (!isActiveMembersOnly) {
        return (
        <Button variant="default" size="sm" className="min-h-[44px]" onClick={onGuestPurchase}>
            Purchase Ticket - ${(ticketPrice / 100).toFixed(0)}
          </Button>
        );
      }
      return (
        <Button variant="outline" size="sm" className="min-h-[44px]" onClick={onGetTicket}>
          Member? Login
        </Button>
      );
    }

    if (isUserMember) {
      return (
        <Button variant="default" size="sm" className="min-h-[44px] bg-green-600 hover:bg-green-700" onClick={onGetTicket}>
          RSVP Free
        </Button>
      );
    }

    return (
        <Button variant="default" size="sm" className="min-h-[44px]" onClick={onGetTicket}>
        Buy Ticket - ${(ticketPrice / 100).toFixed(0)}
      </Button>
    );
  };

  return (
    <div
      className={cn(
        "group cursor-pointer overflow-hidden transition-all duration-300 ease-out rounded-2xl bg-card border border-white/[0.08] shadow-none transform-gpu",
        "hover:bg-[hsl(0_0%_21%)] hover:border-white/[0.12] hover:scale-[1.02]",
      )}
      onClick={onClick}
    >
      {/* Image */}
      <div className="aspect-video max-h-[200px] sm:max-h-none w-full overflow-hidden relative bg-muted">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={title}
            loading="lazy"
            className="w-full h-full object-cover object-center transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-muted to-background flex items-center justify-center">
            <Calendar className="w-12 h-12 text-muted-foreground" />
          </div>
        )}

        {/* Members only badge */}
        {isActiveMembersOnly && (
          <div className="absolute top-3 left-3 px-2 py-1 rounded-md bg-black/70 backdrop-blur-sm border border-white/10">
            <span className="text-xs font-medium text-white">Members Only</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        <h3 className="font-medium text-lg text-foreground line-clamp-1 group-hover:text-white transition-colors">
          {title}
        </h3>

        {description && <p className="text-sm text-muted-foreground line-clamp-2">{description}</p>}

        <div className="flex flex-col gap-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            <span>
              {formattedDate} • {formattedTime}
            </span>
          </div>

          {locationName && (
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              <span className="line-clamp-1">{locationName}</span>
            </div>
          )}

          {capacity && (
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              <span>{capacity} spots</span>
            </div>
          )}
        </div>

        {/* Static pricing display */}
        {ticketPrice > 0 && (
          <div className="flex flex-col gap-0.5">
            <span className="text-sm md:text-base font-bold text-foreground">Non-Member: ${(ticketPrice / 100).toFixed(0)}</span>
            <span className="text-xs md:text-sm font-semibold text-green-500">Free for Members</span>
          </div>
        )}

        {/* Ticket button */}
        <div className="pt-2" onClick={(e) => e.stopPropagation()}>
          {getTicketButton()}
        </div>
      </div>
    </div>
  );
}