'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { SOCIAL_TIER } from '@/lib/pricing';

type ThankYouType = 'new_member' | 'member' | 'guest';

export interface ThankYouEvent {
  title: string;
  startTime: string;
  endTime: string;
  location: string;
  description?: string;
}

interface ThankYouModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: ThankYouType;
  event?: ThankYouEvent;
}

function toGCalTime(iso: string): string {
  return iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function downloadIcs(title: string, startTime: string, endTime: string, location: string) {
  const fmt = (iso: string) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//704 Collective//NONSGML v1.0//EN',
    'BEGIN:VEVENT',
    `DTSTART:${fmt(startTime)}`,
    `DTEND:${fmt(endTime)}`,
    `SUMMARY:${title}`,
    `LOCATION:${location}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const blob = new Blob([ics], { type: 'text/calendar' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title.replace(/\s+/g, '-')}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

export function ThankYouModal({ open, onOpenChange, type, event }: ThankYouModalProps) {
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onOpenChange(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  const nav = (path: string) => { onOpenChange(false); router.push(path); };

  const titles: Record<ThankYouType, string> = { new_member: 'Welcome to 704 Collective!', member: "You're RSVP'd!", guest: 'Ticket Confirmed!' };
  const descs: Record<ThankYouType, string> = { new_member: 'Your membership is active. RSVP for upcoming events now!', member: "We'll see you there! Check out more events happening soon.", guest: 'Check out more upcoming events - or become a member for unlimited free access!' };

  const btn = (primary: boolean): React.CSSProperties => ({
    display: 'block', width: '100%', padding: '14px 24px', borderRadius: '10px', fontSize: '0.875rem',
    fontWeight: 600, textAlign: 'center', cursor: 'pointer', transition: 'all 200ms ease', textDecoration: 'none',
    border: primary ? 'none' : '1px solid rgba(255,255,255,0.1)',
    backgroundColor: primary ? '#FFFFFF' : 'transparent',
    color: primary ? '#000000' : 'rgba(255,255,255,0.6)',
  });

  const outlineBtn: React.CSSProperties = {
    flex: 1, padding: '10px 14px', borderRadius: '8px', fontSize: '0.8125rem',
    fontWeight: 600, textAlign: 'center', cursor: 'pointer', transition: 'all 200ms ease',
    textDecoration: 'none', border: '1px solid rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.7)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
  };

  const gcalUrl = event
    ? `https://calendar.google.com/calendar/render?action=TEMPLATE` +
      `&text=${encodeURIComponent(event.title)}` +
      `&dates=${toGCalTime(event.startTime)}/${toGCalTime(event.endTime)}` +
      `&location=${encodeURIComponent(event.location)}`
    : '#';

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      {/* Backdrop - intentionally not click-to-dismiss so modal persists until user makes a choice */}
      <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }} />
      <div role="dialog" aria-modal="true" style={{ position: 'relative', backgroundColor: '#1A1A1A', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', padding: '44px 36px', maxWidth: '420px', width: '100%', textAlign: 'center', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
        {/* Icon */}
        <div style={{ width: '60px', height: '60px', borderRadius: '50%', backgroundColor: type === 'member' ? 'rgba(76,175,80,0.08)' : 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          {type === 'member' ? (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4CAF50" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          ) : (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5.8 11.3 2 22l10.7-3.79" /><path d="M4 3h.01" /><path d="M22 8h.01" /><path d="M15 2h.01" /><path d="M22 20h.01" />
              <path d="m22 2-2.24.75a2.9 2.9 0 0 0-1.96 3.12v0c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10" />
              <path d="m22 13-.82-.33c-.86-.34-1.82.2-1.98 1.11v0c-.11.7-.72 1.22-1.43 1.22H17" />
              <path d="m11 2 .33.82c.34.86-.2 1.82-1.11 1.98v0C9.52 4.9 9 5.52 9 6.23V7" />
              <path d="M11 13c1.93 1.93 2.83 4.17 2 5-.83.83-3.07-.07-5-2-1.93-1.93-2.83-4.17-2-5 .83-.83 3.07.07 5 2Z" />
            </svg>
          )}
        </div>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#FFFFFF', marginBottom: '8px' }}>{titles[type]}</h2>
        <p style={{ fontSize: '0.9375rem', color: 'rgba(255,255,255,0.45)', lineHeight: 1.6, marginBottom: '28px' }}>{descs[type]}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {type === 'new_member' && <>
            <button onClick={() => nav('/dashboard')} style={btn(true)}>Go to Member Portal →</button>
            <button onClick={() => nav('/events')} style={btn(false)}>Browse Upcoming Events</button>
          </>}
          {type === 'member' && <>
            {event && (
              <div style={{ marginBottom: '4px' }}>
                <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Add to your calendar:</p>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <a
                    href={gcalUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={outlineBtn}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                    Google Calendar
                  </a>
                  <button
                    onClick={() => downloadIcs(event.title, event.startTime, event.endTime, event.location)}
                    style={outlineBtn as React.CSSProperties}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                    Apple / ICS
                  </button>
                </div>
              </div>
            )}
            <button onClick={() => nav('/events')} style={btn(true)}>Browse Other Events</button>
            <button onClick={() => nav('/dashboard')} style={btn(false)}>Go to Member Portal</button>
            <button onClick={() => onOpenChange(false)} style={{ ...btn(false), border: 'none', color: 'rgba(255,255,255,0.3)', fontSize: '0.8125rem' }}>Close</button>
          </>}
          {type === 'guest' && <>
            <button onClick={() => nav('/events')} style={btn(true)}>Browse More Events</button>
            <button onClick={() => nav('/social')} style={btn(false)}>{SOCIAL_TIER.ctaLabelLong}</button>
            <button onClick={() => onOpenChange(false)} style={{ ...btn(false), border: 'none', color: 'rgba(255,255,255,0.3)', fontSize: '0.8125rem' }}>Done</button>
          </>}
        </div>
      </div>
    </div>
  );
}
