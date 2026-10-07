'use client';

import { useState, type FormEvent } from 'react';
import { readAttribution } from '@/lib/attribution';

export function IntroForm({ slug, companyName }: { slug: string; companyName: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'ok' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState('busy'); setError(null);
    const fd = new FormData(e.currentTarget);
    const attribution = readAttribution();
    const body = {
      slug,
      lead_name: String(fd.get('lead_name') ?? ''),
      lead_email: String(fd.get('lead_email') ?? ''),
      lead_phone: String(fd.get('lead_phone') ?? ''),
      need: String(fd.get('need') ?? ''),
      message: String(fd.get('message') ?? ''),
      company_website: String(fd.get('company_website') ?? ''), // honeypot
      attribution,
      landing_path: attribution?.landing_path ?? (typeof window !== 'undefined' ? window.location.pathname : null),
    };
    try {
      const r = await fetch('/api/network/intro', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) { setError(j.error ?? 'Something went wrong. Try again.'); setState('error'); return; }
      setState('ok');
    } catch { setError('Network error. Try again.'); setState('error'); }
  }

  if (state === 'ok') {
    return (
      <div className="nw-form-ok" data-testid="intro-ok">
        <h3 className="nw-serif" style={{ fontSize: 26, marginBottom: 6 }}>Intro sent.</h3>
        <p className="nw-muted">{companyName} has your details and knows the intro came through 704. Expect a reply from them directly.</p>
      </div>
    );
  }
  return (
    <form className="nw-form" onSubmit={onSubmit} data-testid="intro-form">
      <div className="nw-form-row">
        <label>Your name<input name="lead_name" required autoComplete="name" /></label>
        <label>Email<input name="lead_email" type="email" required autoComplete="email" /></label>
      </div>
      <div className="nw-form-row">
        <label>Phone (optional)<input name="lead_phone" type="tel" autoComplete="tel" /></label>
        <label>What do you need?<input name="need" placeholder="e.g. a sauna membership for two" /></label>
      </div>
      <label>Anything they should know<textarea name="message" placeholder="Timing, budget, the shape of the ask." /></label>
      <label className="nw-hp" aria-hidden="true">Company website<input name="company_website" tabIndex={-1} autoComplete="off" /></label>
      {error ? <p className="nw-form-note" role="alert" style={{ color: '#963D4E' }}>{error}</p> : null}
      <button type="submit" className="nw-btn primary" disabled={state === 'busy'}>{state === 'busy' ? 'Sending…' : `Request an intro to ${companyName}`}</button>
      <p className="nw-form-note">We pass your details to the business and nobody else. Links on 704 route through us so your intro is counted for them.</p>
    </form>
  );
}
