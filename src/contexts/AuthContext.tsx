'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { User, Session } from '@supabase/supabase-js';

interface Profile {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  role: 'super_admin' | 'admin' | 'lead';
  member_type: 'social' | 'business' | 'non_member' | 'partner' | 'vendor' | 'venue' | 'sponsor' | null;
  membership_wave: 'founding' | 'wave_2' | 'wave_3' | 'wave_4' | 'wave_5' | null;
  is_founding_member: boolean;
  is_partner: boolean;
  partner_type: 'vendor' | 'venue' | 'sponsor' | 'general' | null;
  application_status: 'pending' | 'accepted' | 'denied' | 'waitlist' | null;
  banned: boolean;
  banned_at: string | null;
  banned_reason: string | null;
  subscription_status: string | null;
  membership_override: boolean;
  stripe_customer_id: string | null;
  first_payment_at: string | null;
  member_since?: string | null;
  subscription_ends_at?: string | null;
  cancel_at_period_end?: boolean;
  calendar_token?: string;
  phone?: string | null;
  partner_status?: string | null;
}

interface AuthState {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isActiveMember: boolean;
  isBusinessMember: boolean;
  isBanned: boolean;
  isPendingApplication: boolean;
  isApprovedPartner: boolean;
}

interface AuthContextValue extends AuthState {
  signIn: (email: string, password: string) => Promise<{ data: unknown; error: unknown }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ data: unknown; error: unknown }>;
  signInWithGoogle: () => Promise<{ data: unknown; error: unknown }>;
  signOut: () => Promise<{ error: unknown }>;
  resetPassword: (email: string) => Promise<{ data: unknown; error: unknown }>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const LOGGED_OUT_STATE: AuthState = {
  user: null, profile: null, session: null, loading: false,
  isAdmin: false, isSuperAdmin: false, isActiveMember: false,
  isBusinessMember: false, isBanned: false, isPendingApplication: false,
  isApprovedPartner: false,
};

function deriveFlags(profile: any) {
  const role = profile?.role ?? 'lead';
  const isSuperAdmin = role === 'super_admin';
  const isAdmin = role === 'admin' || isSuperAdmin;
  const isActiveMember =
    profile?.subscription_status === 'active' ||
    profile?.subscription_status === 'trialing' ||
    profile?.membership_override === true;
  const isBusinessMember = profile?.member_type === 'business';
  const isBanned = profile?.banned === true;
  const isPendingApplication = profile?.application_status === 'pending';
  const isApprovedPartner =
    profile?.member_type === 'partner' &&
    (profile as any)?.partner_status === 'approved';
  return { isAdmin, isSuperAdmin, isActiveMember, isBusinessMember, isBanned, isPendingApplication, isApprovedPartner };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ ...LOGGED_OUT_STATE, loading: true });
  const supabaseRef = useRef(createClient());
  const isMounted = useRef(true);
  const activeUserId = useRef<string | null>(null);
  const lastEvent = useRef<string>('');

  const fetchAndApply = useCallback(async (user: User, session: Session) => {
    try {
      // Use a raw fetch instead of the Supabase JS client to avoid the
      // navigator.locks deadlock that occurs on soft refresh (Ctrl+R).
      // createBrowserClient serialises token refreshes via a named
      // navigator.locks lock. On soft refresh the old JS context can still
      // hold that lock while the new context is already running, causing any
      // Supabase client query to hang silently and indefinitely.
      // A direct PostgREST REST call with the access_token from the session
      // bypasses the lock entirely and is immune to this race condition.
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&deleted_at=is.null&select=*&limit=1`,
        {
          headers: {
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );
      const rows = res.ok ? await res.json() : [];
      const profile = Array.isArray(rows) ? (rows[0] ?? null) : null;
      if (!isMounted.current) return;
      setState({ user, session, loading: false, profile: profile as Profile | null, ...deriveFlags(profile) });
    } catch {
      if (!isMounted.current) return;
      setState({ user, session, loading: false, profile: null, ...deriveFlags(null) });
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;

    const { data: { subscription } } = supabaseRef.current.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted.current) return;

      if (session?.user) {
        const userId = session.user.id;

        lastEvent.current = event;
        activeUserId.current = userId;
        await fetchAndApply(session.user, session);
      } else {
        lastEvent.current = event;
        activeUserId.current = null;
        if (isMounted.current) setState(LOGGED_OUT_STATE);
      }
    });

    return () => {
      isMounted.current = false;
      subscription.unsubscribe();
    };
  }, [fetchAndApply]);

  const refreshProfile = useCallback(async () => {
    const { data: { session } } = await supabaseRef.current.auth.getSession();
    if (session?.user) await fetchAndApply(session.user, session);
  }, [fetchAndApply]);

  const signIn = (email: string, password: string) =>
    supabaseRef.current.auth.signInWithPassword({ email, password });

  const signUp = (email: string, password: string, fullName: string) =>
    supabaseRef.current.auth.signUp({ email, password, options: { data: { full_name: fullName } } });

  const signInWithGoogle = () =>
    supabaseRef.current.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { prompt: 'select_account' },
      },
    });

  const signOut = () => supabaseRef.current.auth.signOut();

  const resetPassword = (email: string) =>
    supabaseRef.current.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });

  return (
    <AuthContext.Provider value={{ ...state, signIn, signUp, signInWithGoogle, signOut, resetPassword, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext must be used inside AuthProvider');
  return ctx;
}

export async function getInitialSession() {
  const { createClient } = await import('@/lib/supabase/client');
  const { data: { session } } = await createClient().auth.getSession();
  return session;
}
