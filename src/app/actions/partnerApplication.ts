'use server';

export type { InviteValidationResult } from '@/lib/partnerInviteToken';
export { validatePartnerInviteToken } from '@/lib/partnerInviteToken';

export type PartnerSubmitResult =
  | { ok: true }
  | { ok: false; error: string };

import { runPartnerSignupFromFormData } from '@/lib/partnerSignupCore';

export async function submitPartnerApplication(formData: FormData): Promise<PartnerSubmitResult> {
  return runPartnerSignupFromFormData(formData);
}
