import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** Call the centralised send-email render endpoint to get subject + HTML. */
async function renderTemplate(
  supabaseUrl: string,
  serviceKey: string,
  template: string,
  data: Record<string, unknown>,
): Promise<{ subject: string; html: string }> {
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendApiKey = Deno.env.get('RESEND_API_KEY')!;
    const siteUrl = Deno.env.get('SITE_URL') || 'https://704collective.com';

    // Verify this is called by service role or cron
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.includes(serviceRoleKey)) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Find all business members with incomplete profiles
    const { data: incompleteMembers, error } = await supabase
      .from('profiles')
      .select(`
        id,
        full_name,
        email,
        avatar_url,
        business_profiles (
          company_name,
          title,
          bio
        )
      `)
      .eq('member_type', 'business')
      .eq('subscription_status', 'active')
      .is('deleted_at', null)
      .eq('banned', false);

    if (error) throw error;

    // Filter to only those with incomplete required fields
    const needsReminder = (incompleteMembers || []).filter((member: any) => {
      const bp = member.business_profiles?.[0];
      const hasHeadshot = !!member.avatar_url;
      const hasCompany = !!bp?.company_name?.trim();
      const hasTitle = !!bp?.title?.trim();
      const hasBio = !!bp?.bio?.trim();
      return !(hasHeadshot && hasCompany && hasTitle && hasBio);
    });

    if (needsReminder.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, message: 'No incomplete profiles found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Internal/test accounts are never nagged
    const INTERNAL_EXCLUDE = new Set([
      'adam@cltbucketlist.com',
      'hello@704collective.com',
      'businesstest@704collective.com',
      'timi@cltbucketlist.com',
    ]);
    let recipients = needsReminder.filter(
      (m: any) => !INTERNAL_EXCLUDE.has((m.email || '').toLowerCase()),
    );

    // 14-day per-member cooldown via contact_activity (mirrors re-engagement's
    // 30-day pattern: check before send, stamp after successful send).
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const candidateIds = recipients.map((m: any) => m.id);
    if (candidateIds.length > 0) {
      const { data: recentSends, error: cooldownErr } = await supabase
        .from('contact_activity')
        .select('profile_id')
        .eq('activity_type', 'business_profile_reminder_sent')
        .gte('created_at', fourteenDaysAgo)
        .in('profile_id', candidateIds);
      if (cooldownErr) throw cooldownErr; // fail closed: never risk re-nagging everyone
      const cooling = new Set((recentSends ?? []).map((r: any) => r.profile_id));
      recipients = recipients.filter((m: any) => !cooling.has(m.id));
    }

    if (recipients.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, message: 'All incomplete profiles are excluded or within the 14-day cooldown' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const portalUrl = `${siteUrl}/business-portal/profile`;

    // Build batch emails using centralised template
    const emailPromises = recipients.map(async (member: any) => {
      const firstName   = member.full_name?.split(' ')[0] || 'there';
      const companyName = member.business_profiles?.[0]?.company_name || undefined;
      const { subject, html } = await renderTemplate(supabaseUrl, serviceRoleKey, 'business-profile-reminder', {
        name: firstName,
        companyName,
        portalUrl,
      });
      return {
        from: '704 Collective <hello@704collective.com>',
        to: member.email,
        subject,
        html,
      };
    });

    const emails = await Promise.all(emailPromises);

    // Send in batches of 100 via Resend batch API
    let totalSent = 0;
    let totalErrors = 0;

    for (let i = 0; i < emails.length; i += 100) {
      const batch = emails.slice(i, i + 100);
      const res = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(batch),
      });

      if (res.ok) {
        totalSent += batch.length;
        // Cooldown stamp: one row per recipient actually emailed in this batch.
        // recipients[] and emails[] share the same order/indexes.
        const stampedAt = new Date().toISOString();
        const activityRows = recipients.slice(i, i + 100).map((m: any) => ({
          activity_type: 'business_profile_reminder_sent',
          title: 'Business profile reminder sent',
          profile_id: m.id,
          created_at: stampedAt,
        }));
        const { error: stampErr } = await supabase.from('contact_activity').insert(activityRows);
        if (stampErr) {
          console.error('[business-profile-reminder] cooldown stamp insert failed:', stampErr.message);
        }
      } else {
        const err = await res.text();
        console.error('[business-profile-reminder] Resend batch error:', err);
        totalErrors += batch.length;
      }
    }

    console.log(`[business-profile-reminder] Sent ${totalSent}, errors ${totalErrors}`);

    return new Response(
      JSON.stringify({ sent: totalSent, errors: totalErrors, total: recipients.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    console.error('[business-profile-reminder] Error:', err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
