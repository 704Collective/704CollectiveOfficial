import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { buildInviteLink } from '@/lib/auth/inviteLink';

/** Call the centralised send-email render endpoint to get subject + HTML. */
async function renderTemplate(
  template: string,
  data: Record<string, unknown>,
): Promise<{ subject: string; html: string }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ mode: 'render', template, data }),
  });
  if (!res.ok) throw new Error(`Failed to render template ${template}: ${await res.text()}`);
  return res.json() as Promise<{ success: true; subject: string; html: string }>;
}

async function sendAdminInviteEmail(to: string, name: string, inviteUrl: string) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    console.error('[admin/invite] RESEND_API_KEY not configured; skipping invite email');
    return;
  }

  let subject: string;
  let html: string;
  try {
    ({ subject, html } = await renderTemplate('admin-invite-link', { name, inviteUrl }));
  } catch (err) {
    console.error('[admin/invite] renderTemplate failed, skipping email:', err);
    return;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: '704 Collective <hello@704collective.com>',
      to,
      subject,
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

  // Invite-links wave: the emailed URL is a token_hash link through /auth/callback
  // (server-side verify → /reset-password). GoTrue's own invite email carried an
  // implicit action_link the PKCE client refuses, so the user is created without
  // GoTrue mail and only our branded email goes out.
  const redirectTo = `${siteBase}/auth/callback`;
  const displayName = resolvedName || email.trim();

  const adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const cleanEmail = email.trim().toLowerCase();

  const setupLinkFor = async (): Promise<string | null> => {
    const { data: linkData, error: linkErr } = await adminSupabase.auth.admin.generateLink({
      type: 'recovery',
      email: cleanEmail,
      options: { redirectTo },
    });
    if (linkErr) { console.error('[admin/invite] generateLink failed', linkErr.message); return null; }
    return buildInviteLink(siteBase, linkData, 'recovery');
  };

  const { data: inviteResult, error: inviteError } = await adminSupabase.auth.admin.createUser({
    email: cleanEmail,
    email_confirm: true,
    user_metadata: {
      full_name: displayName,
      role: 'admin',
    },
  });

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

    const existingLink = await setupLinkFor();
    if (existingLink) await sendAdminInviteEmail(cleanEmail, displayName, existingLink);
    else console.error('[admin/invite] no usable setup link for existing user; email skipped');

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

  const newLink = await setupLinkFor();
  if (newLink) await sendAdminInviteEmail(cleanEmail, displayName, newLink);
  else console.error('[admin/invite] no usable setup link for new user; email skipped');

  return NextResponse.json({ success: true, isNewUser: true, user: invitedUser });
}
