import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from "https://esm.sh/stripe@18.5.0";
import { markPersonCanceled, removeHubSeats, voidPersonCredentials } from "../_shared/membershipCascade.ts";

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
      .select('subscription_id, stripe_customer_id, member_type, email')
      .eq('id', userId)
      .single();

    if (profileData?.member_type && profileData.member_type !== 'social') {
      return new Response(
        JSON.stringify({ error: `Cannot deactivate ${profileData.member_type} members from the admin panel` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Wave 10: Stripe FIRST, fail closed ──────────────────────────────────
    // The point of this button is to stop charging someone. If Stripe cannot
    // confirm every live subscription is canceled, nothing below runs and the
    // profile stays exactly as it was - a still-billing member must never be
    // hidden behind a soft-deleted profile the webhook can no longer see.
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) {
      console.error('STRIPE_SECRET_KEY not set - refusing to deactivate without cancelling billing');
      return new Response(
        JSON.stringify({ error: 'stripe_unavailable', message: 'Billing could not be reached; member NOT deactivated.' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const canceledSubs: string[] = [];
    try {
      const stripe = new Stripe(stripeKey, { apiVersion: '2025-08-27.basil' });
      const live = new Map<string, string>(); // sub id -> status

      if (profileData?.stripe_customer_id) {
        const subs = await stripe.subscriptions.list({ customer: profileData.stripe_customer_id, status: 'all', limit: 100 });
        for (const s of subs.data) {
          if (s.status !== 'canceled' && s.status !== 'incomplete_expired') live.set(s.id, s.status);
        }
      }
      if (profileData?.subscription_id && !live.has(profileData.subscription_id)) {
        // The stored id may belong to a customer the profile does not point at.
        try {
          const s = await stripe.subscriptions.retrieve(profileData.subscription_id);
          if (s.status !== 'canceled' && s.status !== 'incomplete_expired') live.set(s.id, s.status);
        } catch (retrieveErr) {
          const msg = retrieveErr instanceof Error ? retrieveErr.message : String(retrieveErr);
          // A stored id Stripe does not know cannot be billing anyone; log and move on.
          console.warn(`Stored subscription_id not retrievable (${msg}); continuing with customer lookup result`);
        }
      }

      for (const [subId, status] of live) {
        await stripe.subscriptions.cancel(subId); // throws -> hard stop below
        canceledSubs.push(subId);
        console.log(`Stripe subscription ${subId} (${status}) canceled for user ${userId}`);
      }
      if (live.size === 0) console.log(`No live Stripe subscription for user ${userId}; nothing to cancel`);
    } catch (stripeErr) {
      const msg = stripeErr instanceof Error ? stripeErr.message : String(stripeErr);
      console.error(`Stripe cancellation FAILED - member NOT deactivated: ${msg}`);
      return new Response(
        JSON.stringify({
          error: 'stripe_cancel_failed',
          message: 'Stripe refused to cancel this member\'s subscription. Nothing was changed; fix billing first, then retry.',
          details: msg,
          canceled_so_far: canceledSubs,
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Wave 10: the membership-end cascade, BEFORE the soft-delete ─────────
    // After deleted_at is set the webhook's profile lookup skips this customer
    // forever, so hub seats, the person's status and their credentials must be
    // handled here. Same steps as stripe-webhook's handleSubscriptionDeleted.
    let cascade: { hub_seats_removed: number; person_id: string | null; credentials_voided: number };
    try {
      const seats = await removeHubSeats(supabaseAdmin, userId, 'admin-delete-user');
      const personId = await markPersonCanceled(supabaseAdmin, { authUserId: userId, email: profileData?.email ?? null, source: 'admin-delete-user' });
      const voided = personId ? await voidPersonCredentials(supabaseAdmin, { personId, profileId: userId, source: 'admin-delete-user' }) : 0;
      cascade = { hub_seats_removed: seats, person_id: personId, credentials_voided: voided };
    } catch (cascadeErr) {
      const msg = cascadeErr instanceof Error ? cascadeErr.message : String(cascadeErr);
      console.error(`Cascade FAILED after Stripe cancel - profile left un-deleted for retry: ${msg}`);
      return new Response(
        JSON.stringify({
          error: 'cascade_failed',
          message: 'Billing was canceled but the membership cascade failed. Retry; Stripe has nothing left to cancel.',
          details: msg,
          stripe_canceled: canceledSubs,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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

    console.log(`Successfully deactivated user ${userId}`, { stripe_canceled: canceledSubs, ...cascade });

    return new Response(
      JSON.stringify({ success: true, message: 'Member deactivated successfully', stripe_canceled: canceledSubs, ...cascade }),
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
