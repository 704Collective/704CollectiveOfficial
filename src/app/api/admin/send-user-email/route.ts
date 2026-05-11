import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const PRODUCTION_ORIGIN = 'https://704collective.com';

const supabaseAdmin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

export async function POST(req: NextRequest) {
  try {
    // ── 1. Auth: validate caller JWT ──────────────────────────────────────────
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } }
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── 2. Role check: admin or super_admin only ───────────────────────────────
    const admin = supabaseAdmin();
    const { data: callerProfile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (!callerProfile || !['admin', 'super_admin'].includes(callerProfile.role ?? '')) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // ── 3. Parse and validate body ────────────────────────────────────────────
    const body = await req.json() as {
      recipient_email?: string;
      recipient_name?: string;
      template?: string;
      subject?: string;
      body_text?: string;
      recipient_user_id?: string;
    };

    const { recipient_email, recipient_name, template, subject, body_text, recipient_user_id } = body;

    if (!recipient_email || !recipient_name || !template) {
      return NextResponse.json(
        { error: 'recipient_email, recipient_name, and template are required' },
        { status: 400 }
      );
    }

    if (!['welcome-new', 'welcome-back', 'admin-custom'].includes(template)) {
      return NextResponse.json(
        { error: `Invalid template: ${template}. Allowed: welcome-new, welcome-back, admin-custom` },
        { status: 400 }
      );
    }

    if (template === 'admin-custom') {
      if (!subject || !subject.trim()) {
        return NextResponse.json({ error: 'subject is required for admin-custom emails' }, { status: 400 });
      }
      if (!body_text || !body_text.trim()) {
        return NextResponse.json({ error: 'body_text is required for admin-custom emails' }, { status: 400 });
      }
    }

    if ((template === 'welcome-new' || template === 'welcome-back') && !recipient_user_id) {
      return NextResponse.json(
        { error: 'recipient_user_id is required for welcome email templates' },
        { status: 400 }
      );
    }

    // ── 4. Build template payload ──────────────────────────────────────────────
    let templateData: Record<string, unknown>;

    if (template === 'admin-custom') {
      templateData = {
        recipientName: recipient_name,
        subject: subject!.trim(),
        bodyText: body_text!.trim(),
        origin: PRODUCTION_ORIGIN,
      };
    } else {
      // welcome-new or welcome-back: look up calendar_token on the recipient's profile
      const { data: recipientProfile, error: profileErr } = await admin
        .from('profiles')
        .select('calendar_token')
        .eq('id', recipient_user_id!)
        .maybeSingle();

      if (profileErr || !recipientProfile) {
        return NextResponse.json(
          { error: 'Cannot send welcome email - recipient is not a member or profile not found' },
          { status: 400 }
        );
      }

      const calendarToken = recipientProfile.calendar_token as string | null;
      const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace('https://', '');
      const calendarUrl = calendarToken
        ? `webcal://${supabaseHost}/functions/v1/calendar-feed?token=${calendarToken}`
        : `${PRODUCTION_ORIGIN}/dashboard`;

      templateData = {
        name: recipient_name,
        calendarUrl,
        origin: PRODUCTION_ORIGIN,
      };
    }

    // ── 5. Invoke send-email Edge Function via service role ────────────────────
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const emailRes = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        to: recipient_email,
        template,
        // Admin-initiated re-sends don't CC hello@ (skipCc: true for all modes)
        skipCc: true,
        data: templateData,
      }),
    });

    if (!emailRes.ok) {
      const errText = await emailRes.text();
      console.error('[SEND-USER-EMAIL] send-email function error', { status: emailRes.status, errText });
      return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unexpected error';
    console.error('[SEND-USER-EMAIL]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
