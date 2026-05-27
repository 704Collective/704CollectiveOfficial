// send-apple-wallet-push
// Sends an empty APNs push to every device registered for a wallet pass,
// telling iOS to call the get-latest-pass endpoint and refresh the card.
//
// Invocation (service-role only):
//   POST { "serialNumber": "<pass serial>" }
//
// Deploy:  supabase functions deploy send-apple-wallet-push --no-verify-jwt

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const logStep = (step: string, details?: unknown) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[APNS-PUSH] ${step}${d}`);
};

// Base64url encode a string or bytes (no padding, URL-safe alphabet).
function base64url(input: string | Uint8Array): string {
  let bytes: Uint8Array;
  if (typeof input === "string") {
    bytes = new TextEncoder().encode(input);
  } else {
    bytes = input;
  }
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Import the .p8 PKCS#8 EC private key for ES256 signing.
async function importApnsKey(p8: string): Promise<CryptoKey> {
  const pem = p8
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  return await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

// Build a signed ES256 APNs JWT (valid ~1h).
async function buildApnsJwt(keyId: string, teamId: string, key: CryptoKey): Promise<string> {
  const header = { alg: "ES256", kid: keyId };
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: teamId, iat: now };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64url(new Uint8Array(sig))}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Service-role auth: only our own server code may trigger pushes.
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const pushSecret = Deno.env.get("WALLET_PUSH_SECRET")!;
    if (token !== pushSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => null);
    const serialNumber = body && typeof body === "object" ? body.serialNumber : null;
    if (typeof serialNumber !== "string" || !serialNumber) {
      return new Response(JSON.stringify({ error: "serialNumber required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apnsKeyB64 = Deno.env.get("APPLE_APNS_KEY_B64");
    const apnsKey = apnsKeyB64
      ? new TextDecoder().decode(Uint8Array.from(atob(apnsKeyB64), (c) => c.charCodeAt(0)))
      : null;
    const apnsKeyId = Deno.env.get("APPLE_APNS_KEY_ID");
    const teamId = Deno.env.get("APPLE_TEAM_ID");
    const passTypeId = Deno.env.get("APPLE_PASS_TYPE_ID");
    if (!apnsKey || !apnsKeyId || !teamId || !passTypeId) {
      logStep("Missing APNs secrets");
      return new Response(JSON.stringify({ error: "Server missing APNs configuration" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: regs, error: regErr } = await supabase
      .from("apple_wallet_registrations")
      .select("push_token")
      .eq("serial_number", serialNumber);
    if (regErr) {
      logStep("Registration lookup failed", { error: regErr.message });
      return new Response(JSON.stringify({ error: "Registration lookup failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!regs || regs.length === 0) {
      logStep("No registered devices for serial", { serialNumber });
      return new Response(JSON.stringify({ ok: true, pushed: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cryptoKey = await importApnsKey(apnsKey);
    const jwt = await buildApnsJwt(apnsKeyId, teamId, cryptoKey);

    let pushed = 0;
    let failed = 0;
    for (const reg of regs) {
      const pushToken = reg.push_token as string;
      try {
        const apnsResp = await fetch(`https://api.push.apple.com/3/device/${pushToken}`, {
          method: "POST",
          headers: {
            "authorization": `bearer ${jwt}`,
            "apns-topic": passTypeId,
            "apns-push-type": "background",
            "apns-priority": "5",
            "content-type": "application/json",
          },
          body: JSON.stringify({}),
        });
        if (apnsResp.ok) {
          pushed++;
        } else {
          failed++;
          const errText = await apnsResp.text().catch(() => "");
          logStep("APNs push rejected", { status: apnsResp.status, errText });
        }
      } catch (pushErr) {
        failed++;
        logStep("APNs push threw", {
          error: pushErr instanceof Error ? pushErr.message : String(pushErr),
        });
      }
    }

    logStep("Push batch complete", { serialNumber, pushed, failed });
    return new Response(JSON.stringify({ ok: true, pushed, failed }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logStep("Unhandled error", { error: msg });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});