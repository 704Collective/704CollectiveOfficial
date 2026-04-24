import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

const BRAND = {
  color: '#1A1A1A',
  surface: '#2E2E2E',
  accent: '#C6A664',
  accentText: '#1A1A1A',
  text: '#FAF6F0',
  textSecondary: '#D8D8D8',
  textMuted: '#A0A0A0',
  border: 'rgba(255,255,255,0.10)',
  logoUrl:
    'https://bnmtynevbuplqpuqvmna.supabase.co/storage/v1/object/public/public-assets/704-logo.png',
  fontStack:
    "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
};

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function adminInviteEmailHtml(name: string, ctaUrl: string, origin: string) {
  const safeName = escapeHtml(name || 'there');
  const safeCta = escapeHtml(ctaUrl);
  const safeOrigin = escapeHtml(origin);
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:${BRAND.color};font-family:${BRAND.fontStack};color:${BRAND.text};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BRAND.color};">
<tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:${BRAND.surface};border-radius:12px;overflow:hidden;border:1px solid ${BRAND.border};">
<tr><td align="center" style="padding:32px 40px 24px;border-bottom:1px solid ${BRAND.border};">
<a href="${safeOrigin}" target="_blank" style="text-decoration:none;border:none;">
<img src="${BRAND.logoUrl}" alt="704 Collective" width="160" style="display:block;max-width:160px;height:auto;border:0;" />
</a>
</td></tr>
<tr><td style="padding:32px 40px;">
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hey ${safeName}!</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">You have been invited to join <strong style="color:${BRAND.text};">704 Collective</strong> as an admin. Use the button below to finish setting up your account.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0;">
<tr><td align="center" style="background-color:${BRAND.accent};border-radius:8px;">
<a href="${safeCta}" target="_blank" style="display:inline-block;padding:14px 32px;font-size:16px;font-weight:600;color:${BRAND.accentText};text-decoration:none;border-radius:8px;">Set up your admin access</a>
</td></tr>
</table>
<p style="margin:0;font-size:13px;line-height:1.6;color:${BRAND.textMuted};">If you did not expect this invitation, you can ignore this email.</p>
</td></tr>
<tr><td style="padding:24px 40px;border-top:1px solid ${BRAND.border};">
<p style="margin:0;font-size:13px;color:${BRAND.textMuted};text-align:center;">704 Collective &middot; Charlotte, NC</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

async function sendBrandedAdminInviteEmail(to: string, name: string, ctaUrl: string, origin: string) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    console.error('[admin/invite] RESEND_API_KEY not configured; skipping branded email');
    return;
  }
  const html = adminInviteEmailHtml(name, ctaUrl, origin);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: '704 Collective <hello@704collective.com>',
      to,
      subject: 'You have been invited to join 704 Collective as an admin',
      html,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    console.error('[admin/invite] Resend error', { status: res.status, errText });
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.role !== 'admin' && profile?.role !== 'super_admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const body = await req.json();
  const { email, full_name, firstName, lastName, origin } = body;

  const resolvedName =
    full_name?.trim()
    || (firstName && lastName ? `${String(firstName).trim()} ${String(lastName).trim()}` : undefined)
    || firstName?.trim()
    || undefined;

  if (!email?.trim()) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[admin/invite] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }

  const siteBase = (
    process.env.NEXT_PUBLIC_SITE_URL
    || origin
    || req.headers.get('origin')
    || 'https://704collective.com'
  ).replace(/\/$/, '');

  const redirectTo = `${siteBase}/setup-password`;
  const displayName = resolvedName || email.trim();

  const adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const cleanEmail = email.trim().toLowerCase();

  const { data: inviteResult, error: inviteError } = await adminSupabase.auth.admin.inviteUserByEmail(
    cleanEmail,
    {
      redirectTo,
      data: {
        full_name: displayName,
        role: 'admin',
      },
    },
  );

  if (inviteError) {
    const errMsg = inviteError.message?.toLowerCase() ?? '';
    const looksLikeExisting =
      errMsg.includes('already')
      || errMsg.includes('registered')
      || errMsg.includes('exists');

    if (!looksLikeExisting) {
      return NextResponse.json({ error: inviteError.message }, { status: 400 });
    }

    const { data: existingRows } = await adminSupabase
      .from('profiles')
      .select('id, role, full_name')
      .eq('email', cleanEmail)
      .limit(1);

    const existing = existingRows?.[0];
    if (!existing) {
      return NextResponse.json({ error: inviteError.message }, { status: 400 });
    }

    if (existing.role === 'admin' || existing.role === 'super_admin') {
      return NextResponse.json(
        { error: `${existing.full_name || cleanEmail} is already an admin` },
        { status: 409 },
      );
    }

    const { error: upErr } = await adminSupabase
      .from('profiles')
      .update({ role: 'admin' })
      .eq('id', existing.id);
    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 400 });
    }

    await sendBrandedAdminInviteEmail(
      cleanEmail,
      displayName,
      redirectTo,
      siteBase,
    );

    return NextResponse.json({ success: true, isNewUser: false, user: { id: existing.id } });
  }

  const invitedUser = inviteResult.user;
  if (!invitedUser?.id) {
    return NextResponse.json({ error: 'Invite succeeded but no user returned' }, { status: 500 });
  }

  const { error: profileErr } = await adminSupabase.from('profiles').upsert(
    {
      id: invitedUser.id,
      email: cleanEmail,
      full_name: displayName,
      role: 'admin',
      subscription_status: 'inactive',
    },
    { onConflict: 'id' },
  );
  if (profileErr) {
    console.error('[admin/invite] profile upsert', profileErr.message);
  }

  await sendBrandedAdminInviteEmail(cleanEmail, displayName, redirectTo, siteBase);

  return NextResponse.json({ success: true, isNewUser: true, user: invitedUser });
}
