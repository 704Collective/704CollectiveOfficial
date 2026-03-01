import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // Generate authorize URL
    if (action === "authorize") {
      const clientId = Deno.env.get("HUBSPOT_CLIENT_ID");
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      if (!clientId || !supabaseUrl) {
        return new Response("Server configuration error", { status: 500 });
      }
      const origin = url.searchParams.get("origin") || "";
      const redirectUri = `${supabaseUrl}/functions/v1/hubspot-oauth-callback`;
      const state = btoa(JSON.stringify({ origin }));
      const scopes = "crm.objects.contacts.read crm.objects.contacts.write crm.objects.deals.read crm.objects.deals.write";
      const authUrl = `https://app.hubspot.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&state=${state}`;
      return new Response(null, {
        status: 302,
        headers: { ...corsHeaders, Location: authUrl },
      });
    }

    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");

    if (!code) {
      return new Response("Missing authorization code", { status: 400 });
    }

    const clientId = Deno.env.get("HUBSPOT_CLIENT_ID");
    const clientSecret = Deno.env.get("HUBSPOT_CLIENT_SECRET");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!clientId || !clientSecret) {
      console.error("Missing HubSpot credentials");
      return new Response("Server configuration error", { status: 500 });
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Missing Supabase credentials");
      return new Response("Server configuration error", { status: 500 });
    }

    const redirectUri = `${supabaseUrl}/functions/v1/hubspot-oauth-callback`;

    // Exchange code for tokens
    const tokenResponse = await fetch(
      "https://api.hubapi.com/oauth/v1/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          code,
        }),
      }
    );

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("Token exchange failed:", errorText);
      return new Response("Failed to exchange authorization code", {
        status: 400,
      });
    }

    const tokens = await tokenResponse.json();
    const { access_token, refresh_token, expires_in } = tokens;

    // Get HubSpot account info
    const accountResponse = await fetch(
      "https://api.hubapi.com/oauth/v1/access-tokens/" + access_token
    );
    let accountName = "HubSpot Account";
    let accountId = null;
    if (accountResponse.ok) {
      const accountData = await accountResponse.json();
      accountName = accountData.hub_domain || accountData.user || "HubSpot Account";
      accountId = accountData.hub_id?.toString() || null;
    }

    const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Upsert into integrations table
    const { error: upsertError } = await supabase
      .from("integrations")
      .upsert(
        {
          provider: "hubspot",
          access_token,
          refresh_token,
          expires_at: expiresAt,
          account_name: accountName,
          account_id: accountId,
          scopes: [
            "crm.objects.contacts.read",
            "crm.objects.contacts.write",
            "crm.objects.deals.read",
            "crm.objects.deals.write",
          ],
          settings: { last_synced_at: null, sync_counts: {} },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "provider" }
      );

    if (upsertError) {
      console.error("Failed to store tokens:", upsertError);
      return new Response("Failed to store integration", { status: 500 });
    }

    // Parse the origin from state or use a default redirect
    let redirectUrl = "/admin/settings?hubspot=connected";
    if (state) {
      try {
        const stateData = JSON.parse(atob(state));
        if (stateData.origin) {
          redirectUrl = stateData.origin + "/admin/settings?hubspot=connected";
        }
      } catch {
        // State parsing failed, use default redirect
      }
    }

    return new Response(null, {
      status: 302,
      headers: { Location: redirectUrl },
    });
  } catch (error) {
    console.error("OAuth callback error:", error);
    return new Response("Internal server error", { status: 500 });
  }
});
