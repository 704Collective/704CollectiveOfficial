import { createClient as createServiceClient } from '@supabase/supabase-js';

export const JOIN_BLOCKED_EMAIL_MESSAGE = "This email can't be used to join 704 Collective.";

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Supabase service role is not configured');
  }
  if (url.includes('bnmtynevbuplqpuqvmna') && process.env.NODE_ENV !== 'production') {
    throw new Error('Refusing to use the production Supabase URL from a non-production process');
  }
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function normalizeJoinEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Server-only. Uses the security-definer RPC; never query blocked_emails from the browser. */
export async function isEmailBlocked(email: string): Promise<boolean> {
  const normalized = normalizeJoinEmail(email);
  if (!normalized) return false;
  const admin = serviceClient();
  const { data, error } = await admin.rpc('is_email_blocked', { p_email: normalized });
  if (error) throw error;
  return data === true;
}
