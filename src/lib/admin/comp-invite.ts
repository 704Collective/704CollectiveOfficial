import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { buildCompInviteWelcomeEmail } from '@/lib/admin/comp-invite-email';

export type CompMemberType = 'business' | 'social';

export type CompInviteBody = {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  company?: string | null;
  memberType?: CompMemberType;
  compReason: string;
  origin?: string;
};

export type CompInviteResult = {
  ok: true;
  result: 'created' | 'upgraded';
  userId: string;
  email: string;
  linkSent: boolean;
  warnings: string[];
};

export type CompInvitePrecheck = {
  ok: true;
  email: string;
  authUser: {
    id: string;
    email: string | null;
    emailConfirmedAt: string | null;
    createdAt: string | null;
  } | null;
  profile: {
    id: string;
    full_name: string | null;
    subscription_status: string | null;
    member_type: string | null;
    membership_override: boolean | null;
    comp_reason: string | null;
    member_since: string | null;
    role: string | null;
    deleted_at: string | null;
    phone: string | null;
    company: string | null;
    stripe_customer_id: string | null;
    subscription_id: string | null;
  } | null;
  contacts: Array<Record<string, unknown>>;
  ambassadors: Array<{
    id: string;
    email: string | null;
    full_name: string | null;
    is_active: boolean | null;
    referral_code: string | null;
    profile_id: string | null;
    type: string | null;
  }>;
  people: Record<string, unknown> | null;
  flags: string[];
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function serviceAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Resolve auth.users id by email without creating anything. */
export async function findAuthUserIdByEmail(
  admin: SupabaseClient,
  email: string,
): Promise<{ id: string; email: string | null; emailConfirmedAt: string | null; createdAt: string | null } | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  // GoTrue admin filter (exact email)
  try {
    const url = new URL(`${supabaseUrl}/auth/v1/admin/users`);
    url.searchParams.set('email', email);
    url.searchParams.set('page', '1');
    url.searchParams.set('per_page', '50');
    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
    });
    if (res.ok) {
      const body = (await res.json()) as { users?: Array<{
        id: string;
        email?: string | null;
        email_confirmed_at?: string | null;
        created_at?: string | null;
      }> };
      const match = (body.users ?? []).find((u) => (u.email ?? '').toLowerCase() === email);
      if (match?.id) {
        return {
          id: match.id,
          email: match.email ?? null,
          emailConfirmedAt: match.email_confirmed_at ?? null,
          createdAt: match.created_at ?? null,
        };
      }
    }
  } catch (err) {
    console.error('[comp-invite] auth users email lookup failed', err);
  }

  // Fallback: profiles.id mirrors auth.users.id
  const { data: profile } = await admin
    .from('profiles')
    .select('id, email')
    .eq('email', email)
    .maybeSingle();
  if (profile?.id) {
    const { data } = await admin.auth.admin.getUserById(profile.id);
    if (data.user) {
      return {
        id: data.user.id,
        email: data.user.email ?? null,
        emailConfirmedAt: data.user.email_confirmed_at ?? null,
        createdAt: data.user.created_at ?? null,
      };
    }
  }

  return null;
}

function knownInviteeFlags(email: string): string[] {
  const flags: string[] = [];
  if (email === 'karim@cltapts.com') {
    flags.push(
      'KNOWN: karim@cltapts.com is an active ambassador - upgrade must preserve ambassadors.profile_id linkage (do not touch ambassadors rows)',
    );
  }
  if (email === 'brandon@cltapts.com') {
    flags.push(
      'KNOWN: brandon@cltapts.com may have Glue Up-era rows - inspect contacts/people before inviting',
    );
  }
  return flags;
}

