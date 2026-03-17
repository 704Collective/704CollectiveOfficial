import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    // A profile is incomplete if missing: avatar_url, company_name, title, bio
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

    // Build missing fields list per member for personalized email
    const buildMissingFields = (member: any): string[] => {
      const bp = member.business_profiles?.[0];
      return [
        !member.avatar_url && 'Profile photo (headshot)',
        !bp?.company_name?.trim() && 'Company name',
        !bp?.title?.trim() && 'Title / Role',
        !bp?.bio?.trim() && 'Biography',
      ].filter(Boolean) as string[];
    };

    // Send emails in batch via Resend
    const emails = needsReminder.map((member: any) => {
      const firstName = member.full_name?.split(' ')[0] || 'there';
      const missingFields = buildMissingFields(member);
      const missingList = missingFields.map(f => `<li style="margin-bottom:4px;">${f}</li>`).join('');

      return {
        from: 'no-reply@704collective.com',
        to: member.email,
        subject: 'Complete your 704 Collective business profile',
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#0a0a0a;font-family:'Plus Jakarta Sans',sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px;">

    <!-- Logo -->
    <div style="text-align:center;margin-bottom:32px;">
      <img src="${siteUrl}/og-image.png" alt="704 Collective" style="height:40px;width:auto;" />
    </div>

    <!-- Card -->
    <div style="background-color:#111111;border:1px solid rgba(198,166,100,0.2);border-radius:14px;padding:32px;">
      <p style="font-size:0.6875rem;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#C6A664;margin:0 0 12px;">
        Business Portal
      </p>
      <h1 style="font-size:1.5rem;font-weight:700;color:#FFFFFF;margin:0 0 16px;line-height:1.3;">
        Hey ${firstName}, your profile isn't visible yet
      </h1>
      <p style="font-size:0.9375rem;color:rgba(255,255,255,0.55);line-height:1.7;margin:0 0 24px;">
        You're missing a few required fields before you appear in the 704 Collective business member directory. Other members won't be able to find or connect with you until your profile is complete.
      </p>

      <!-- Missing fields -->
      <div style="background-color:rgba(198,166,100,0.06);border:1px solid rgba(198,166,100,0.2);border-radius:10px;padding:16px 20px;margin-bottom:24px;">
        <p style="font-size:0.8125rem;font-weight:600;color:#C6A664;margin:0 0 10px;">Still needed:</p>
        <ul style="margin:0;padding-left:20px;color:rgba(255,255,255,0.6);font-size:0.875rem;line-height:1.6;">
          ${missingList}
        </ul>
      </div>

      <!-- CTA -->
      <a href="${siteUrl}/business-portal/profile"
        style="display:block;text-align:center;background-color:#C6A664;color:#1A1A1A;font-weight:700;font-size:0.9375rem;padding:14px 24px;border-radius:10px;text-decoration:none;">
        Complete My Profile →
      </a>
    </div>

    <!-- Footer -->
    <div style="text-align:center;margin-top:24px;">
      <p style="font-size:0.75rem;color:rgba(255,255,255,0.2);margin:0;">
        704 Collective · Charlotte, NC
      </p>
    </div>
  </div>
</body>
</html>
        `.trim(),
      };
    });

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
      } else {
        const err = await res.text();
        console.error('[business-profile-reminder] Resend batch error:', err);
        totalErrors += batch.length;
      }
    }

    console.log(`[business-profile-reminder] Sent ${totalSent}, errors ${totalErrors}`);

    return new Response(
      JSON.stringify({ sent: totalSent, errors: totalErrors, total: needsReminder.length }),
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