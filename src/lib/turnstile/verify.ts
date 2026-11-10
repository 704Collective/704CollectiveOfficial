import { createHash } from 'node:crypto';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { getRequestIp } from '@/lib/getRequestIp';
import { HUMAN_CHECK_MESSAGE } from '@/lib/turnstile/constants';

export { HUMAN_CHECK_MESSAGE };
export const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export type TurnstileReason = 'ok' | 'skipped' | 'failed' | 'missing_token';

export type TurnstileVerifyResult = {
  ok: boolean;
  errorCodes: string[];
  reason: TurnstileReason;
};

export type TurnstileMode = 'log' | 'block';

export function turnstileMode(): TurnstileMode {
  const raw = (process.env.TURNSTILE_MODE ?? 'log').trim().toLowerCase();
  return raw === 'block' ? 'block' : 'log';
}

export function hashTurnstileIp(ip: string): string {
  return createHash('sha256').update(`turnstile-ip:${ip}`).digest('hex');
}

export function normalizeTurnstileForm(form: string | undefined | null): string {
  const cleaned = (form ?? 'unknown').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 64);
  return cleaned || 'unknown';
}

function secretKey(): string {
  return (process.env.TURNSTILE_SECRET_KEY ?? '').trim();
}

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

export async function verifyTurnstile(
  token: string | null | undefined,
  remoteip?: string,
): Promise<TurnstileVerifyResult> {
  const secret = secretKey();
  if (!secret) {
    return { ok: true, errorCodes: [], reason: 'skipped' };
  }

  const trimmed = (token ?? '').trim();
  if (!trimmed) {
    return { ok: false, errorCodes: ['missing-input-response'], reason: 'missing_token' };
  }

  let res: Response;
  try {
    const body = new URLSearchParams();
    body.set('secret', secret);
    body.set('response', trimmed);
    if (remoteip && remoteip !== 'anonymous') {
      body.set('remoteip', remoteip);
    }
    res = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return { ok: true, errorCodes: ['internal-unreachable'], reason: 'skipped' };
  }

  if (res.status >= 500) {
    return { ok: true, errorCodes: [`http-${res.status}`], reason: 'skipped' };
  }
  if (!res.ok) {
    return { ok: false, errorCodes: [`http-${res.status}`], reason: 'failed' };
  }

  let json: { success?: boolean; 'error-codes'?: unknown };
  try {
    json = (await res.json()) as { success?: boolean; 'error-codes'?: unknown };
  } catch {
    return { ok: true, errorCodes: ['invalid-json'], reason: 'skipped' };
  }

  const errorCodes = Array.isArray(json['error-codes'])
    ? json['error-codes'].filter((code): code is string => typeof code === 'string')
    : [];

  if (json.success === true) {
    return { ok: true, errorCodes, reason: 'ok' };
  }
  return { ok: false, errorCodes, reason: 'failed' };
}

export async function recordTurnstileCheck(input: {
  form: string;
  result: TurnstileVerifyResult;
  ip: string;
}): Promise<void> {
  try {
    const admin = serviceClient();
    const { error } = await admin.from('turnstile_checks').insert({
      form: normalizeTurnstileForm(input.form),
      ok: input.result.ok,
      error_codes: input.result.errorCodes,
      reason: input.result.reason,
      ip_hash: hashTurnstileIp(input.ip),
    });
    if (error) {
      console.error('[turnstile] failed to record check:', error.message);
    }
  } catch (err) {
    console.error('[turnstile] failed to record check:', err instanceof Error ? err.message : err);
  }
}

export async function enforceTurnstile(input: {
  form: string;
  token: string | null | undefined;
  ip: string;
}): Promise<{ allow: true; result: TurnstileVerifyResult } | { allow: false; result: TurnstileVerifyResult; message: string }> {
  const result = await verifyTurnstile(input.token, input.ip);
  await recordTurnstileCheck({ form: input.form, result, ip: input.ip });
  if (turnstileMode() === 'block' && !result.ok) {
    return { allow: false, result, message: HUMAN_CHECK_MESSAGE };
  }
  return { allow: true, result };
}

export function turnstileDeniedResponse(message = HUMAN_CHECK_MESSAGE): NextResponse {
  return NextResponse.json({ error: message, message }, { status: 400 });
}

export async function gateTurnstile(
  request: NextRequest,
  form: string,
  token: string | null | undefined,
): Promise<NextResponse | null> {
  const ip = getRequestIp(request);
  const decision = await enforceTurnstile({ form, token, ip });
  if (!decision.allow) return turnstileDeniedResponse(decision.message);
  return null;
}

export function readCaptchaToken(body: unknown): string {
  if (!body || typeof body !== 'object') return '';
  const record = body as Record<string, unknown>;
  const raw = record.captchaToken ?? record.turnstileToken ?? record.token ?? record['cf-turnstile-response'];
  return typeof raw === 'string' ? raw : '';
}
