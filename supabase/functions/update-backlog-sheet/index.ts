import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BacklogRow {
  id: string;
  item: string;
  category: string;
  priority: string;
  status: string;
  date_added?: string;
  date_completed?: string;
  commit?: string;
  notes?: string;
}

type Action =
  | { action: "append_row"; row: BacklogRow }
  | { action: "update_by_id"; id: string; updates: Partial<BacklogRow> }
  | { action: "bulk_append"; rows: BacklogRow[] }
  | { action: "find_by_id"; id: string }
  | { action: "list_all" };

// Column order matches the sheet header row A..I
const COL_ORDER: (keyof BacklogRow)[] = [
  "id", "item", "category", "priority", "status",
  "date_added", "date_completed", "commit", "notes",
];

function rowToValues(row: BacklogRow): string[] {
  return COL_ORDER.map((k) => (row[k] ?? "") as string);
}

function valuesToRow(values: string[]): BacklogRow {
  const obj: Partial<BacklogRow> = {};
  COL_ORDER.forEach((k, i) => {
    (obj as Record<string, string>)[k] = values[i] ?? "";
  });
  return obj as BacklogRow;
}

// ---------------------------------------------------------------------------
// Google OAuth2 token (module-level cache, RS256 JWT)
// ---------------------------------------------------------------------------

interface TokenCache {
  accessToken: string;
  expiresAt: number; // epoch seconds
}

let tokenCache: TokenCache | null = null;

function pemToBinary(pem: string): Uint8Array {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const binary = atob(base64);
  return new Uint8Array([...binary].map((c) => c.charCodeAt(0)));
}

function base64urlEncode(data: Uint8Array | string): string {
  let bytes: Uint8Array;
  if (typeof data === "string") {
    bytes = new TextEncoder().encode(data);
  } else {
    bytes = data;
  }
  let binary = "";
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  // Reuse cached token if it won't expire within 10 minutes
  if (tokenCache && tokenCache.expiresAt - now > 600) {
    return tokenCache.accessToken;
  }

  const saJson = Deno.env.get("GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON");
  if (!saJson) throw new Error("GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON is not set");

  const sa = JSON.parse(saJson) as {
    client_email: string;
    private_key: string;
    token_uri: string;
  };

  // Build JWT header + payload
  const header = base64urlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64urlEncode(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: sa.token_uri,
      exp: now + 3600,
      iat: now,
    })
  );

  const signingInput = `${header}.${payload}`;

  // Import the PEM private key as PKCS#8
  const keyData = pemToBinary(sa.private_key);
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  // Sign
  const signatureBuffer = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );
  const signature = base64urlEncode(new Uint8Array(signatureBuffer));
  const jwt = `${signingInput}.${signature}`;

  // Exchange JWT for access token
  const tokenRes = await fetch(sa.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(`Failed to get Google access token: ${errText}`);
  }

  const tokenData = await tokenRes.json() as { access_token: string; expires_in: number };
  tokenCache = {
    accessToken: tokenData.access_token,
    // Refresh 10 minutes before actual expiry (expires_in is typically 3600)
    expiresAt: now + tokenData.expires_in,
  };

  return tokenCache.accessToken;
}

// ---------------------------------------------------------------------------
// Google Sheets API helpers
// ---------------------------------------------------------------------------

const SHEET_TAB = "Backlog";
const SHEET_RANGE = `${SHEET_TAB}!A:I`;

function sheetsUrl(sheetId: string, path: string): string {
  return `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}${path}`;
}

async function sheetsRequest(
  method: string,
  url: string,
  accessToken: string,
  body?: unknown
): Promise<Response> {
  return fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// Append one or more rows to the sheet
async function appendRows(
  sheetId: string,
  accessToken: string,
  rows: BacklogRow[]
): Promise<number> {
  const values = rows.map(rowToValues);
  const url =
    sheetsUrl(sheetId, `/values/${encodeURIComponent(SHEET_RANGE)}:append`) +
    "?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS";

  const res = await sheetsRequest("POST", url, accessToken, { values });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Sheets append failed (${res.status}): ${errText}`);
  }
  const data = await res.json() as { updates?: { updatedRows?: number } };
  return data.updates?.updatedRows ?? rows.length;
}

// Find the 1-based row number of an ID in column A. Returns null if not found.
async function findRowById(
  sheetId: string,
  accessToken: string,
  id: string
): Promise<{ rowNum: number; existingValues: string[] } | null> {
  const colARange = `${SHEET_TAB}!A:A`;
  const url = sheetsUrl(sheetId, `/values/${encodeURIComponent(colARange)}`);
  const res = await sheetsRequest("GET", url, accessToken);
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Sheets read failed (${res.status}): ${errText}`);
  }
  const data = await res.json() as { values?: string[][] };
  const colA = data.values ?? [];

  const rowIndex = colA.findIndex((r) => r[0] === id);
  if (rowIndex === -1) return null;

  const rowNum = rowIndex + 1; // Sheets is 1-based

  // Fetch the full row while we are here
  const rowRange = `${SHEET_TAB}!A${rowNum}:I${rowNum}`;
  const rowRes = await sheetsRequest(
    "GET",
    sheetsUrl(sheetId, `/values/${encodeURIComponent(rowRange)}`),
    accessToken
  );
  if (!rowRes.ok) {
    const errText = await rowRes.text();
    throw new Error(`Sheets row fetch failed (${rowRes.status}): ${errText}`);
  }
  const rowData = await rowRes.json() as { values?: string[][] };
  const existingValues = rowData.values?.[0] ?? [];

  return { rowNum, existingValues };
}

