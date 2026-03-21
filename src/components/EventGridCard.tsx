'use client';

import Image from 'next/image';
import { format } from 'date-fns';
import { MapPin, Clock, Users, Loader2, Lock } from 'lucide-react';
import { CategoryBadge, EventCategory } from '@/components/CategoryBadge';

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
  isBusinessOnly?: boolean;
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
  title, description, startTime, locationName, imageUrl, ticketPrice,
  isActiveMembersOnly, isBusinessOnly = false, userHasTicket, isUserMember, isLoggedIn,
  category, capacity, ticketCount = 0, loading,
  onGetTicket, onGuestPurchase, onClick,
}: EventGridCardProps) {
  const startDate = new Date(startTime);
  const hasImage = !!imageUrl;
  const spotsLeft = capacity != null ? capacity - ticketCount : null;
  const isSoldOut = spotsLeft != null && spotsLeft <= 0;
  const pct = capacity != null && capacity > 0 ? (ticketCount / capacity) * 100 : 0;

  // Privacy: hide location + time details for members-only events from non-members
  const isPrivate = isActiveMembersOnly && !isUserMember;
  const memberLabel = isBusinessOnly ? 'Business Members Only' : 'Social Members Only';

  const renderCapacity = () => {
    if (isPrivate) return null;
    if (capacity == null) return null;
    if (isSoldOut) return <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: '#E57373' }}>Sold Out</span>;
    if (pct >= 70) return <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'rgba(255,255,255,0.45)' }}>{spotsLeft} spots left</span>;
    return null;
  };

  const renderButton = () => {
    if (isPrivate) {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.6875rem', color: 'rgba(255,255,255,0.35)' }}>
          <Lock style={{ width: '11px', height: '11px' }} /> {memberLabel}
        </span>
      );
    }
    if (userHasTicket) return <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#4CAF50' }}>RSVP{"'"}d ✓</span>;
    if (isSoldOut) return null;
    return (
      <button
        disabled={loading}
        onClick={(e) => { e.stopPropagation(); isLoggedIn ? onGetTicket() : onGuestPurchase(); }}
        style={{ padding: '7px 18px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 600, color: '#000', backgroundColor: '#FFF', border: 'none', cursor: loading ? 'wait' : 'pointer', transition: 'all 200ms ease', opacity: loading ? 0.6 : 1 }}
        onMouseEnter={(e) => { if (!loading) e.currentTarget.style.boxShadow = '0 2px 10px rgba(255,255,255,0.08)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none'; }}
      >
        {loading ? <Loader2 style={{ width: '14px', height: '14px', animation: 'spin 1s linear infinite' }} /> : 'RSVP'}
      </button>
    );
  };

  return (
    <div
      onClick={onClick}
      style={{
        backgroundColor: '#1A1A1A',
        border: isBusinessOnly
          ? '1px solid rgba(198,166,100,0.35)'
          : '1px solid rgba(255,255,255,0.06)',
        borderRadius: '16px',
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'all 200ms ease',
        display: 'flex',
        flexDirection: 'column',
        // Gold aura for business-only events
        boxShadow: isBusinessOnly ? '0 0 16px rgba(198,166,100,0.08)' : 'none',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = isBusinessOnly ? 'rgba(198,166,100,0.55)' : 'rgba(255,255,255,0.12)';
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = isBusinessOnly
          ? '0 8px 32px rgba(198,166,100,0.12)'
          : '0 8px 32px rgba(0,0,0,0.3)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = isBusinessOnly ? 'rgba(198,166,100,0.35)' : 'rgba(255,255,255,0.06)';
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = isBusinessOnly ? '0 0 16px rgba(198,166,100,0.08)' : 'none';
      }}
    >
      {/* Image / Placeholder */}
      <div style={{ position: 'relative', height: '180px', overflow: 'hidden' }}>
        {hasImage ? (
          <Image src={imageUrl} alt={title} fill style={{ objectFit: 'cover', transition: 'transform 500ms ease' }} unoptimized={!imageUrl?.includes('supabase')} />
        ) : (
          <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #2E2E2E 0%, #1A1A1A 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: '2.5rem', fontWeight: 700, color: 'rgba(255,255,255,0.03)', letterSpacing: '-0.05em' }}>704</span>
          </div>
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(26,26,26,0.9) 0%, transparent 60%)' }} />

        {/* Date badge */}
        <div style={{ position: 'absolute', top: '12px', left: '12px', backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', borderRadius: '10px', padding: '8px 12px', textAlign: 'center', minWidth: '44px' }}>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#FFFFFF', lineHeight: 1 }}>{format(startDate, 'd')}</div>
          <div style={{ fontSize: '0.5625rem', fontWeight: 600, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: '2px' }}>{format(startDate, 'MMM')}</div>
        </div>

        {/* Category badge */}
        {category && category !== 'other' && (
          <div style={{ position: 'absolute', top: '12px', right: '12px' }}>
            <CategoryBadge category={category as EventCategory} size="sm" />
          </div>
        )}

        {/* Members-only overlay badge */}
        {isActiveMembersOnly && (
          <div style={{
            position: 'absolute', bottom: '12px', left: '12px',
            display: 'inline-flex', alignItems: 'center', gap: '4px',
            backgroundColor: isBusinessOnly ? 'rgba(198,166,100,0.15)' : 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(8px)',
            border: isBusinessOnly ? '1px solid rgba(198,166,100,0.3)' : '1px solid rgba(255,255,255,0.1)',
            borderRadius: '6px',
            padding: '4px 10px',
          }}>
            <Lock style={{ width: '10px', height: '10px', color: isBusinessOnly ? '#C6A664' : 'rgba(255,255,255,0.6)' }} />
            <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: isBusinessOnly ? '#C6A664' : 'rgba(255,255,255,0.7)' }}>
              {memberLabel}
            </span>
          </div>
        )}
      </div>

      <div style={{ padding: '20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <h3 style={{ fontSize: '1.0625rem', fontWeight: 600, color: '#FFFFFF', marginBottom: '8px', lineHeight: 1.3 }}>{title}</h3>

        {description && (
          <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.35)', lineHeight: 1.5, marginBottom: '12px', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {description}
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
          {/* Date always shown, time hidden for private events */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>
            <Clock style={{ width: '12px', height: '12px', flexShrink: 0 }} />
            {isPrivate
              ? format(startDate, 'EEE, MMM d')
              : `${format(startDate, 'EEE, MMM d')} • ${format(startDate, 'h:mm a')}`
            }
          </div>

          {/* Location hidden for private events */}
          {!isPrivate && locationName && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)' }}>
              <MapPin style={{ width: '12px', height: '12px', flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{locationName}</span>
            </div>
          )}

          {/* Private location placeholder */}
          {isPrivate && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'rgba(255,255,255,0.2)' }}>
              <MapPin style={{ width: '12px', height: '12px', flexShrink: 0 }} />
              <span>Location visible to members</span>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {!isPrivate && (
              ticketPrice <= 0 ? (
                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#4CAF50' }}>Free</span>
              ) : (
                <div>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'rgba(255,255,255,0.55)' }}>${(ticketPrice / 100).toFixed(0)}</span>
                  <span style={{ fontSize: '0.6875rem', color: '#4CAF50', fontWeight: 600, marginLeft: '8px' }}>Free for Members</span>
                </div>
              )
            )}
            {renderCapacity()}
          </div>
          {renderButton()}
        </div>
      </div>
    </div>
  );
}