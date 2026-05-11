import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: { headers: { Authorization: authHeader } },
        auth: { autoRefreshToken: false, persistSession: false },
      }
    );

    const { data: { user: caller }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !caller) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: roleData, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', caller.id)
      .eq('role', 'admin')
      .single();

    if (roleError || !roleData) {
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { userId } = await req.json();

    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'User ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (userId === caller.id) {
      return new Response(
        JSON.stringify({ error: 'Cannot deactivate your own account' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Admin ${caller.id} is deactivating user ${userId}`);

    // ── Fetch profile and guard against non-social members ──
    const { data: profileData } = await supabaseAdmin
      .from('profiles')
      .select('subscription_id, stripe_customer_id, member_type')
      .eq('id', userId)
      .single();

    if (profileData?.member_type && profileData.member_type !== 'social') {
      return new Response(
        JSON.stringify({ error: `Cannot deactivate ${profileData.member_type} members from the admin panel` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Cancel any active Stripe subscriptions
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (stripeKey) {
      try {
        const stripe = new Stripe(stripeKey, { apiVersion: '2025-08-27.basil' });

        // Try stored subscription_id first
        if (profileData?.subscription_id) {
          try {
            await stripe.subscriptions.cancel(profileData.subscription_id);
            console.log(`Stripe subscription ${profileData.subscription_id} canceled for user ${userId}`);
          } catch (subErr) {
            const msg = subErr instanceof Error ? subErr.message : String(subErr);
            console.error(`Failed to cancel stored subscription (will try customer lookup): ${msg}`);
          }
        }

        // Fallback: look up active subscriptions by stripe_customer_id
        const customerId = profileData?.stripe_customer_id;
        if (customerId) {
          const activeSubs = await stripe.subscriptions.list({
            customer: customerId,
            status: 'active',
            limit: 10,
          });
          for (const sub of activeSubs.data) {
            // Skip if we already canceled this one above
            if (sub.id === profileData?.subscription_id) continue;
            try {
              await stripe.subscriptions.cancel(sub.id);
              console.log(`Stripe subscription ${sub.id} canceled (fallback) for user ${userId}`);
            } catch (subErr) {
              const msg = subErr instanceof Error ? subErr.message : String(subErr);
              console.error(`Failed to cancel subscription ${sub.id} (non-blocking): ${msg}`);
            }
          }
        }
      } catch (stripeErr) {
        const msg = stripeErr instanceof Error ? stripeErr.message : String(stripeErr);
        console.error(`Stripe cancellation error (non-blocking): ${msg}`);
      }
    } else {
      console.error('STRIPE_SECRET_KEY not set - could not cancel subscription');
    }

    // Soft delete: set deleted_at timestamp + clear subscription data
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        deleted_at: new Date().toISOString(),
        subscription_status: 'inactive',
        membership_override: false,
        cancel_at_period_end: false,
        subscription_id: null,
      })
      .eq('id', userId);

    if (profileError) {
      console.error('Failed to soft-delete profile:', profileError);
      return new Response(
        JSON.stringify({ error: profileError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Ban the auth user for 100 years to prevent login
    const { error: banError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      ban_duration: '876600h',
    });

    if (banError) {
      console.error('Failed to ban user:', banError);
      // Don't fail the whole operation — profile is already soft-deleted
    }

    console.log(`Successfully deactivated user ${userId}`);

    return new Response(
      JSON.stringify({ success: true, message: 'Member deactivated successfully' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Unexpected error:', error);
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
