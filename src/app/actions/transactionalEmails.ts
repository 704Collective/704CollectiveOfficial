'use server';

import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

const ORIGIN = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://704collective.com';

async function serviceSendEmail(to: string, template: string, data: Record<string, unknown>) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  await fetch(`${url}/functions/v1/send-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ to, template, data: { ...data, origin: data.origin ?? ORIGIN } }),
  });
}

/** After social signup while session exists — confirms we received their registration. */
export async function sendSocialSignupConfirmationEmail(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return;
  const name =
    (typeof user.user_metadata?.full_name === 'string' && user.user_metadata.full_name) || 'there';
  await serviceSendEmail(user.email, 'social-signup-confirmation', { name, origin: ORIGIN });
}

export async function sendBusinessApplicationSubmittedEmails(payload: {
  applicantEmail: string;
  applicantFirstName: string;
  company: string;
  adminPanelUrl: string;
}): Promise<void> {
  const { applicantEmail, applicantFirstName, company, adminPanelUrl } = payload;
  await Promise.all([
    serviceSendEmail(applicantEmail, 'business-application-member-confirm', {
      name: applicantFirstName,
      company,
      origin: ORIGIN,
    }),
    serviceSendEmail('hello@704collective.com', 'business-application-admin-notify', {
      company,
      applicantEmail,
      adminPanelUrl,
      origin: ORIGIN,
    }),
  ]);
}

/** After member completes RSVP gate on /welcome — complements Stripe welcome if already sent. */
export async function sendWelcomeOnboardingCompleteEmail(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return;

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const { data: prof } = await admin
    .from('profiles')
    .select('full_name, calendar_token')
    .eq('id', user.id)
    .maybeSingle();

  const name = prof?.full_name?.split(/\s+/)[0] || 'there';
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const token = prof?.calendar_token ?? '';
  const calendarUrl = token
    ? `webcal://${supabaseUrl.replace('https://', '')}/functions/v1/calendar-feed?token=${token}`
    : `${ORIGIN}/events`;

  await serviceSendEmail(user.email, 'welcome-onboarding-complete', {
    name,
    calendarUrl,
    dashboardUrl: `${ORIGIN}/dashboard`,
    origin: ORIGIN,
  });
}
