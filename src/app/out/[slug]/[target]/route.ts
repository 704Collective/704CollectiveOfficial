import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { hubPagesLive } from '@/lib/network/flags';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TARGETS = new Set(['website', 'instagram', 'phone']);
const clip = (v: string | null, n = 200) => (v && v.trim() ? v.trim().slice(0, n) : null);

/** tel: href — same E.164 rule as the rest of the codebase (10 digits → +1, 11 starting with 1 → +). */
function telHref(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `tel:+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `tel:+${digits}`;
  return digits.length >= 7 ? `tel:${phone.startsWith('+') ? '+' : ''}${digits}` : null;
}

/**
 * GET /out/[slug]/[target] — logs a network_click_events row (service role) and
 * 302s to the listing's real URL. noindex; never in the sitemap. Live listings only.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string; target: string }> }) {
  if (!hubPagesLive()) return new NextResponse('Not found', { status: 404 });
  const { slug, target } = await ctx.params;
  if (!TARGETS.has(target)) return new NextResponse('Not found', { status: 404 });

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data: l } = await admin.from('network_listings').select('id, website_url, instagram_url, phone').eq('slug', slug).eq('status', 'live').maybeSingle();
  if (!l) return new NextResponse('Not found', { status: 404, headers: { 'X-Robots-Tag': 'noindex' } });

  const dest = target === 'website' ? l.website_url : target === 'instagram' ? l.instagram_url : l.phone ? telHref(l.phone) : null;
  if (!dest) return new NextResponse('Not found', { status: 404, headers: { 'X-Robots-Tag': 'noindex' } });

  const q = req.nextUrl.searchParams;
  const { error } = await admin.from('network_click_events').insert({
    listing_id: l.id,
    target,
    source: clip(q.get('source')) ?? 'hub_page',
    utm_source: clip(q.get('utm_source')),
    utm_medium: clip(q.get('utm_medium')),
    utm_campaign: clip(q.get('utm_campaign')),
    utm_content: clip(q.get('utm_content')),
    referrer: clip(req.headers.get('referer'), 500),
  });
  if (error) console.error('[out] click insert failed (redirecting anyway)', error.message);

  return NextResponse.redirect(dest, { status: 302, headers: { 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' } });
}
