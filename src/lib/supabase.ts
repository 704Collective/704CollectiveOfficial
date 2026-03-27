/**
 * Browser Supabase client for legacy `/partners/*` screens.
 * Must use the same @supabase/ssr createBrowserClient as the rest of the app
 * so sessions live in cookies — not the default localStorage from @supabase/supabase-js.
 */
import { createBrowserClient } from '@supabase/ssr';

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
