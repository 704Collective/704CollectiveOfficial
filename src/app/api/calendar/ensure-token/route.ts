import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { randomUUID } from 'crypto';

/**
 * Ensures the authenticated user has a profiles.calendar_token (generates UUID if missing).
 */
export async function POST() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            /* Route Handler cookie edge cases */
          }
        },
      },
    }
  );

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: row, error: selErr } = await supabase
    .from('profiles')
    .select('calendar_token')
    .eq('id', user.id)
    .maybeSingle();

  if (selErr) {
    return NextResponse.json({ error: selErr.message }, { status: 500 });
  }

  const existing = (row as { calendar_token?: string | null } | null)?.calendar_token?.trim();
  if (existing) {
    return NextResponse.json({ token: existing, created: false });
  }

  const token = randomUUID();
  const { error: upErr } = await supabase
    .from('profiles')
    .update({ calendar_token: token })
    .eq('id', user.id);

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({ token, created: true });
}
