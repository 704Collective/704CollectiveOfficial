import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

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
      .select('id, title')
      .eq('id', event_id)
      .maybeSingle();

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Fetch all attendees from the canonical attendance_credentials layer
    // (replaces the legacy tickets + event_public_rsvps recipient build).
    const { data: creds } = await admin
      .from('attendance_credentials')
      .select('person_id')
      .eq('event_id', event_id)
      .in('status', ['active', 'used']);

    const personIds = Array.from(
      new Set((creds ?? []).map((c: any) => c.person_id).filter(Boolean)),
    ) as string[];

    let recipients: { email: string; name: string }[] = [];
    if (personIds.length > 0) {
      const { data: people } = await admin
        .from('people')
        .select('id, email, full_name')
        .in('id', personIds);
      recipients = (people ?? [])
        .filter((p: any) => p.email)
        .map((p: any) => ({ email: p.email as string, name: p.full_name || 'Guest' }));
    }

    // Merge and dedupe by email (case-insensitive). First-seen wins.
    const seenEmails = new Map<string, { email: string; name: string }>();
    for (const recipient of recipients) {
      const key = recipient.email.toLowerCase().trim();
      if (!seenEmails.has(key)) seenEmails.set(key, recipient);
    }
    const allRecipients = Array.from(seenEmails.values());

    if (allRecipients.length === 0) {
      return NextResponse.json({ success: true, sent: 0, message: 'No attendees to message' });
    }

    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    if (!RESEND_API_KEY) {
      return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 });
    }

    const eventUrl = `https://704collective.com/events/${event.id}`;

    // Render the template once — the message body is the same for all recipients
    const { subject: renderedSubject, html } = await renderTemplate('admin-message-to-attendees', {
      adminMessage: message,
      eventTitle:   event.title,
      eventUrl,
    });

    // Override subject with the admin-supplied subject (prefixed with event title)
    const finalSubject = `[${event.title}] ${subject}`;

    // Send in batches of 100
    const CHUNK = 100;
    let sent = 0;
    for (let i = 0; i < allRecipients.length; i += CHUNK) {
      const batch = allRecipients.slice(i, i + CHUNK).map(({ email }) => ({
        from: '704 Collective <hello@704collective.com>',
        to: email,
        subject: finalSubject,
        html,
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
