// Server-only helpers for the Network API routes.
import { createClient } from '@supabase/supabase-js';

export function networkServiceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
}

export const clip = (v: unknown, n = 200): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, n) : null;
};

export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

export type AttributionIn = { utm_source?: string | null; utm_medium?: string | null; utm_campaign?: string | null; utm_content?: string | null; utm_term?: string | null } | null | undefined;

export function utmColumns(a: AttributionIn) {
  return {
    utm_source: clip(a?.utm_source),
    utm_medium: clip(a?.utm_medium),
    utm_campaign: clip(a?.utm_campaign),
    utm_content: clip(a?.utm_content),
    utm_term: clip(a?.utm_term),
  };
}

/**
 * Sends through the existing send-email edge function with the service role,
 * using the service-only `admin-custom` template (plain subject + body). Never
 * throws; returns the HTTP status (or 0) so callers can log it.
 */
export async function sendNetworkEmail(to: string, subject: string, bodyText: string, recipientName = 'there'): Promise<number> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ to, template: 'admin-custom', skipCc: true, data: { recipientName, subject, bodyText } }),
    });
    if (!res.ok) console.error('[network email] send-email failed', res.status, (await res.text()).slice(0, 200));
    return res.status;
  } catch (e) {
    console.error('[network email] send-email threw', e instanceof Error ? e.message : String(e));
    return 0;
  }
}
