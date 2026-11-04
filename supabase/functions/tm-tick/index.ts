import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const altSecretKey = Deno.env.get("SB_SECRET_KEY") ?? "";
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  let isServiceRole =
    (serviceKey.length > 0 && token === serviceKey) ||
    (altSecretKey.length > 0 && token === altSecretKey);
  if (!isServiceRole) {
    const anon = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      auth: { persistSession: false },
    });
    const { data: claims } = await anon.auth.getClaims(token);
    const role = (claims?.claims as { role?: string } | undefined)?.role;
    if (role === "service_role") {
      isServiceRole = true;
    } else {
      const uid = (claims?.claims as { sub?: string } | undefined)?.sub;
      if (!uid) return json({ error: "Unauthorized" }, 401);
      const { data: prof } = await supabase.from("profiles").select("role").eq("id", uid).maybeSingle();
      if (!prof || prof.role !== "super_admin") return json({ error: "Forbidden" }, 403);
    }
  }

  const { data, error } = await supabase.rpc("tm_tick");
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, result: data });
});
