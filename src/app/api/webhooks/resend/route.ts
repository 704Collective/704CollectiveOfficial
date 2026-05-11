import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const log = (step: string, details?: unknown) => {
  const suffix = details !== undefined ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[RESEND-WEBHOOK] ${step}${suffix}`);
};

// Resend webhook event types
type ResendEventType =
  | 'email.sent'
  | 'email.delivered'
  | 'email.opened'
  | 'email.clicked'
  | 'email.bounced'
  | 'email.complained';

interface ResendWebhookPayload {
  type: ResendEventType;
  created_at: string;
  data: {
    email_id: string;
    from?: string;
    to?: string[];
    subject?: string;
    click?: { link: string; userAgent?: string; ipAddress?: string };
    bounce?: { message?: string };
  };
}

const supabaseAdmin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

export async function POST(req: NextRequest) {
  // Read raw body text before any parsing — required for HMAC verification
  const rawBody = await req.text();

  // ── Signature verification ────────────────────────────────────────────────
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (webhookSecret) {
    const signature  = req.headers.get('svix-signature')  ?? req.headers.get('webhook-signature');
    const msgId      = req.headers.get('svix-id')         ?? req.headers.get('webhook-id');
    const timestamp  = req.headers.get('svix-timestamp')  ?? req.headers.get('webhook-timestamp');

    if (!signature || !msgId || !timestamp) {
      log('Missing webhook signature headers - rejecting');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
      const signedContent = `${msgId}.${timestamp}.${rawBody}`;
      const secret = webhookSecret.startsWith('whsec_')
        ? webhookSecret.slice(6)
        : webhookSecret;
      const keyBytes = Uint8Array.from(atob(secret), (c) => c.charCodeAt(0));
      const key = await crypto.subtle.importKey(
        'raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
      );
      const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedContent));
      const computedSig = `v1,${btoa(String.fromCharCode(...new Uint8Array(mac)))}`;

      // Resend sends space-separated list of sigs; any match is valid
      const sigs = signature.split(' ');
      const valid = sigs.some((s) => s === computedSig);
      if (!valid) {
        log('Webhook signature mismatch - rejecting');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      log('Signature verified');
    } catch (sigErr) {
      log('Signature verification error', sigErr instanceof Error ? sigErr.message : sigErr);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  } else {
    log('RESEND_WEBHOOK_SECRET not set - skipping signature verification');
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let payload: ResendWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    log('Invalid JSON body');
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { type, data, created_at } = payload;
  const emailId = data?.email_id;

  if (!emailId) {
    log('Missing email_id in payload');
    return NextResponse.json({ error: 'Missing email_id' }, { status: 400 });
  }

  log('Event received', { type, emailId });

  // ── Map event type → email_log update fields ──────────────────────────────
  type UpdateMap = Record<ResendEventType, Record<string, unknown>>;
  const updateMap: UpdateMap = {
    'email.sent':      { status: 'sent' },
    'email.delivered': { status: 'delivered', delivered_at: created_at },
    'email.opened':    { status: 'opened', opened_at: created_at, open_count: 1 }, // overridden below
    'email.clicked':   { status: 'clicked', clicked_at: created_at, click_url: data?.click?.link ?? null },
    'email.bounced':   { status: 'bounced', bounced_at: created_at },
    'email.complained': { status: 'complained', bounced_at: created_at },
  };

  const updates = updateMap[type];
  if (!updates) {
    log(`Unhandled event type: ${type}`);
    return NextResponse.json({ error: `Unhandled event type: ${type}` }, { status: 400 });
  }

  try {
    const supabase = supabaseAdmin();

    // ── email_log update ────────────────────────────────────────────────────
    if (type === 'email.opened') {
      // Increment open_count rather than reset to 1
      const { data: existing, error: fetchErr } = await supabase
        .from('email_log')
        .select('id, open_count')
        .eq('resend_id', emailId)
        .single();

      if (fetchErr) {
        log('email_log SELECT error (open)', fetchErr.message);
      }

      if (existing) {
        const { error: updateErr } = await supabase
          .from('email_log')
          .update({
            status: 'opened',
            opened_at: created_at,
            open_count: (existing.open_count ?? 0) + 1,
          })
          .eq('resend_id', emailId);

        if (updateErr) {
          log('email_log UPDATE error (open)', updateErr.message);
        } else {
          log('email_log updated (open)', { emailId, open_count: (existing.open_count ?? 0) + 1 });
        }
      } else {
        log('email_log row not found for open event', { emailId });
      }
    } else {
      const { error: updateErr } = await supabase
        .from('email_log')
        .update(updates)
        .eq('resend_id', emailId);

      if (updateErr) {
        log('email_log UPDATE error', { type, error: updateErr.message });
      } else {
        log('email_log updated', { type, emailId });
      }
    }

    // ── Bounce / complaint: unsubscribe contact ─────────────────────────────
    if (type === 'email.bounced' || type === 'email.complained') {
      const toEmail = data?.to?.[0];
      if (toEmail) {
        const { error: contactErr } = await supabase
          .from('contacts')
          .update({ unsubscribed: true, unsubscribed_at: created_at })
          .eq('email', toEmail);

        if (contactErr) {
          log('contacts UPDATE error', contactErr.message);
        } else {
          log('contact unsubscribed', { toEmail });
        }

        // Log activity record
        const { data: contact, error: contactLookupErr } = await supabase
          .from('contacts')
          .select('id')
          .eq('email', toEmail)
          .single();

        if (contactLookupErr) {
          log('contacts SELECT error', contactLookupErr.message);
        }

        if (contact) {
          const { error: activityErr } = await supabase.from('contact_activity').insert({
            contact_id: contact.id,
            type: type === 'email.complained' ? 'unsubscribed' : 'email_bounced',
            description: type === 'email.complained'
              ? 'Marked email as spam / complained'
              : 'Email bounced',
            created_at,
          });

          if (activityErr) {
            log('contact_activity INSERT error', activityErr.message);
          } else {
            log('contact_activity recorded', { type, contactId: contact.id });
          }
        }
      }
    }

    // ── Campaign aggregate stats (best-effort) ──────────────────────────────
    try {
      const { data: logRow } = await supabase
        .from('email_log')
        .select('campaign_id')
        .eq('resend_id', emailId)
        .single();

      if (logRow?.campaign_id) {
        const { data: stats } = await supabase
          .from('email_log')
          .select('status, open_count')
          .eq('campaign_id', logRow.campaign_id);

        if (stats) {
          const delivered = stats.filter((r) => ['delivered', 'opened', 'clicked'].includes(r.status ?? '')).length;
          const opened    = stats.filter((r) => ['opened', 'clicked'].includes(r.status ?? '')).length;
          const clicked   = stats.filter((r) => r.status === 'clicked').length;
          const bounced   = stats.filter((r) => ['bounced', 'complained'].includes(r.status ?? '')).length;

          const { error: campaignErr } = await supabase
            .from('email_campaigns')
            .update({ delivered_count: delivered, open_count: opened, click_count: clicked, bounce_count: bounced })
            .eq('id', logRow.campaign_id);

          if (campaignErr) {
            log('email_campaigns UPDATE error', campaignErr.message);
          } else {
            log('campaign stats updated', { campaignId: logRow.campaign_id, delivered, opened, clicked, bounced });
          }
        }
      }
    } catch (statsErr) {
      log('campaign stats error (non-fatal)', statsErr instanceof Error ? statsErr.message : statsErr);
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log('Unhandled error', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
