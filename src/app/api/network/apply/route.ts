import { NextResponse, type NextRequest } from 'next/server';
import { createRateLimiter } from '@/lib/upstash';
import { getRequestIp } from '@/lib/getRequestIp';
import { recordRateLimit429 } from '@/lib/rateLimitMetrics';
import { hubPagesLive } from '@/lib/network/flags';
import { HUB_COPY, isHub } from '@/lib/network/hubs';
import { clip, isEmail, networkServiceClient, sendNetworkEmail, utmColumns, type AttributionIn } from '@/lib/network/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const limiter = createRateLimiter('network-apply', 5);
const ADMIN_TO = process.env.NETWORK_ADMIN_EMAIL ?? 'hello@704collective.com';

type Body = Record<string, unknown> & { attribution?: AttributionIn & { landing_path?: string | null }; landing_path?: string | null };

/** POST /api/network/apply — Get Listed application. Service-role insert + admin notification. */
export async function POST(req: NextRequest) {
  if (!hubPagesLive()) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });

  const ip = getRequestIp(req);
  const { success } = await limiter.limit(ip);
  if (!success) { await recordRateLimit429(req, '/api/network/apply'); return NextResponse.json({ ok: false, error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': '60' } }); }

  const body = (await req.json().catch(() => ({}))) as Body;
  if (clip(body.company_website)) return NextResponse.json({ ok: true, honeypot: true });

  const businessName = clip(body.business_name, 160);
  const hub = clip(body.hub, 32);
  const categoryText = clip(body.category_text, 160);
  const contactEmail = clip(body.contact_email, 200)?.toLowerCase() ?? null;
  if (!businessName || !hub || !isHub(hub) || !categoryText || !contactEmail || !isEmail(contactEmail)) {
    return NextResponse.json({ ok: false, error: 'Business name, hub, category and a valid contact email are required.' }, { status: 400 });
  }

  const admin = networkServiceClient();
  const { data: app, error } = await admin.from('network_listing_applications').insert({
    business_name: businessName,
    hub,
    category_text: categoryText,
    website_url: clip(body.website_url, 300),
    instagram: clip(body.instagram, 120),
    google_profile_url: clip(body.google_profile_url, 300),
    years_in_business: clip(body.years_in_business, 60),
    why_704: clip(body.why_704, 3000),
    heard_about: clip(body.heard_about, 300),
    contact_name: clip(body.contact_name, 120),
    contact_email: contactEmail,
    contact_phone: clip(body.contact_phone, 40),
    ...utmColumns(body.attribution),
    landing_path: clip(body.landing_path ?? body.attribution?.landing_path, 300),
  }).select('id').single();
  if (error || !app) { console.error('[network/apply] insert failed', error?.message); return NextResponse.json({ ok: false, error: 'Could not save your application.' }, { status: 500 }); }

  const emailStatus = await sendNetworkEmail(
    ADMIN_TO,
    `New listing application: ${businessName} (${HUB_COPY[hub].name})`,
    [`${businessName} applied for a seat on ${HUB_COPY[hub].name}.`, '', `Category: ${categoryText}`, `Contact: ${clip(body.contact_name, 120) ?? '-'} · ${contactEmail}${body.contact_phone ? ` · ${clip(body.contact_phone, 40)}` : ''}`,
     body.website_url ? `Website: ${clip(body.website_url, 300)}` : null, body.instagram ? `Instagram: ${clip(body.instagram, 120)}` : null, body.years_in_business ? `Years in business: ${clip(body.years_in_business, 60)}` : null,
     body.why_704 ? `\nWhy 704:\n${clip(body.why_704, 3000)}` : null, '', `Application id: ${app.id}`].filter((l) => l !== null).join('\n'),
    'team',
  );
  console.log('[network/apply] application saved', { id: app.id, hub, emailStatus });
  return NextResponse.json({ ok: true, application_id: app.id, email_status: emailStatus });
}