// Overwrite a specific row by row number
async function updateRow(
  sheetId: string,
  accessToken: string,
  rowNum: number,
  row: BacklogRow
): Promise<void> {
  const rowRange = `${SHEET_TAB}!A${rowNum}:I${rowNum}`;
  const url =
    sheetsUrl(sheetId, `/values/${encodeURIComponent(rowRange)}`) +
    "?valueInputOption=USER_ENTERED";

  const res = await sheetsRequest("PUT", url, accessToken, {
    values: [rowToValues(row)],
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Sheets update failed (${res.status}): ${errText}`);
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  // Auth check: caller must supply BACKLOG_AUTH_SECRET as Bearer token
  const authHeader = req.headers.get("Authorization");
  const serviceKey = Deno.env.get("BACKLOG_AUTH_SECRET");
  if (!authHeader || authHeader.replace("Bearer ", "") !== serviceKey) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401,
      headers: jsonHeaders,
    });
  }

  const sheetId = Deno.env.get("BACKLOG_SHEET_ID");
  if (!sheetId) {
    return new Response(
      JSON.stringify({ ok: false, error: "BACKLOG_SHEET_ID is not configured" }),
      { status: 500, headers: jsonHeaders }
    );
  }

  let body: Action;
  try {
    body = await req.json() as Action;
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON body" }), {
      status: 400,
      headers: jsonHeaders,
    });
  }

  try {
    const accessToken = await getAccessToken();

    // ---- append_row --------------------------------------------------------
    if (body.action === "append_row") {
      const rowsAffected = await appendRows(sheetId, accessToken, [body.row]);
      console.log("[UPDATE-BACKLOG-SHEET] append_row succeeded", {
        id: body.row.id,
        rows_affected: rowsAffected,
      });
      return new Response(
        JSON.stringify({ ok: true, rows_affected: rowsAffected }),
        { headers: jsonHeaders }
      );
    }

    // ---- bulk_append -------------------------------------------------------
    if (body.action === "bulk_append") {
      if (!Array.isArray(body.rows) || body.rows.length === 0) {
        return new Response(
          JSON.stringify({ ok: false, error: "rows must be a non-empty array" }),
          { status: 400, headers: jsonHeaders }
        );
      }
      const rowsAffected = await appendRows(sheetId, accessToken, body.rows);
      console.log("[UPDATE-BACKLOG-SHEET] bulk_append succeeded", {
        rows_affected: rowsAffected,
      });
      return new Response(
        JSON.stringify({ ok: true, rows_affected: rowsAffected }),
        { headers: jsonHeaders }
      );
    }

    // ---- list_all ----------------------------------------------------------
    if (body.action === "list_all") {
      const range = "Backlog!A2:I"; // Skip header row
      const response = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Sheets list failed (${response.status}): ${errText}`);
      }
      const result = await response.json();
      const values: string[][] = result.values || [];
      const rows: BacklogRow[] = values.map((row) => ({
        id: row[0] || "",
        item: row[1] || "",
        category: row[2] || "",
        priority: row[3] || "",
        status: row[4] || "",
        date_added: row[5] || "",
        date_completed: row[6] || "",
        commit: row[7] || "",
        notes: row[8] || "",
      })).filter(r => r.id); // Skip empty rows
      console.log(`[UPDATE-BACKLOG-SHEET] list_all returned ${rows.length} rows`);
      return new Response(
        JSON.stringify({ ok: true, count: rows.length, rows }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // ---- find_by_id --------------------------------------------------------
    if (body.action === "find_by_id") {
      const found = await findRowById(sheetId, accessToken, body.id);
      if (!found) {
        return new Response(
          JSON.stringify({ ok: true, rows_affected: 0, data: null }),
          { headers: jsonHeaders }
        );
      }
      const row = valuesToRow(found.existingValues);
      console.log("[UPDATE-BACKLOG-SHEET] find_by_id succeeded", {
        id: body.id,
        rows_affected: 1,
      });
      return new Response(
        JSON.stringify({ ok: true, rows_affected: 1, data: { rowNum: found.rowNum, row } }),
        { headers: jsonHeaders }
      );
    }

    // ---- update_by_id ------------------------------------------------------
    if (body.action === "update_by_id") {
      const found = await findRowById(sheetId, accessToken, body.id);
      if (!found) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: `Row with id "${body.id}" not found in sheet`,
          }),
          { status: 404, headers: jsonHeaders }
        );
      }

      // Merge existing row with incoming partial updates
      const existing = valuesToRow(found.existingValues);
      const merged: BacklogRow = { ...existing, ...body.updates, id: body.id };

      await updateRow(sheetId, accessToken, found.rowNum, merged);
      console.log("[UPDATE-BACKLOG-SHEET] update_by_id succeeded", {
        id: body.id,
        rows_affected: 1,
      });
      return new Response(
        JSON.stringify({ ok: true, rows_affected: 1, data: merged }),
        { headers: jsonHeaders }
      );
    }

    // Unknown action
    return new Response(
      JSON.stringify({ ok: false, error: `Unknown action: ${(body as { action: string }).action}` }),
      { status: 400, headers: jsonHeaders }
    );

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[UPDATE-BACKLOG-SHEET] Error:", message);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
