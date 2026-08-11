'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/hooks/useAuth';

const EVENT_ID = process.env.NEXT_PUBLIC_EXCHANGE_EVENT_ID || '';
const GOLD = '#C6A664';
const ERR = '#E57373';

type Variant = 'public' | 'commonwealth' | 'invited';

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', minWidth: 0,
  padding: '12px 14px', minHeight: '44px',
  backgroundColor: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '8px', color: '#FFFFFF',
  fontSize: '0.9375rem', outline: 'none',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.8125rem', fontWeight: 600,
  color: 'rgba(255,255,255,0.75)', marginBottom: '6px',
};

function btnStyle(disabled: boolean): React.CSSProperties {
  return {
    width: '100%', boxSizing: 'border-box',
    padding: '14px 24px', minHeight: '48px',
    backgroundColor: disabled ? 'rgba(198,166,100,0.5)' : GOLD,
    color: '#1A1A1A', fontWeight: 700, borderRadius: '8px',
    border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: '0.9375rem', transition: 'all 200ms ease',
  };
}

export default function ExchangeIntakeForm({
  variant,
  inviteToken,
}: {
  variant: Variant;
  inviteToken?: string;
}) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [participation, setParticipation] = useState<'business_and_social' | 'social_only' | null>(
    variant === 'commonwealth' ? null : 'business_and_social'
  );
  const [roleTitle, setRoleTitle] = useState('');
  const [company, setCompany] = useState('');
  const [yearsCharlotte, setYearsCharlotte] = useState('');
  const [seeking, setSeeking] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [doneToken, setDoneToken] = useState<string | null>(null);
  const [doneParticipation, setDoneParticipation] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const [booting, setBooting] = useState(variant === 'invited');
  const [alreadyDone, setAlreadyDone] = useState(false);
  const [prefilledFromSession, setPrefilledFromSession] = useState(false);

  const { user, profile, loading: authLoading } = useAuth();

  const fnUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/exchange-intake-submit`;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  const headers = useCallback(() => ({
    'Content-Type': 'application/json',
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
  }), [anonKey]);

  // Invited: prefill from the token
  useEffect(() => {
    if (variant !== 'invited' || !inviteToken) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${fnUrl}?invite_token=${encodeURIComponent(inviteToken)}`, { headers: headers() });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) { setError(data?.error || 'This link is not valid.'); setBooting(false); return; }
        setFirstName(data.first_name || '');
        setLastName(data.last_name || '');
        setEmail(data.email || '');
        setPhone(data.phone || '');
        if (data.already_submitted) setAlreadyDone(true);
      } catch {
        if (!cancelled) setError('Could not load your details. Please try again.');
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => { cancelled = true; };
  }, [variant, inviteToken, fnUrl, headers]);

  // Logged-in members hitting the public or commonwealth form already exist in
  // our system. Prefill and lock their details so they are not retyping what we have.
  useEffect(() => {
    if (variant === 'invited' || authLoading || !user) return;
    if (prefilledFromSession) return;
    const full = (profile?.full_name ?? '').trim();
    const parts = full.split(/\s+/);
    if (parts.length > 0 && parts[0]) setFirstName(parts[0]);
    if (parts.length > 1) setLastName(parts.slice(1).join(' '));
    if (user.email) setEmail(user.email);
    if (profile?.phone) setPhone(profile.phone);
    setPrefilledFromSession(true);
  }, [variant, authLoading, user, profile, prefilledFromSession]);

  // Public and commonwealth: check whether the relevant pool is full
  useEffect(() => {
    if (variant === 'invited' || !EVENT_ID) return;
    const pool = variant === 'commonwealth' ? 'commonwealth' : 'house';
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${fnUrl}?event_id=${EVENT_ID}&pool=${pool}`, { headers: headers() });
        const data = await res.json();
        if (!cancelled && res.ok && data.full) setFull(true);
      } catch { /* non-fatal - the submit will catch it */ }
    })();
    return () => { cancelled = true; };
  }, [variant, fnUrl, headers]);

  const needsAnswers = participation === 'business_and_social';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (variant === 'commonwealth' && !participation) {
      setError('Please choose how you would like to join us.');
      return;
    }

    const body: Record<string, unknown> = { form_variant: variant };

    if (variant === 'invited') {
      body.invite_token = inviteToken;
    } else {
      body.event_id = EVENT_ID;
      body.first_name = firstName.trim();
      body.last_name = lastName.trim();
      body.email = email.trim();
      body.phone = phone.trim();
      body.participation = participation;
      body.origin = window.location.origin;
    }

    if (variant === 'invited' || needsAnswers) {
      body.q_role_title = roleTitle.trim();
      body.q_company = company.trim();
      body.q_years_charlotte = yearsCharlotte.trim();
      body.q_seeking = seeking.trim();
    }

    setLoading(true);
    try {
      const res = await fetch(fnUrl, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) {
        if (data?.full) setFull(true);
        setError(data?.error || 'Something went wrong. Please try again.');
        setLoading(false);
        return;
      }
      setDoneToken(data.credential_token ?? null);
      setDoneParticipation(data.participation ?? null);
      setDone(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // ---- shell ----
  const Shell = ({ children }: { children: React.ReactNode }) => (
    <main style={{ minHeight: '100dvh', backgroundColor: '#000', padding: '32px 20px 64px' }}>
      <div style={{ maxWidth: '520px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '28px' }}>
          <Link href="/" aria-label="704 Collective">
            <Image src="/logo.png" alt="704 Collective" width={72} height={72} style={{ borderRadius: '50%' }} priority />
          </Link>
        </div>
        {children}
        <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginTop: '32px' }}>
          704 Collective &middot; Charlotte, NC
        </p>
      </div>
    </main>
  );

  const EventHeader = () => (
    <div style={{ marginBottom: '28px', textAlign: 'center' }}>
      <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#FFFFFF', margin: '0 0 8px', lineHeight: 1.2 }}>
        The Exchange Mixer
      </h1>
      <p style={{ fontSize: '0.9375rem', color: GOLD, fontWeight: 600, margin: '0 0 4px' }}>
        Thursday, August 27 &middot; 6:30 - 8:30 PM
      </p>
      <p style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.5)', margin: 0 }}>
        Beer Garden at The Village at Commonwealth
      </p>
      <p style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.35)', margin: '2px 0 0' }}>
        1308 Lorna St, Charlotte, NC
      </p>
    </div>
  );

  // ---- states ----
  if (booting) {
    return <Shell><p style={{ color: 'rgba(255,255,255,0.5)', textAlign: 'center' }}>Loading...</p></Shell>;
  }

  // Invited variant with a token that never resolved - show a dead end, not an empty form.
  if (variant === 'invited' && error && !email) {
    return (
      <Shell>
        <EventHeader />
        <div style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '28px 24px', textAlign: 'center' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#FFFFFF', margin: '0 0 10px' }}>This link isn&apos;t valid</h2>
          <p style={{ fontSize: '0.9375rem', color: 'rgba(255,255,255,0.6)', margin: '0 0 18px', lineHeight: 1.6 }}>
            It may have already been used, or the address got cut off somewhere along the way. Email us and we&apos;ll sort it out.
          </p>
          <a href="mailto:hello@704collective.com" style={{ color: GOLD, fontWeight: 600, fontSize: '0.9375rem', textDecoration: 'underline' }}>
            hello@704collective.com
          </a>
        </div>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell>
        <EventHeader />
        <div style={{ backgroundColor: 'rgba(198,166,100,0.08)', border: `1px solid ${GOLD}`, borderRadius: '12px', padding: '28px 24px', textAlign: 'center' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#FFFFFF', margin: '0 0 10px' }}>You&rsquo;re in.</h2>
          <p style={{ fontSize: '0.9375rem', color: 'rgba(255,255,255,0.7)', margin: '0 0 6px', lineHeight: 1.6 }}>
            {doneParticipation === 'social_only'
              ? "We'll see you in the beer garden. Come find us."
              : "You're registered for the business exchange from 7 to 8 PM, plus the social hour before and after."}
          </p>
          <p style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.45)', margin: '14px 0 0' }}>
            A confirmation email is on its way with the details.
          </p>
          {doneToken && (
            <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)', margin: '16px 0 0' }}>
              Confirmation code: {doneToken}
            </p>
          )}
        </div>
      </Shell>
    );
  }

  if (alreadyDone) {
    return (
      <Shell>
        <EventHeader />
        <div style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '28px 24px', textAlign: 'center' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#FFFFFF', margin: '0 0 10px' }}>You&rsquo;re all set.</h2>
          <p style={{ fontSize: '0.9375rem', color: 'rgba(255,255,255,0.6)', margin: 0, lineHeight: 1.6 }}>
            We already have your answers. See you on the 27th.
          </p>
        </div>
      </Shell>
    );
  }

  if (full && variant !== 'invited') {
    return (
      <Shell>
        <EventHeader />
        <div style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '28px 24px', textAlign: 'center' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#FFFFFF', margin: '0 0 10px' }}>This one&rsquo;s full.</h2>
          <p style={{ fontSize: '0.9375rem', color: 'rgba(255,255,255,0.6)', margin: '0 0 18px', lineHeight: 1.6 }}>
            We&rsquo;ve hit capacity for this event. We run something like this every month.
          </p>
          <Link href="/events" style={{ color: GOLD, fontWeight: 600, fontSize: '0.9375rem', textDecoration: 'underline' }}>
            See what&rsquo;s coming up
          </Link>
        </div>
      </Shell>
    );
  }

  // ---- form ----
  return (
    <Shell>
      <EventHeader />

      {variant === 'commonwealth' && (
        <p style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.55)', textAlign: 'center', margin: '0 0 24px', lineHeight: 1.6 }}>
          A free evening for residents of The Village at Commonwealth, hosted with 704 Collective.
        </p>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

        {variant === 'commonwealth' && (
          <div>
            <p style={{ ...labelStyle, marginBottom: '10px' }}>How would you like to join us?</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setParticipation('business_and_social')}
                style={{
                  textAlign: 'left', padding: '16px', minHeight: '44px',
                  backgroundColor: participation === 'business_and_social' ? 'rgba(198,166,100,0.12)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${participation === 'business_and_social' ? GOLD : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: '10px', cursor: 'pointer', color: '#FFFFFF',
                }}
              >
                <span style={{ display: 'block', fontWeight: 700, fontSize: '0.9375rem', marginBottom: '4px' }}>
                  Business Exchange + Social Mixer
                </span>
                <span style={{ display: 'block', fontSize: '0.8125rem', color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>
                  Structured introductions from 7 to 8 PM, matched to people worth meeting, plus the social hour before and after.
                </span>
              </button>

              <button
                type="button"
                onClick={() => setParticipation('social_only')}
                style={{
                  textAlign: 'left', padding: '16px', minHeight: '44px',
                  backgroundColor: participation === 'social_only' ? 'rgba(198,166,100,0.12)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${participation === 'social_only' ? GOLD : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: '10px', cursor: 'pointer', color: '#FFFFFF',
                }}
              >
                <span style={{ display: 'block', fontWeight: 700, fontSize: '0.9375rem', marginBottom: '4px' }}>
                  Social only
                </span>
                <span style={{ display: 'block', fontSize: '0.8125rem', color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>
                  Drinks and conversation in the beer garden. No structured networking, no questions to answer.
                </span>
              </button>
            </div>
          </div>
        )}

        {variant !== 'invited' && prefilledFromSession && (
          <div style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '14px 16px' }}>
            <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.45)', margin: '0 0 4px' }}>Registering as</p>
            <p style={{ fontSize: '0.9375rem', color: '#FFFFFF', fontWeight: 600, margin: 0 }}>{firstName} {lastName}</p>
            <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.45)', margin: '2px 0 0' }}>{email}</p>
            {!phone && (
              <div style={{ marginTop: '12px' }}>
                <label style={labelStyle} htmlFor="phs">Phone</label>
                <input id="phs" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required style={inputStyle} />
              </div>
            )}
          </div>
        )}

        {variant !== 'invited' && !prefilledFromSession && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={labelStyle} htmlFor="fn">First name</label>
                <input id="fn" type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} required style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle} htmlFor="ln">Last name</label>
                <input id="ln" type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} required style={inputStyle} />
              </div>
            </div>
            <div>
              <label style={labelStyle} htmlFor="em">Email</label>
              <input id="em" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle} htmlFor="ph">Phone</label>
              <input id="ph" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required style={inputStyle} />
            </div>
          </>
        )}

        {variant === 'invited' && (
          <div style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '14px 16px' }}>
            <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.45)', margin: '0 0 4px' }}>Registering as</p>
            <p style={{ fontSize: '0.9375rem', color: '#FFFFFF', fontWeight: 600, margin: 0 }}>{firstName} {lastName}</p>
            <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.45)', margin: '2px 0 0' }}>{email}</p>
          </div>
        )}

        {(variant === 'invited' || needsAnswers) && (
          <>
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '20px', marginTop: '4px' }}>
              <p style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#FFFFFF', margin: '0 0 4px' }}>A few quick questions</p>
              <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.45)', margin: 0, lineHeight: 1.5 }}>
                These help us put you in front of the right people during the exchange.
              </p>
            </div>
            <div>
              <label style={labelStyle} htmlFor="q1">What is your current role or title?</label>
              <input id="q1" type="text" value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)} required style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle} htmlFor="q2">What is your current company?</label>
              <input id="q2" type="text" value={company} onChange={(e) => setCompany(e.target.value)} required style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle} htmlFor="q3">How long have you lived in Charlotte?</label>
              <input id="q3" type="text" value={yearsCharlotte} onChange={(e) => setYearsCharlotte(e.target.value)} required style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle} htmlFor="q4">What types of professionals are you looking to connect with?</label>
              <textarea id="q4" value={seeking} onChange={(e) => setSeeking(e.target.value)} required rows={3} style={{ ...inputStyle, minHeight: '84px', resize: 'vertical', fontFamily: 'inherit' }} />
            </div>
          </>
        )}

        {error && <p style={{ fontSize: '0.8125rem', color: ERR, margin: 0 }}>{error}</p>}

        <button type="submit" disabled={loading} style={btnStyle(loading)}>
          {loading ? 'Saving...' : variant === 'invited' ? 'Submit my answers' : 'Reserve my spot'}
        </button>
      </form>
    </Shell>
  );
}
