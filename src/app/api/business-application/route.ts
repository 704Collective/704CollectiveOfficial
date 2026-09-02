import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createRateLimiter } from '@/lib/upstash';
import { getRequestIp } from '@/lib/getRequestIp';
import { recordRateLimit429 } from '@/lib/rateLimitMetrics';
import {
  checkOneSource,
  hasReferrerName,
  normalizeName,
  REFERRAL_REQUIRED_MESSAGE,
  SELF_CODE_MESSAGE,
  SELF_NAME_MESSAGE,
} from '@/lib/referralRules';

const limiter = createRateLimiter('business-application', 10);

/**
 * The only door into business_applications.
 *
 * RLS no longer lets anon or authenticated insert into the table, so this route
 * is the sole way an application row can be created. Everything the flow
 * promises -- the one-source rule, the self-referral blocks, the auto-match --
 * is enforced here, on the server, before a single field is written.
 *
 * Account-first: the caller must already hold a session on a confirmed email.
 * The applicant's identity comes from that session, never from the request body.
 */

function buildSupabase(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            /* Route Handler cookie edge cases */
          }
        },
      },
    }
  );
}

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

const REQUIRED_TEXT_FIELDS = [
  'company', 'title', 'industry', 'yearsInCharlotte', 'referralSource',
  'conflictLesson', 'missingInCharlotte', 'oneYearGoal', 'rightIntro', 'recentWins',
] as const;

interface Body {
  firstName?: string;
  lastName?: string;
  phone?: string;
  company?: string;
  title?: string;
  industry?: string;
  linkedinUrl?: string;
  website?: string;
  yearsInCharlotte?: string;
  referralSource?: string;
  conflictLesson?: string;
  missingInCharlotte?: string;
  oneYearGoal?: string;
  rightIntro?: string;
  recentWins?: string;
  anythingElse?: string;
  referralCode?: string;
  referrerName?: string;
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const supabase = buildSupabase(cookieStore);

  const { data: { user } } = await supabase.auth.getUser();

