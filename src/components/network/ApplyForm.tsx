'use client';

import { useState, type FormEvent } from 'react';
import { readAttribution } from '@/lib/attribution';
import { HUB_COPY, VISIBLE_HUBS } from '@/lib/network/hubs';

export function ApplyForm() {
  const [state, setState] = useState<'idle' | 'busy' | 'ok' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState('busy'); setError(null);
    const fd = new FormData(e.currentTarget);
    const attribution = readAttribution();
    const body: Record<string, unknown> = { attribution, landing_path: attribution?.landing_path ?? window.location.pathname };
    for (const k of ['business_name', 'hub', 'category_text', 'website_url', 'instagram', 'google_profile_url', 'years_in_business', 'why_704', 'heard_about', 'contact_name', 'contact_email', 'contact_phone', 'company_website']) body[k] = String(fd.get(k) ?? '');
    try {
      const r = await fetch('/api/network/apply', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) { setError(j.error ?? 'Something went wrong. Try again.'); setState('error'); return; }
      setState('ok');
    } catch { setError('Network error. Try again.'); setState('error'); }
  }

  if (state === 'ok') {
    return (
      <div className="nw-form-ok" data-testid="apply-ok">
        <h3 className="nw-serif" style={{ fontSize: 26, marginBottom: 6 }}>Application received.</h3>
        <p className="nw-muted">We review every application by hand. If your category&apos;s seat is held, we&apos;ll tell you where you stand on the waitlist.</p>
      </div>
    );
  }
  return (
    <form className="nw-form" onSubmit={onSubmit} data-testid="apply-form" id="apply">
      <div className="nw-form-row">
        <label>Business name<input name="business_name" required /></label>
        <label>Hub
          <select name="hub" required defaultValue="">
            <option value="" disabled>Choose a hub</option>
            {VISIBLE_HUBS.map((h) => <option key={h} value={h}>{HUB_COPY[h].name}</option>)}
          </select>
        </label>
      </div>
      <div className="nw-form-row">
        <label>Category (in your words)<input name="category_text" required placeholder="e.g. Sauna & cold plunge" /></label>
        <label>Years in business<input name="years_in_business" placeholder="e.g. 4" /></label>
      </div>
      <div className="nw-form-row">
        <label>Website<input name="website_url" type="url" placeholder="https://" /></label>
        <label>Instagram<input name="instagram" placeholder="@handle" /></label>
      </div>
      <label>Google Business Profile URL<input name="google_profile_url" type="url" placeholder="https://" /></label>
      <label>Why 704?<textarea name="why_704" placeholder="What you do better than anyone in your category, and why our members should know." /></label>
      <div className="nw-form-row">
        <label>Contact name<input name="contact_name" autoComplete="name" /></label>
        <label>Contact email<input name="contact_email" type="email" required autoComplete="email" /></label>
      </div>
      <div className="nw-form-row">
        <label>Contact phone<input name="contact_phone" type="tel" autoComplete="tel" /></label>
        <label>How did you hear about us?<input name="heard_about" /></label>
      </div>
      <label className="nw-hp" aria-hidden="true">Company website<input name="company_website" tabIndex={-1} autoComplete="off" /></label>
      {error ? <p className="nw-form-note" role="alert" style={{ color: '#963D4E' }}>{error}</p> : null}
      <button type="submit" className="nw-btn primary" disabled={state === 'busy'}>{state === 'busy' ? 'Sending…' : 'Apply for a seat'}</button>
      <p className="nw-form-note">Applying does not guarantee a seat. Passing the 704 Review does not either — the seat must be open.</p>
    </form>
  );
}
