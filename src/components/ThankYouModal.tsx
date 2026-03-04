'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

type ThankYouType = 'new_member' | 'member' | 'guest';

interface ThankYouModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: ThankYouType;
  event?: {
    title: string;
    description: string;
    startTime: string;
    endTime: string;
    location: string;
  };
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
  const descs: Record<ThankYouType, string> = { new_member: 'Your membership is active. RSVP for upcoming events now!', member: "We'll see you there! Check out more events happening soon.", guest: 'Check out more upcoming events — or become a member for unlimited free access!' };

  const btn = (primary: boolean): React.CSSProperties => ({
    display: 'block', width: '100%', padding: '14px 24px', borderRadius: '10px', fontSize: '0.875rem',
    fontWeight: 600, textAlign: 'center', cursor: 'pointer', transition: 'all 200ms ease', textDecoration: 'none',
    border: primary ? 'none' : '1px solid rgba(255,255,255,0.1)',
    backgroundColor: primary ? '#FFFFFF' : 'transparent',
    color: primary ? '#000000' : 'rgba(255,255,255,0.6)',
  });

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div onClick={() => onOpenChange(false)} style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }} />
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
            <button onClick={() => nav('/events')} style={btn(true)}>Browse More Events</button>
            <button onClick={() => nav('/dashboard')} style={btn(false)}>Go to Member Portal</button>
            <button onClick={() => onOpenChange(false)} style={{ ...btn(false), border: 'none', color: 'rgba(255,255,255,0.3)', fontSize: '0.8125rem' }}>Done</button>
          </>}
          {type === 'guest' && <>
            <button onClick={() => nav('/events')} style={btn(true)}>Browse More Events</button>
            <button onClick={() => nav('/social')} style={btn(false)}>Become a Member — $30/mo</button>
            <button onClick={() => onOpenChange(false)} style={{ ...btn(false), border: 'none', color: 'rgba(255,255,255,0.3)', fontSize: '0.8125rem' }}>Done</button>
          </>}
        </div>
      </div>
    </div>
  );
}