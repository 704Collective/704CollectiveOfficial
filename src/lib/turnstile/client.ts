import { HUMAN_CHECK_MESSAGE } from '@/lib/turnstile/constants';

export { HUMAN_CHECK_MESSAGE };

/**
 * Ask our server to verify the widget token. Log mode always returns ok.
 * Call this before supabase.auth methods so the token is not spent twice.
 */
export async function clientTurnstileCheck(
  form: string,
  token: string | undefined,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/turnstile/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ form, captchaToken: token ?? '' }),
    });
    const json = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
    if (res.status === 400) {
      return { ok: false, error: json?.error || json?.message || HUMAN_CHECK_MESSAGE };
    }
    if (res.status === 429) {
      return { ok: false, error: json?.error || json?.message || 'Too many requests' };
    }
    if (!res.ok) {
      // Our route or network failed — never lock a real person out on our outage.
      return { ok: true };
    }
    return { ok: true };
  } catch {
    return { ok: true };
  }
}
