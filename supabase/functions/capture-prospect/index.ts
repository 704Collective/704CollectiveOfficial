import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { email, full_name, phone, sms_consent } = body as {
      email?: string;
      full_name?: string;
      phone?: string;
      sms_consent?: boolean;
    };

    if (!email) {
      return new Response(JSON.stringify({ error: "email is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const consentTrue = sms_consent === true;
    const { data: contact, error: upsertError } = await supabase
      .from("contacts")
      .upsert(
        {
          email: email.toLowerCase().trim(),
          full_name: full_name ?? null,
          phone: phone ?? null,
          source: "join_page",
          source_detail: "pre_checkout_capture",
          status: "active",
          sms_consent: consentTrue,
          sms_consent_at: consentTrue ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "email", ignoreDuplicates: false }
      )
      .select("id")
      .maybeSingle();

    if (upsertError) {
      console.error("[capture-prospect] upsert error:", upsertError);
      return new Response(JSON.stringify({ error: upsertError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (contact?.id) {
      const { error: tagError } = await supabase
        .from("contact_tags")
        .upsert(
          { contact_id: contact.id, tag: "prospect" },
          { onConflict: "contact_id,tag", ignoreDuplicates: true }
        );
      if (tagError) {
        console.error("[capture-prospect] tag error:", tagError);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[capture-prospect] unexpected error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