  const identifier = user?.id ?? getRequestIp(request);
  const { success } = await limiter.limit(identifier);
  if (!success) {
    await recordRateLimit429(request, '/api/business-application');
    return NextResponse.json(
      { error: 'Too many requests', message: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

  // ── Account-first gate ───────────────────────────────────────────────────
  if (!user) {
    return bad('You need an account before you can apply. Please log in or create one first.', 401);
  }
  if (!user.email_confirmed_at) {
    return bad('Please confirm your email address before submitting your application.', 403);
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return bad('Malformed request body');
  }

  const str = (v: string | undefined) => (v ?? '').trim();

  for (const field of REQUIRED_TEXT_FIELDS) {
    if (!str(body[field])) return bad('Please fill out all required application fields.');
  }

  const admin = serviceClient();

  const { data: profile } = await admin
    .from('profiles')
    .select('id, full_name, email, phone')
    .eq('id', user.id)
    .maybeSingle();

  const applicantEmail = (user.email ?? profile?.email ?? '').trim().toLowerCase();
  if (!applicantEmail) return bad('Your account has no email address on file.');

  const firstName = str(body.firstName) || (profile?.full_name ?? '').trim().split(/\s+/)[0] || '';
  const lastName =
    str(body.lastName) || (profile?.full_name ?? '').trim().split(/\s+/).slice(1).join(' ') || '';
  if (!firstName || !lastName) return bad('Please provide your first and last name.');

  // ── Referral question is mandatory ───────────────────────────────────────
  const referrerNameRaw = str(body.referrerName);
  if (!referrerNameRaw) return bad(REFERRAL_REQUIRED_MESSAGE);

  const referralCodeRaw = str(body.referralCode);

  // ── One-source rule ──────────────────────────────────────────────────────
  const oneSourceError = checkOneSource(referralCodeRaw, referrerNameRaw);
  if (oneSourceError) return bad(oneSourceError);

  // ── Ambassador code branch ───────────────────────────────────────────────
  let ambassadorId: string | null = null;
  let referralCode: string | null = null;

  if (referralCodeRaw) {
    // Escaped so that % and _ inside a submitted code are matched literally
    // instead of behaving as ILIKE wildcards.
    const codePattern = referralCodeRaw.replace(/[\\%_]/g, (c) => `\\${c}`);
    const { data: ambassador } = await admin
      .from('ambassadors')
      .select('id, full_name, email, profile_id, is_active, referral_code')
      .ilike('referral_code', codePattern)
      .eq('is_active', true)
      .maybeSingle();

    if (!ambassador) {
      return bad('That referral code is not valid or is no longer active.');
    }

    // Self-referral by code: the ambassador is the applicant.
    const ambassadorEmail = (ambassador.email ?? '').trim().toLowerCase();
    if (ambassador.profile_id === user.id || (ambassadorEmail && ambassadorEmail === applicantEmail)) {
      return bad(SELF_CODE_MESSAGE);
    }

    ambassadorId = ambassador.id;
    referralCode = ambassador.referral_code ?? referralCodeRaw;
  }

  // ── Typed member name branch ─────────────────────────────────────────────
  let matchedReferrerProfileId: string | null = null;
  let matchedReferrerName: string | null = null;
  let ambiguousMatch = false;

  if (hasReferrerName(referrerNameRaw)) {
    const typed = normalizeName(referrerNameRaw);

    // Self-referral by name. Checked against both the profile name of record and
    // the name given on this form, so neither spelling gets through.
    const ownNames = [profile?.full_name, `${firstName} ${lastName}`]
      .map(normalizeName)
      .filter(Boolean);
    if (ownNames.includes(typed)) return bad(SELF_NAME_MESSAGE);

    // Auto-match against ACTIVE BUSINESS MEMBERS ONLY, case-insensitively.
    // Compared in JS rather than through ilike so that % and _ in a name are
    // literal characters instead of wildcards.
    const { data: members } = await admin
      .from('profiles')
      .select('id, full_name, email')
      .eq('member_type', 'business')
      .eq('subscription_status', 'active')
      .is('deleted_at', null)
      .limit(2000);

    const hits = (members ?? []).filter(
      (m) => normalizeName(m.full_name) === typed && m.id !== user.id
    );

    if (hits.length === 1) {
      matchedReferrerProfileId = hits[0].id;
      matchedReferrerName = hits[0].full_name ?? null;
    } else if (hits.length > 1) {
      // Two active members share this name. The machine must not pick; the
      // reviewer resolves it with the picker.
      ambiguousMatch = true;
    }
  }

  // ── Write ────────────────────────────────────────────────────────────────
  const { data: inserted, error: insertError } = await admin
    .from('business_applications')
    .insert({
      first_name: firstName,
      last_name: lastName,
      email: applicantEmail,
      phone: str(body.phone) || profile?.phone || null,
      company: str(body.company) || null,
      title: str(body.title) || null,
      industry: str(body.industry) || null,
      linkedin_url: str(body.linkedinUrl) || null,
      website: str(body.website) || null,
      years_in_charlotte: str(body.yearsInCharlotte)
        ? Number.parseInt(str(body.yearsInCharlotte), 10)
        : null,
      referral_source: str(body.referralSource) || null,
      conflict_lesson: str(body.conflictLesson) || null,
      missing_in_charlotte: str(body.missingInCharlotte) || null,
      one_year_goal: str(body.oneYearGoal) || null,
      right_intro: str(body.rightIntro) || null,
      recent_wins: str(body.recentWins) || null,
      anything_else: str(body.anythingElse) || null,
      status: 'pending',
      profile_id: user.id,
      ambassador_id: ambassadorId,
      referral_code: referralCode,
      referrer_name: referrerNameRaw,
      matched_referrer_profile_id: matchedReferrerProfileId,
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    console.error('business-application insert failed:', insertError?.message);
    return NextResponse.json(
      { error: 'We could not save your application. Please try again.' },
      { status: 500 }
    );
  }

  await admin.from('profiles').update({ application_status: 'pending' }).eq('id', user.id);

  return NextResponse.json({
    application_id: inserted.id,
    referral: {
      source: ambassadorId ? 'ambassador' : hasReferrerName(referrerNameRaw) ? 'member' : 'none',
      matched_referrer_name: matchedReferrerName,
      ambiguous: ambiguousMatch,
    },
  });
}
