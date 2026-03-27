import { createClient } from '@supabase/supabase-js';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export type InviteValidationResult =
  | { ok: false; reason: 'invalid' | 'not_found' | 'revoked' | 'used' }
  | { ok: true; inviteId: string; email: string | null; superAdminAutoApprove: boolean };

export async function validatePartnerInviteToken(token: string): Promise<InviteValidationResult> {
  const t = token?.trim();
  if (!t) return { ok: false, reason: 'invalid' };

  const admin = adminClient();
  const { data: invite } = await admin
    .from('partner_invites')
    .select('id, email, revoked, used, created_by')
    .eq('unique_token', t)
    .maybeSingle();

  if (!invite) return { ok: false, reason: 'not_found' };
  if (invite.revoked) return { ok: false, reason: 'revoked' };
  if (invite.used) return { ok: false, reason: 'used' };

  const { data: creator } = await admin
    .from('profiles')
    .select('role')
    .eq('id', invite.created_by)
    .maybeSingle();

  const superAdminAutoApprove = creator?.role === 'super_admin';

  return {
    ok: true,
    inviteId: invite.id,
    email: invite.email,
    superAdminAutoApprove,
  };
}
