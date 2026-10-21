// Bad input for check-email-status. Valid JSON with an email string continues
// into the existing format check and lookup. Anything else is a 400.

export type ParsedCheckEmailStatusBody =
  | { ok: true; email: string }
  | { ok: false; error: string };

export function parseCheckEmailStatusBody(raw: string): ParsedCheckEmailStatusBody {
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Invalid JSON body" };
  }

  const email =
    body !== null && typeof body === "object" ? (body as { email?: unknown }).email : undefined;
  const rawEmail = (email ?? "").toString().trim();
  if (!rawEmail) {
    return { ok: false, error: "Missing required field: email" };
  }
  return { ok: true, email: rawEmail };
}