export async function precheckCompInvite(
  admin: SupabaseClient,
  rawEmail: string,
): Promise<CompInvitePrecheck | { ok: false; error: string }> {
  const email = normalizeEmail(rawEmail);
  if (!email || !EMAIL_RE.test(email)) {
    return { ok: false, error: 'Valid email is required' };
  }

  const authUser = await findAuthUserIdByEmail(admin, email);

  const { data: profileRaw } = await admin
    .from('profiles')
    .select(
      'id, full_name, subscription_status, member_type, membership_override, comp_reason, member_since, role, deleted_at, phone, company, stripe_customer_id, subscription_id',
    )
    .eq('email', email)
    .maybeSingle();

  const profile = profileRaw as CompInvitePrecheck['profile'];

  const { data: contactRows } = await admin
    .from('contacts')
    .select('*')
    .eq('email', email);

  const { data: ambassadorRows } = await admin
    .from('ambassadors')
    .select('id, email, full_name, is_active, referral_code, profile_id, type')
    .eq('email', email);

  const { data: peopleRow } = await admin
    .from('people')
    .select('*')
    .eq('email_lower', email)
    .maybeSingle();

  const flags = knownInviteeFlags(email);
  const ambassadors = (ambassadorRows ?? []) as CompInvitePrecheck['ambassadors'];
  const contacts = (contactRows ?? []) as Array<Record<string, unknown>>;

  if (ambassadors.some((a) => a.is_active)) {
    flags.push('Active ambassador row(s) found - invite will upgrade membership only; ambassador linkage left untouched');
  }
  if (ambassadors.length > 0 && ambassadors.every((a) => !a.is_active)) {
    flags.push('Inactive ambassador row(s) found');
  }
  if (contacts.length > 0) {
    flags.push(`contacts row(s) present (${contacts.length})`);
    const glueLike = contacts.some((c) => {
      const source = String(c.source ?? '').toLowerCase();
      const detail = String(c.source_detail ?? '').toLowerCase();
      const meta = JSON.stringify(c.metadata ?? {}).toLowerCase();
      return source.includes('glue') || detail.includes('glue') || meta.includes('glue');
    });
    if (glueLike) flags.push('Glue Up-era signal on contacts row(s)');
  }
  if (peopleRow) flags.push('people row present');
  if (profile?.membership_override) flags.push('profile already has membership_override');
  if (profile?.subscription_status && profile.subscription_status !== 'active') {
    flags.push(`profile subscription_status is "${profile.subscription_status}" (will be set active)`);
  }
  if (profile?.stripe_customer_id || profile?.subscription_id) {
    flags.push('Stripe ids present on profile - invite will not touch stripe fields');
  }
  if (profile?.deleted_at) flags.push('profile is soft-deleted - invite will clear deleted_at');
  if (!authUser && !profile) flags.push('No auth user or profile - invite will create both');
  if (authUser && !profile) flags.push('Auth user exists without profile - invite will upsert profile');

  return {
    ok: true,
    email,
    authUser: authUser
      ? {
          id: authUser.id,
          email: authUser.email,
          emailConfirmedAt: authUser.emailConfirmedAt,
          createdAt: authUser.createdAt,
        }
      : null,
    profile,
    contacts,
    ambassadors,
    people: (peopleRow as Record<string, unknown> | null) ?? null,
    flags,
  };
}

