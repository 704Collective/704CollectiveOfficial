import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createRateLimiter } from '@/lib/upstash';
import { getRequestIp } from '@/lib/getRequestIp';
import { recordRateLimit429 } from '@/lib/rateLimitMetrics';
import { hubPagesLive } from '@/lib/network/flags';
import { HUB_COPY, isVisibleHub } from '@/lib/network/hubs';
import { clip, isEmail, networkServiceClient, sendNetworkEmail, utmColumns, type AttributionIn } from '@/lib/network/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const limiter = createRateLimiter('network-intro', 10);

type Body = {
  slug?: string; lead_name?: string; lead_email?: string; lead_phone?: string; need?: string; message?: string;
  company_website?: string; attribution?: AttributionIn & { landing_path?: string | null }; landing_path?: string | null;
};

/** POST /api/network/intro — request an intro to a live listing. Service-role insert into network_leads + owner email. */
export async function POST(req: NextRequest) {
  if (!hubPagesLive()) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });

  const ip = getRequestIp(req);
  const { success } = await limiter.limit(ip);
  if (!success) { await recordRateLimit429(req, '/api/network/intro'); return NextResponse.json({ ok: false, error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': '60' } }); }

  const body = (await req.json().catch(() => ({}))) as Body;
  // Honeypot: real users never see this field.
  if (clip(body.company_website)) return NextResponse.json({ ok: true, honeypot: true });

  const slug = clip(body.slug, 120);
  const leadName = clip(body.lead_name, 120);
  const leadEmail = clip(body.lead_email, 200)?.toLowerCase() ?? null;
  if (!slug || !leadName || !leadEmail || !isEmail(leadEmail)) return NextResponse.json({ ok: false, error: 'Name and a valid email are required.' }, { status: 400 });

  const admin = networkServiceClient();
  const { data: listing } = await admin.from('network_listings').select('id, hub, slug, company_name, status, owner_profile_id').eq('slug', slug).maybeSingle();
  if (!listing || listing.status !== 'live' || !isVisibleHub(listing.hub)) return NextResponse.json({ ok: false, error: 'This listing is not accepting intros.' }, { status: 404 });

  // Attach the member when a session exists (never required).
  let fromProfileId: string | null = null;
  try { const { data: { user } } = await (await createClient()).auth.getUser(); fromProfileId = user?.id ?? null; } catch { /* anonymous */ }

  const { data: lead, error } = await admin.from('network_leads').insert({
    listing_id: listing.id,
    lead_name: leadName,
    lead_email: leadEmail,
    lead_phone: clip(body.lead_phone, 40),
    need: clip(body.need, 300),
    message: clip(body.message, 2000),
    from_profile_id: fromProfileId,
    source: 'hub_page',
    ...utmColumns(body.attribution),
    landing_path: clip(body.landing_path ?? body.attribution?.landing_path, 300),
  }).select('id').single();
  if (error || !lead) { console.error('[network/intro] insert failed', error?.message); return NextResponse.json({ ok: false, error: 'Could not save your request.' }, { status: 500 }); }

  // Owner email — "You have a new intro from 704". Logged, never blocking.
  let emailStatus: number | 'no-owner' = 'no-owner';
  if (listing.owner_profile_id) {
    const { data: owner } = await admin.from('profiles').select('email, full_name').eq('id', listing.owner_profile_id).is('deleted_at', null).maybeSingle();
    if (owner?.email) {
      const lines = [
        `${leadName} asked for an intro to ${listing.company_name} through ${HUB_COPY[listing.hub].name} on 704.`,
        '',
        `Name: ${leadName}`, `Email: ${leadEmail}`, body.lead_phone ? `Phone: ${clip(body.lead_phone, 40)}` : null,
        body.need ? `Need: ${clip(body.need, 300)}` : null, body.message ? `\n${clip(body.message, 2000)}` : null,
        '', 'Reply to them directly. This intro is counted toward your listing.',
      ].filter((l) => l !== null).join('\n');
      emailStatus = await sendNetworkEmail(owner.email, 'You have a new intro from 704', lines, owner.full_name?.split(' ')[0] ?? 'there');
    }
  }
  console.log('[network/intro] lead saved', { leadId: lead.id, listing: listing.slug, emailStatus });
  return NextResponse.json({ ok: true, lead_id: lead.id, email_status: emailStatus });
}
