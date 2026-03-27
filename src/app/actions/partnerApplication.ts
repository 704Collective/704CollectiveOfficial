'use server';

import { runPartnerSignupFromFormData } from '@/lib/partnerSignupCore';

export type PartnerSubmitResult =
  | { ok: true }
  | { ok: false; error: string };

export async function submitPartnerApplication(formData: FormData): Promise<PartnerSubmitResult> {
  return runPartnerSignupFromFormData(formData);
}
