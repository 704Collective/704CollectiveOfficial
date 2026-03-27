import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';
import { validatePartnerInviteToken } from '@/lib/partnerInviteToken';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function sendServiceEmail(to: string, template: string, data: Record<string, unknown>) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ to, template, data }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error('[partnerSignup] send-email failed', res.status, err);
  }
}

function genCalendarToken(): string {
  return randomBytes(20).toString('hex');
}

export type PartnerSubmitResult = { ok: true } | { ok: false; error: string };

/**
 * Shared partner application pipeline (auth user, profile, partner_applications, storage, emails).
 * Used by the server action and POST /api/partners/signup.
 */
export async function runPartnerSignupFromFormData(formData: FormData): Promise<PartnerSubmitResult> {
  const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://704collective.com';
  const dashboardUrl = `${siteOrigin}/dashboard`;

  const firstName = String(formData.get('firstName') ?? '').trim();
  const lastName = String(formData.get('lastName') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  const confirmPassword = String(formData.get('confirmPassword') ?? '');
  const companyName = String(formData.get('companyName') ?? '').trim();
  const phone = String(formData.get('phone') ?? '').trim();
  const websiteRaw = String(formData.get('website') ?? '').trim();
  const website = websiteRaw || null;
  const description = String(formData.get('description') ?? '').trim();
  const terms = formData.get('terms') === 'on' || formData.get('terms') === 'true';
  const inviteToken = String(formData.get('inviteToken') ?? '').trim() || null;

  const typesJson = String(formData.get('partnerTypes') ?? '[]');
  let partnerTypes: string[] = [];
  try {
    partnerTypes = JSON.parse(typesJson) as string[];
  } catch {
    return { ok: false, error: 'Invalid partner types' };
  }
  if (!Array.isArray(partnerTypes) || !partnerTypes.includes('partner')) {
    return { ok: false, error: 'Partner type is required' };
  }

  const logo = formData.get('logo');
  if (!logo || typeof logo !== 'object' || (logo as File).size === 0) {
    return { ok: false, error: 'Logo or profile photo is required' };
  }
  const logoFile = logo as File;

  if (!firstName || !lastName || !email || !companyName || !phone || !description) {
    return { ok: false, error: 'Please complete all required fields' };
  }
  if (password.length < 8) {
    return { ok: false, error: 'Password must be at least 8 characters' };
  }
  if (password !== confirmPassword) {
    return { ok: false, error: 'Passwords do not match' };
  }
  if (!terms) {
    return { ok: false, error: 'You must accept the terms' };
  }

  let superAdminAutoApprove = false;
  let inviteId: string | null = null;

  if (inviteToken) {
    const inv = await validatePartnerInviteToken(inviteToken);
    if (!inv.ok) {
      return { ok: false, error: 'This invite link is not valid or has expired.' };
    }
    inviteId = inv.inviteId;
    superAdminAutoApprove = inv.superAdminAutoApprove;
    const inviteEmail = inv.email?.trim().toLowerCase() ?? '';
    if (inviteEmail && inviteEmail !== email) {
      return { ok: false, error: 'Email must match the address on this invitation.' };
    }
  }

  const admin = adminClient();
  const fullName = `${firstName} ${lastName}`;

  const { data: authData, error: authErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, phone },
  });

  if (authErr || !authData?.user) {
    const msg = authErr?.message ?? 'Could not create account';
    if (msg.toLowerCase().includes('already')) {
      return { ok: false, error: 'An account with this email already exists. Try logging in.' };
    }
    return { ok: false, error: msg };
  }

  const userId = authData.user.id;

  const uploadPaths = async (file: File, subfolder: string): Promise<string> => {
    const ext = file.name.split('.').pop()?.replace(/[^a-z0-9]/gi, '') || 'jpg';
    const path = `${userId}/${subfolder}/${Date.now()}.${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await admin.storage.from('partner-assets').upload(path, buf, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    });
    if (upErr) throw new Error(upErr.message);
    const { data: pub } = admin.storage.from('partner-assets').getPublicUrl(path);
    return pub.publicUrl;
  };

  let logoUrl: string;
  const photoUrls: string[] = [];

  try {
    logoUrl = await uploadPaths(logoFile, 'logo');

    const extras = formData.getAll('photos') as unknown[];
    for (const f of extras) {
      if (f instanceof File && f.size > 0) {
        if (photoUrls.length >= 9) break;
        photoUrls.push(await uploadPaths(f, 'photos'));
      }
    }
  } catch (e) {
    await admin.auth.admin.deleteUser(userId);
    return { ok: false, error: e instanceof Error ? e.message : 'Upload failed' };
  }

  const partnerStatus = superAdminAutoApprove ? 'approved' : 'pending';
  const applicationStatus = superAdminAutoApprove ? 'approved' : 'pending';

  const { error: profErr } = await admin.from('profiles').upsert(
    {
      id: userId,
      email,
      full_name: fullName,
      phone,
      member_type: 'partner',
      partner_status: partnerStatus,
      partner_types: partnerTypes,
      subscription_status: 'inactive',
      membership_override: false,
      calendar_token: genCalendarToken(),
    },
    { onConflict: 'id' }
  );

  if (profErr) {
    await admin.auth.admin.deleteUser(userId);
    return { ok: false, error: profErr.message };
  }

  const { error: appErr } = await admin.from('partner_applications').insert({
    user_id: userId,
    company_name: companyName,
    website,
    phone,
    description,
    logo_url: logoUrl,
    photo_urls: photoUrls.length ? photoUrls : [],
    partner_types: partnerTypes,
    status: applicationStatus,
    invite_id: inviteId,
  });

  if (appErr) {
    await admin.auth.admin.deleteUser(userId);
    return { ok: false, error: appErr.message };
  }

  if (inviteId) {
    await admin
      .from('partner_invites')
      .update({
        used: true,
        used_by: userId,
        used_at: new Date().toISOString(),
      })
      .eq('id', inviteId);
  }

  await sendServiceEmail(email, 'partner-application-submitted', {
    name: firstName,
    companyName,
    origin: siteOrigin,
  });

  await sendServiceEmail('hello@704collective.com', 'partner-new-application-admin', {
    companyName,
    applicantEmail: email,
  });

  if (superAdminAutoApprove) {
    await sendServiceEmail(email, 'partner-welcome-invite', {
      name: firstName,
      dashboardUrl,
      origin: siteOrigin,
    });
  }

  return { ok: true };
}