async function syncPeopleBestEffort(
  admin: SupabaseClient,
  opts: {
    email: string;
    fullName: string;
    phone?: string | null;
    memberType: CompMemberType;
    userId: string;
  },
): Promise<string | null> {
  try {
    // email_lower is a generated column — never write it (lookup via email_lower is fine).
    const { data: existingPerson } = await admin
      .from('people')
      .select('id, roles, metadata, joined_at, phone')
      .eq('email_lower', opts.email)
      .maybeSingle();

    if (existingPerson) {
      const prevRoles = Array.isArray(existingPerson.roles) ? [...existingPerson.roles] : [];
      const newRoles = prevRoles.includes('member') ? prevRoles : [...prevRoles, 'member'];
      const prevMeta =
        existingPerson.metadata && typeof existingPerson.metadata === 'object'
          ? (existingPerson.metadata as Record<string, unknown>)
          : {};
      const updates: Record<string, unknown> = {
        full_name: opts.fullName,
        roles: newRoles,
        member_tier: opts.memberType,
        member_status: 'active',
        override_paying: true,
        metadata: {
          ...prevMeta,
          profile_id: opts.userId,
          last_comp_invite_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      };
      if (opts.phone?.trim()) updates.phone = opts.phone.trim();
      if (!existingPerson.joined_at) updates.joined_at = new Date().toISOString();

      const { error } = await admin.from('people').update(updates).eq('id', existingPerson.id);
      if (error) return `people sync update failed: ${error.message}`;
      return null;
    }

    const { error } = await admin.from('people').insert({
      email: opts.email,
      full_name: opts.fullName,
      ...(opts.phone?.trim() ? { phone: opts.phone.trim() } : {}),
      roles: ['member'],
      member_tier: opts.memberType,
      member_status: 'active',
      override_paying: true,
      joined_at: new Date().toISOString(),
      metadata: { profile_id: opts.userId, source: 'comp_invite' },
    });
    if (error) return `people sync insert failed: ${error.message}`;
    return null;
  } catch (err) {
    return `people sync failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function sendCompInviteEmail(to: string, subject: string, html: string): Promise<{ sent: boolean; error?: string }> {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    return { sent: false, error: 'RESEND_API_KEY not configured' };
  }

  const payload = {
    from: '704 Collective <hello@704collective.com>',
    to,
    subject,
    html,
  };

  // Rehearsal capture: write exact outbound payload when COMP_INVITE_CAPTURE=1
  if (process.env.COMP_INVITE_CAPTURE === '1') {
    try {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      const dir = path.join(process.cwd(), 'outputs');
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(
        path.join(dir, 'comp-invite-email-capture.json'),
        JSON.stringify(payload, null, 2),
        'utf8',
      );
    } catch (captureErr) {
      console.error('[comp-invite] capture write failed', captureErr);
    }
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    return { sent: false, error: `Resend ${res.status}: ${errText}` };
  }
  return { sent: true };
}

export async function runCompInvite(
  admin: SupabaseClient,
  body: CompInviteBody,
  siteBase: string,
): Promise<CompInviteResult | { ok: false; error: string; status?: number }> {
  const email = normalizeEmail(body.email ?? '');
  const firstName = String(body.firstName ?? '').trim();
  const lastName = String(body.lastName ?? '').trim();
  const compReason = String(body.compReason ?? '').trim();
  const phone = body.phone != null ? String(body.phone).trim() : '';
  const company = body.company != null ? String(body.company).trim() : '';
  const memberType: CompMemberType = body.memberType === 'social' ? 'social' : 'business';

  if (!email || !EMAIL_RE.test(email)) {
    return { ok: false, error: 'Valid email is required', status: 400 };
  }
  if (!firstName || !lastName) {
    return { ok: false, error: 'firstName and lastName are required', status: 400 };
  }
  if (!compReason) {
    return { ok: false, error: 'compReason is required', status: 400 };
  }

  const fullName = `${firstName} ${lastName}`.trim();
  const warnings: string[] = [];
  const redirectTo = `${siteBase.replace(/\/$/, '')}/setup-password`;

  // (a) auth user: reuse or create (no password)
  let userId: string;
  let result: 'created' | 'upgraded';

  const existingAuth = await findAuthUserIdByEmail(admin, email);
  if (existingAuth) {
    userId = existingAuth.id;
    result = 'upgraded';
  } else {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        ...(phone ? { phone } : {}),
        ...(company ? { company } : {}),
      },
    });
    if (createErr || !created.user) {
      const msg = createErr?.message ?? 'createUser failed';
      const looksLikeExisting =
        msg.toLowerCase().includes('already') ||
        msg.toLowerCase().includes('registered') ||
        msg.toLowerCase().includes('exists');
      if (looksLikeExisting) {
        const again = await findAuthUserIdByEmail(admin, email);
        if (!again) return { ok: false, error: msg, status: 400 };
        userId = again.id;
        result = 'upgraded';
      } else {
        return { ok: false, error: msg, status: 400 };
      }
    } else {
      userId = created.user.id;
      result = 'created';
    }
  }

  // Load prior profile for warnings + member_since guard (never touch stripe fields)
  const { data: prior } = await admin
    .from('profiles')
    .select(
      'id, subscription_status, member_type, membership_override, member_since, deleted_at, role, stripe_customer_id, subscription_id, comp_reason, full_name',
    )
    .eq('id', userId)
    .maybeSingle();

  if (prior) {
    if (prior.subscription_status && prior.subscription_status !== 'active') {
      warnings.push(
        `Existing subscription_status was "${prior.subscription_status}" - set to active`,
      );
    } else if (prior.subscription_status === 'active' && !prior.membership_override) {
      warnings.push('Existing profile was already active (non-override) - upgraded to override');
    }
    if (prior.membership_override) {
      warnings.push('membership_override was already true');
    }
    if (prior.member_type && prior.member_type !== memberType) {
      warnings.push(`member_type changed from "${prior.member_type}" to "${memberType}"`);
    }
    if (prior.stripe_customer_id || prior.subscription_id) {
      warnings.push('Stripe fields present - left untouched');
    }
    if (prior.role === 'admin' || prior.role === 'super_admin') {
      warnings.push(`Profile role is ${prior.role} - left unchanged`);
    }
    if (prior.deleted_at) {
      warnings.push('Cleared soft-delete (deleted_at) so the account can sign in');
    }
    if (prior.member_since) {
      warnings.push(`Preserved existing member_since (${prior.member_since})`);
    }
  }

  // Ambassador safety: never modify ambassadors rows; only warn
  const { data: ambassadorRows } = await admin
    .from('ambassadors')
    .select('id, is_active, profile_id, referral_code')
    .eq('email', email);
  if ((ambassadorRows ?? []).length > 0) {
    warnings.push(
      `Ambassador row(s) present (${ambassadorRows!.length}) - left untouched to preserve linkage`,
    );
    for (const a of ambassadorRows ?? []) {
      if (a.profile_id && a.profile_id !== userId) {
        warnings.push(
          `Ambassador ${a.id} profile_id ${a.profile_id} differs from auth user ${userId} - not modified`,
        );
      }
    }
  }
  warnings.push(...knownInviteeFlags(email).filter((f) => !warnings.includes(f)));

  // (b) profile upsert — only set member_since when currently null
  const nowIso = new Date().toISOString();
  const profilePayload: Record<string, unknown> = {
    id: userId,
    email,
    full_name: fullName,
    member_type: memberType,
    membership_override: true,
    subscription_status: 'active',
    comp_reason: compReason,
    updated_at: nowIso,
  };
  if (!prior?.member_since) {
    profilePayload.member_since = nowIso;
  }
  if (phone) profilePayload.phone = phone;
  if (company) profilePayload.company = company;
  if (prior?.deleted_at) profilePayload.deleted_at = null;

  const { error: profileErr } = await admin
    .from('profiles')
    .upsert(profilePayload as never, { onConflict: 'id' });
  if (profileErr) {
    return { ok: false, error: `Profile upsert failed: ${profileErr.message}`, status: 400 };
  }

  // (c) ensure member role
  const { error: roleErr } = await admin
    .from('user_roles')
    .upsert({ user_id: userId, role: 'member' }, { onConflict: 'user_id,role' });
  if (roleErr) {
    warnings.push(`user_roles upsert warning: ${roleErr.message}`);
  }

  // (d) people sync best-effort
  const peopleWarn = await syncPeopleBestEffort(admin, {
    email,
    fullName,
    phone: phone || null,
    memberType,
    userId,
  });
  if (peopleWarn) warnings.push(peopleWarn);

  // (e) tokenized recovery link — never bare /setup-password
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo },
  });
  if (linkErr || !linkData?.properties?.action_link) {
    return {
      ok: false,
      error: `generateLink failed: ${linkErr?.message ?? 'no action_link'}`,
      status: 500,
    };
  }
  const actionLink = linkData.properties.action_link;
  if (!actionLink.includes('token') && !actionLink.includes('type=recovery') && !actionLink.includes('type=magiclink')) {
    // Soft check — Supabase action_links are hashed URLs; still require non-bare path
    const bare = actionLink.replace(/\/$/, '') === redirectTo.replace(/\/$/, '');
    if (bare) {
      return { ok: false, error: 'Refusing to send bare /setup-password URL', status: 500 };
    }
  }

  // (f) Resend directly from hello@ (not send-email no-reply path)
  const { subject, html } = buildCompInviteWelcomeEmail({
    firstName,
    company: company || null,
    memberType,
    activateUrl: actionLink,
  });
  const emailResult = await sendCompInviteEmail(email, subject, html);
  if (!emailResult.sent) {
    warnings.push(`Welcome email not sent: ${emailResult.error ?? 'unknown'}`);
  }

  return {
    ok: true,
    result,
    userId,
    email,
    linkSent: emailResult.sent,
    warnings,
  };
}
