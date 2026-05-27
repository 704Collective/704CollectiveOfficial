// update-google-wallet-pass
// Flips a member's Google Wallet membership pass to "Membership Inactive".
//
// Google Wallet has no push: the genericObject lives on Google's servers and
// every device holding the pass reflects whatever that object currently says.
// So "updating the pass" = PATCH the genericObject via the Wallet API; Google
// propagates the change to all devices automatically.
//
// Invocation (internal, service-only):
//   POST { "serialNumber": "<profile id>" }
//   Authorization: Bearer <WALLET_PUSH_SECRET>
//
// Object ID scheme MUST match generate-wallet-pass exactly:
//   `${issuerId}.member_${userId.replace(/-/g, "_")}`
//
// Deploy:  supabase functions deploy update-google-wallet-pass --no-verify-jwt

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const logStep = (step: string, details?: unknown) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[GOOGLE-WALLET-UPDATE] ${step}${d}`);
};

// -- helpers (copied verbatim from generate-wallet-pass; proven working) --

function base64url(input: Uint8Array): string {
  let binary = "";
  for (const byte of input) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const cleaned = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\\n/g, "")
    .replace(/\s/g, "");
  const binary = Uint8Array.from(atob(cleaned), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    binary,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function createServiceAccountJwt(email: string, privateKeyPem: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: email,
    sub: email,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
    scope: "https://www.googleapis.com/auth/wallet_object.issuer",
  };

  const enc = new TextEncoder();
  const input = `${base64url(enc.encode(JSON.stringify(header)))}.${base64url(enc.encode(JSON.stringify(payload)))}`;
  const key = await importPrivateKey(privateKeyPem);
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(input)));
  return `${input}.${base64url(sig)}`;
}

async function getAccessToken(email: string, privateKey: string): Promise<string> {
  const jwt = await createServiceAccountJwt(email, privateKey);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Token exchange failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

// -- main handler --

Deno.serve(async (req) => {
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
    // -- Auth: internal service secret only --
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const pushSecret = Deno.env.get("WALLET_PUSH_SECRET");
    if (!pushSecret || token !== pushSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // -- Body: serialNumber (= profile id) --
    const body = await req.json().catch(() => null);
    const serialNumber =
      body && typeof body === "object" ? body.serialNumber : null;
    if (typeof serialNumber !== "string" || !serialNumber) {
      return new Response(JSON.stringify({ error: "serialNumber required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // -- Google Wallet secrets --
    const issuerId = Deno.env.get("GOOGLE_WALLET_ISSUER_ID");
    const serviceAccountEmail = Deno.env.get("GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL");
    const privateKey = Deno.env.get("GOOGLE_WALLET_PRIVATE_KEY");
    if (!issuerId || !serviceAccountEmail || !privateKey) {
      logStep("Google Wallet not configured");
      return new Response(JSON.stringify({ error: "Google Wallet not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // -- Object ID: MUST match generate-wallet-pass exactly --
    const objectId = `${issuerId}.member_${serialNumber.replace(/-/g, "_")}`;
    logStep("Resolved object id", { objectId });

    // -- Access token --
    let accessToken: string;
    try {
      accessToken = await getAccessToken(serviceAccountEmail, privateKey);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logStep("Access token failed", { error: msg });
      return new Response(JSON.stringify({ error: "Auth with Google failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // -- PATCH the genericObject: flip subheader to "Membership Inactive" --
    // PATCH only sends the fields we want to change; Google merges them.
    const patchBody = {
      subheader: {
        defaultValue: { language: "en", value: "Membership Inactive" },
      },
    };

    const patchRes = await fetch(
      `https://walletobjects.googleapis.com/walletobjects/v1/genericObject/${encodeURIComponent(objectId)}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(patchBody),
      },
    );

    const patchText = await patchRes.text().catch(() => "");

    if (patchRes.status === 404) {
      // No object on Google's side -> member never added a Google Wallet pass.
      // Not an error: nothing to update.
      logStep("Object not found (member has no Google Wallet pass)", { objectId });
      return new Response(
        JSON.stringify({ ok: true, updated: false, reason: "no_google_pass" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!patchRes.ok) {
      logStep("PATCH failed", { status: patchRes.status, body: patchText });
      return new Response(
        JSON.stringify({ error: "Failed to update Google Wallet pass" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    logStep("Object updated to Membership Inactive", { objectId });
    return new Response(JSON.stringify({ ok: true, updated: true }), {
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
