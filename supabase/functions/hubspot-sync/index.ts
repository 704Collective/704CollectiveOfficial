import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<{ access_token: string; refresh_token: string; expires_in: number } | null> {
  const response = await fetch("https://api.hubapi.com/oauth/v1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    console.error("Token refresh failed:", await response.text());
    return null;
  }

  return response.json();
}

async function hubspotRequest(
  accessToken: string,
  method: string,
  endpoint: string,
  body?: unknown
) {
  const response = await fetch(`https://api.hubapi.com${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json();
  if (!response.ok) {
    console.error(`HubSpot API error [${endpoint}]:`, data);
    throw new Error(`HubSpot API error: ${response.status}`);
  }
  return data;
}

async function syncMembers(supabase: any, accessToken: string) {
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, member_type, subscription_status, hubspot_contact_id")
    .not("email", "is", null)
    .is("deleted_at", null);

  if (error || !profiles) {
    console.error("Failed to fetch profiles:", error);
    return 0;
  }

  let synced = 0;
  for (const profile of profiles) {
    try {
      const nameParts = (profile.full_name || "").split(" ");
      const firstName = nameParts[0] || "";
      const lastName = nameParts.slice(1).join(" ") || "";

      const properties: Record<string, string> = {
        email: profile.email,
        firstname: firstName,
        lastname: lastName,
      };
      if (profile.member_type) properties.member_type = profile.member_type;
      if (profile.subscription_status) properties.subscription_status = profile.subscription_status;

      if (profile.hubspot_contact_id) {
        // Update existing contact
        await hubspotRequest(
          accessToken,
          "PATCH",
          `/crm/v3/objects/contacts/${profile.hubspot_contact_id}`,
          { properties }
        );
      } else {
        // Create or find by email
        try {
          const result = await hubspotRequest(
            accessToken,
            "POST",
            "/crm/v3/objects/contacts",
            { properties }
          );
          await supabase
            .from("profiles")
            .update({ hubspot_contact_id: result.id })
            .eq("id", profile.id);
        } catch {
          // Contact may already exist, search by email
          const searchResult = await hubspotRequest(
            accessToken,
            "POST",
            "/crm/v3/objects/contacts/search",
            {
              filterGroups: [
                {
                  filters: [
                    { propertyName: "email", operator: "EQ", value: profile.email },
                  ],
                },
              ],
            }
          );
          if (searchResult.results?.length > 0) {
            const contactId = searchResult.results[0].id;
            await hubspotRequest(
              accessToken,
              "PATCH",
              `/crm/v3/objects/contacts/${contactId}`,
              { properties }
            );
            await supabase
              .from("profiles")
              .update({ hubspot_contact_id: contactId })
              .eq("id", profile.id);
          }
        }
      }
      synced++;
    } catch (err) {
      console.error(`Failed to sync profile ${profile.id}:`, err);
    }
  }
  return synced;
}

async function syncProspects(supabase: any, accessToken: string) {
  const { data: prospects, error } = await supabase
    .from("prospects")
    .select("id, email, full_name, hubspot_contact_id");

  if (error || !prospects) {
    console.error("Failed to fetch prospects:", error);
    return 0;
  }

  let synced = 0;
  for (const prospect of prospects) {
    try {
      const nameParts = (prospect.full_name || "").split(" ");
      const firstName = nameParts[0] || "";
      const lastName = nameParts.slice(1).join(" ") || "";

      const properties: Record<string, string> = {
        email: prospect.email,
        firstname: firstName,
        lastname: lastName,
        lifecyclestage: "lead",
      };

      if (prospect.hubspot_contact_id) {
        await hubspotRequest(
          accessToken,
          "PATCH",
          `/crm/v3/objects/contacts/${prospect.hubspot_contact_id}`,
          { properties }
        );
      } else {
        try {
          const result = await hubspotRequest(
            accessToken,
            "POST",
            "/crm/v3/objects/contacts",
            { properties }
          );
          await supabase
            .from("prospects")
            .update({ hubspot_contact_id: result.id })
            .eq("id", prospect.id);
        } catch {
          const searchResult = await hubspotRequest(
            accessToken,
            "POST",
            "/crm/v3/objects/contacts/search",
            {
              filterGroups: [
                {
                  filters: [
                    { propertyName: "email", operator: "EQ", value: prospect.email },
                  ],
                },
              ],
            }
          );
          if (searchResult.results?.length > 0) {
            const contactId = searchResult.results[0].id;
            await hubspotRequest(
              accessToken,
              "PATCH",
              `/crm/v3/objects/contacts/${contactId}`,
              { properties }
            );
            await supabase
              .from("prospects")
              .update({ hubspot_contact_id: contactId })
              .eq("id", prospect.id);
          }
        }
      }
      synced++;
    } catch (err) {
      console.error(`Failed to sync prospect ${prospect.id}:`, err);
    }
  }
  return synced;
}

async function syncSponsors(supabase: any, accessToken: string) {
  const { data: sponsors, error } = await supabase
    .from("sponsors_vendors")
    .select("id, company_name, contact_name, email, partnership_type, status, hubspot_deal_id");

  if (error || !sponsors) {
    console.error("Failed to fetch sponsors:", error);
    return 0;
  }

  let synced = 0;
  for (const sponsor of sponsors) {
    try {
      const properties: Record<string, string> = {
        dealname: sponsor.company_name,
        dealstage: "appointmentscheduled",
      };
      if (sponsor.partnership_type) properties.partnership_type = sponsor.partnership_type;
      if (sponsor.status) properties.deal_status = sponsor.status;
      if (sponsor.contact_name) properties.contact_name = sponsor.contact_name;

      if (sponsor.hubspot_deal_id) {
        await hubspotRequest(
          accessToken,
          "PATCH",
          `/crm/v3/objects/deals/${sponsor.hubspot_deal_id}`,
          { properties }
        );
      } else {
        const result = await hubspotRequest(
          accessToken,
          "POST",
          "/crm/v3/objects/deals",
          { properties }
        );
        await supabase
          .from("sponsors_vendors")
          .update({ hubspot_deal_id: result.id })
          .eq("id", sponsor.id);
      }
      synced++;
    } catch (err) {
      console.error(`Failed to sync sponsor ${sponsor.id}:`, err);
    }
  }
  return synced;
}

async function syncEventActivity(supabase: any, accessToken: string) {
  // Get recent check-ins with event details
  const { data: tickets, error } = await supabase
    .from("tickets")
    .select("id, user_id, event_id, checked_in_at, status")
    .not("checked_in_at", "is", null)
    .order("checked_in_at", { ascending: false })
    .limit(100);

  if (error || !tickets || tickets.length === 0) return 0;

  const eventIds = [...new Set(tickets.map((t: any) => t.event_id).filter(Boolean))];
  const userIds = [...new Set(tickets.map((t: any) => t.user_id).filter(Boolean))];

  const { data: events } = await supabase
    .from("events")
    .select("id, title, start_time")
    .in("id", eventIds);

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, hubspot_contact_id")
    .in("id", userIds)
    .not("hubspot_contact_id", "is", null)
    .is("deleted_at", null);

  if (!profiles || !events) return 0;

  const eventMap = new Map(events.map((e: any) => [e.id, e]));
  const profileMap = new Map(profiles.map((p: any) => [p.id, p.hubspot_contact_id]));

  let logged = 0;
  for (const ticket of tickets) {
    const contactId = profileMap.get(ticket.user_id);
    const event = eventMap.get(ticket.event_id);
    if (!contactId || !event) continue;

    try {
      const eventDate = new Date(event.start_time).toLocaleDateString();
      await hubspotRequest(accessToken, "POST", `/crm/v3/objects/notes`, {
        properties: {
          hs_note_body: `Attended: ${event.title} on ${eventDate}`,
          hs_timestamp: new Date(ticket.checked_in_at).getTime(),
        },
        associations: [
          {
            to: { id: contactId },
            types: [
              {
                associationCategory: "HUBSPOT_DEFINED",
                associationTypeId: 202,
              },
            ],
          },
        ],
      });
      logged++;
    } catch (err) {
      console.error(`Failed to log activity for ticket ${ticket.id}:`, err);
    }
  }
  return logged;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify admin auth
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const clientId = Deno.env.get("HUBSPOT_CLIENT_ID")!;
    const clientSecret = Deno.env.get("HUBSPOT_CLIENT_SECRET")!;

    // Verify the user is admin
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: isAdmin } = await userClient.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });

    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get HubSpot integration
    const { data: integration, error: intError } = await supabase
      .from("integrations")
      .select("*")
      .eq("provider", "hubspot")
      .single();

    if (intError || !integration) {
      return new Response(
        JSON.stringify({ error: "HubSpot not connected" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let accessToken = integration.access_token!;

    // Refresh token if expired
    if (integration.expires_at && new Date(integration.expires_at) <= new Date()) {
      const refreshed = await refreshAccessToken(
        integration.refresh_token!,
        clientId,
        clientSecret
      );
      if (!refreshed) {
        return new Response(
          JSON.stringify({ error: "Failed to refresh HubSpot token. Please reconnect." }),
          {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      accessToken = refreshed.access_token;
      await supabase
        .from("integrations")
        .update({
          access_token: refreshed.access_token,
          refresh_token: refreshed.refresh_token,
          expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("provider", "hubspot");
    }

    // Run syncs
    const membersSynced = await syncMembers(supabase, accessToken);
    const prospectsSynced = await syncProspects(supabase, accessToken);
    const sponsorsSynced = await syncSponsors(supabase, accessToken);
    const activitiesLogged = await syncEventActivity(supabase, accessToken);

    const syncSummary = {
      members: membersSynced,
      prospects: prospectsSynced,
      sponsors: sponsorsSynced,
      activities: activitiesLogged,
      synced_at: new Date().toISOString(),
    };

    // Update integration settings
    await supabase
      .from("integrations")
      .update({
        settings: {
          last_synced_at: syncSummary.synced_at,
          sync_counts: {
            members: membersSynced,
            prospects: prospectsSynced,
            sponsors: sponsorsSynced,
            activities: activitiesLogged,
          },
        },
        updated_at: new Date().toISOString(),
      })
      .eq("provider", "hubspot");

    return new Response(JSON.stringify(syncSummary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Sync error:", error);
    return new Response(
      JSON.stringify({ error: "Sync failed", details: String(error) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
