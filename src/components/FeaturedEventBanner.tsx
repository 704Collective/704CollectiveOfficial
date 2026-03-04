'use client';

import Image from 'next/image';
import { format } from 'date-fns';
import { MapPin, Calendar, Clock, ArrowRight } from 'lucide-react';
import { CategoryBadge, EventCategory } from '@/components/CategoryBadge';

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
  event, userHasTicket, isUserMember, capacity, ticketCount = 0, onClick,
}: FeaturedEventBannerProps) {
  const startDate = new Date(event.start_time);
  const spotsLeft = capacity != null ? capacity - ticketCount : null;
  const isSoldOut = spotsLeft != null && spotsLeft <= 0;
  const pct = capacity != null && capacity > 0 ? (ticketCount / capacity) * 100 : 0;

  return (
    <div
      onClick={onClick}
      style={{ position: 'relative', overflow: 'hidden', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer', transition: 'all 300ms ease', display: 'flex', flexDirection: 'row', minHeight: '240px' }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 40px rgba(0,0,0,0.4)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
    >
      {/* Image Side */}
      <div style={{ position: 'relative', width: '42%', overflow: 'hidden', flexShrink: 0 }}>
        {event.image_url ? (
          <Image src={event.image_url} alt={event.title} fill style={{ objectFit: 'cover' }} unoptimized={!event.image_url?.includes('supabase')} />
        ) : (
          <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #2E2E2E 0%, #1A1A1A 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: '3.5rem', fontWeight: 700, color: 'rgba(255,255,255,0.03)', letterSpacing: '-0.05em' }}>704</span>
          </div>
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, transparent 30%, #1A1A1A 100%)' }} />
        <div style={{ position: 'absolute', top: '16px', left: '16px', backgroundColor: '#FFFFFF', color: '#000000', fontSize: '0.625rem', fontWeight: 700, padding: '4px 12px', borderRadius: '100px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Up Next
        </div>
      </div>

      {/* Content Side */}
      <div style={{ flex: 1, padding: '28px 32px', backgroundColor: '#1A1A1A', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '14px' }}>
        {event.category && event.category !== 'other' && <div><CategoryBadge category={event.category as EventCategory} size="sm" /></div>}

        <h2 style={{ fontSize: 'clamp(1.25rem, 2.5vw, 1.625rem)', fontWeight: 700, color: '#FFFFFF', lineHeight: 1.2, letterSpacing: '-0.01em' }}>{event.title}</h2>

        {event.description && <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.4)', lineHeight: 1.6, maxWidth: '440px', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{event.description}</p>}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', fontSize: '0.8125rem', color: 'rgba(255,255,255,0.4)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Calendar style={{ width: '13px', height: '13px' }} />{format(startDate, 'EEEE, MMMM d')}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Clock style={{ width: '13px', height: '13px' }} />{format(startDate, 'h:mm a')}</span>
          {event.location_name && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><MapPin style={{ width: '13px', height: '13px' }} />{event.location_name}</span>}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '4px' }}>
          {userHasTicket ? (
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#4CAF50', backgroundColor: 'rgba(76,175,80,0.08)', padding: '8px 18px', borderRadius: '8px' }}>RSVP{"'"}d ✓</span>
          ) : isSoldOut ? (
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#E57373', backgroundColor: 'rgba(229,115,115,0.06)', padding: '8px 18px', borderRadius: '8px' }}>Sold Out</span>
          ) : (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '9px 22px', borderRadius: '8px', fontSize: '0.8125rem', fontWeight: 600, color: '#000', backgroundColor: '#FFF', border: 'none' }}>
              View Details <ArrowRight style={{ width: '14px', height: '14px' }} />
            </span>
          )}
          <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
            {isUserMember || (event.ticket_price ?? 0) <= 0 ? (
              <span style={{ color: '#4CAF50' }}>Free Event</span>
            ) : (
              <span style={{ color: 'rgba(255,255,255,0.5)' }}>${((event.ticket_price ?? 0) / 100).toFixed(0)}</span>
            )}
          </span>
          {spotsLeft != null && !isSoldOut && pct >= 70 && <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'rgba(255,255,255,0.45)' }}>{spotsLeft} spots left</span>}
        </div>
      </div>
    </div>
  );
}