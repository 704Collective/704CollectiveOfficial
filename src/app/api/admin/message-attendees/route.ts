import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Validate caller is admin using their JWT
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } }
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = supabaseAdmin();
    const { data: profile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile || !['admin', 'super_admin'].includes(profile.role ?? '')) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { event_id, subject, message } = await req.json();
    if (!event_id || !subject || !message) {
      return NextResponse.json({ error: 'event_id, subject, and message are required' }, { status: 400 });
    }

    // Fetch event details
    const { data: event } = await admin
      .from('events')
      .select('title')
      .eq('id', event_id)
      .maybeSingle();

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Fetch all confirmed ticket holders
    const { data: tickets } = await admin
      .from('tickets')
      .select('user_id, guest_email, guest_name')
      .eq('event_id', event_id)
      .in('status', ['confirmed', 'rsvp']);

    const memberIds = (tickets ?? [])
      .filter((t: any) => t.user_id)
      .map((t: any) => t.user_id as string);

    let memberEmails: { email: string; name: string }[] = [];
    if (memberIds.length > 0) {
      const { data: profiles } = await admin
        .from('profiles')
        .select('email, full_name')
        .in('id', memberIds)
        .is('deleted_at', null);
      memberEmails = (profiles ?? []).map((p: any) => ({ email: p.email, name: p.full_name || 'Member' }));
    }

    const guestEmails = (tickets ?? [])
      .filter((t: any) => t.guest_email)
      .map((t: any) => ({ email: t.guest_email as string, name: t.guest_name || 'Guest' }));

    const allRecipients = [...memberEmails, ...guestEmails];

    if (allRecipients.length === 0) {
      return NextResponse.json({ success: true, sent: 0, message: 'No attendees to message' });
    }

    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    if (!RESEND_API_KEY) {
      return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 });
    }

    const escHtml = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const emailHtml = (name: string) => `<!DOCTYPE html><html>
<body style="font-family:'Plus Jakarta Sans',sans-serif;background:#1A1A1A;color:#FAF6F0;padding:32px;">
<img src="https://chnpjxwcmxkmcdoivmra.supabase.co/storage/v1/object/public/public-assets/704-logo.png" alt="704 Collective" width="120" style="margin-bottom:24px;" />
<h2 style="color:#C6A664;margin:0 0 8px;">Message from 704 Collective</h2>
<p style="color:#D8D8D8;margin:0 0 8px;">Hey ${escHtml(name)},</p>
<p style="color:#D8D8D8;margin:0 0 24px;">This is a message from the organizers of <strong>${escHtml(event.title)}</strong>:</p>
<div style="background:#2E2E2E;border-radius:8px;padding:20px;margin:0 0 24px;white-space:pre-wrap;color:#FAF6F0;">${escHtml(message)}</div>
<p style="font-size:13px;color:#A0A0A0;">— 704 Collective Team</p>
</body></html>`;

    // Send in batches of 100
    const CHUNK = 100;
    let sent = 0;
    for (let i = 0; i < allRecipients.length; i += CHUNK) {
      const batch = allRecipients.slice(i, i + CHUNK).map(({ email, name }) => ({
        from: '704 Collective <hello@704collective.com>',
        to: email,
        subject: `[${event.title}] ${subject}`,
        html: emailHtml(name),
      }));

      const res = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify(batch),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error('[MESSAGE-ATTENDEES] Resend error', { status: res.status, errText });
      } else {
        sent += batch.length;
      }
    }

    return NextResponse.json({ success: true, sent });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unexpected error';
    console.error('[MESSAGE-ATTENDEES]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
