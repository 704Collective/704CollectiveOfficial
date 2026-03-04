'use client';

import { format } from 'date-fns';
import { MapPin, Users, Loader2 } from 'lucide-react';
import { CategoryBadge, EventCategory } from '@/components/CategoryBadge';

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
  title, startTime, endTime, locationName, ticketPrice,
  isActiveMembersOnly, userHasTicket, isUserMember, isLoggedIn,
  category, capacity, ticketCount = 0, loading,
  onGetTicket, onGuestPurchase, onClick,
}: EventListItemProps) {
  const startDate = new Date(startTime);
  const dayNum = format(startDate, 'd');
  const dayAbbr = format(startDate, 'EEE').toUpperCase();
  const spotsLeft = capacity != null ? capacity - ticketCount : null;
  const isSoldOut = spotsLeft != null && spotsLeft <= 0;

  const renderCapacity = () => {
    if (capacity == null) return null;
    if (isSoldOut) return <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: '#E57373', backgroundColor: 'rgba(229,115,115,0.08)', padding: '3px 10px', borderRadius: '100px' }}>Sold Out</span>;
    const pct = (ticketCount / capacity) * 100;
    if (pct >= 70) return <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'rgba(255,255,255,0.45)', backgroundColor: 'rgba(255,255,255,0.05)', padding: '3px 10px', borderRadius: '100px' }}>{spotsLeft} spots left</span>;
    return null;
  };

  const renderButton = () => {
    if (userHasTicket) return <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '8px 18px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 600, color: '#4CAF50', backgroundColor: 'rgba(76,175,80,0.08)', border: '1px solid rgba(76,175,80,0.12)' }}>RSVP{"'"}d ✓</span>;
    if (isSoldOut) return <span style={{ padding: '8px 18px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 600, color: '#E57373', backgroundColor: 'rgba(229,115,115,0.06)' }}>Sold Out</span>;
    if (isActiveMembersOnly && !isUserMember) return <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '8px 18px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 600, color: 'rgba(255,255,255,0.35)', backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}><Users style={{ width: '12px', height: '12px' }} />Members Only</span>;
    return (
      <button
        disabled={loading}
        onClick={(e) => { e.stopPropagation(); isLoggedIn ? onGetTicket() : onGuestPurchase(); }}
        style={{ padding: '8px 22px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 600, color: '#000', backgroundColor: '#FFF', border: 'none', cursor: loading ? 'wait' : 'pointer', transition: 'all 200ms ease', display: 'inline-flex', alignItems: 'center', gap: '6px', opacity: loading ? 0.6 : 1 }}
        onMouseEnter={(e) => { if (!loading) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(255,255,255,0.08)'; } }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
      >
        {loading ? <Loader2 style={{ width: '14px', height: '14px', animation: 'spin 1s linear infinite' }} /> : 'RSVP'}
      </button>
    );
  };

  return (
    <div
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: '20px', padding: '20px 24px', backgroundColor: '#1A1A1A', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', marginBottom: '8px', cursor: 'pointer', transition: 'all 200ms ease' }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.3)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
    >
      <div style={{ textAlign: 'center', minWidth: '48px', flexShrink: 0 }}>
        <div style={{ fontSize: '1.625rem', fontWeight: 700, color: '#FFFFFF', lineHeight: 1, letterSpacing: '-0.02em' }}>{dayNum}</div>
        <div style={{ fontSize: '0.625rem', fontWeight: 600, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: '2px' }}>{dayAbbr}</div>
      </div>
      <div style={{ width: '1px', height: '40px', backgroundColor: 'rgba(255,255,255,0.06)', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
          <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#FFFFFF', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{title}</h3>
          {category && category !== 'other' && <CategoryBadge category={category as EventCategory} size="sm" />}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', marginTop: '4px' }}>
          <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>{format(startDate, 'EEE, MMM d')} • {format(startDate, 'h:mm a')}</span>
          {locationName && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)' }}><MapPin style={{ width: '11px', height: '11px' }} />{locationName}</span>}
        </div>
        <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          {ticketPrice <= 0 ? (
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#4CAF50' }}>Free</span>
          ) : (
            <>
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'rgba(255,255,255,0.55)' }}>Non-Member: ${(ticketPrice / 100).toFixed(0)}</span>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#4CAF50' }}>Free for Members</span>
            </>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
        {renderCapacity()}
        {renderButton()}
      </div>
    </div>
  );
}