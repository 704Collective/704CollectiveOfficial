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
  return { isAdmin, isSuperAdmin, isActiveMember, isBusinessMember, isBanned, isPendingApplication };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ ...LOGGED_OUT_STATE, loading: true });
  const supabase = useRef(createClient()).current;
  const isMounted = useRef(true);
  const activeUserId = useRef<string | null>(null);
  const lastEvent = useRef<string>('');

  const fetchAndApply = useCallback(async (user: User, session: Session) => {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .is('deleted_at', null)
        .maybeSingle();
      if (!isMounted.current) return;
      setState({ user, session, loading: false, profile: profile as Profile | null, ...deriveFlags(profile) });
    } catch {
      if (!isMounted.current) return;
      setState({ user, session, loading: false, profile: null, ...deriveFlags(null) });
    }
  }, [supabase]);

  useEffect(() => {
    isMounted.current = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[Auth]', event, !!session?.user);

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
  }, [fetchAndApply, supabase]);

  const refreshProfile = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) await fetchAndApply(session.user, session);
  }, [fetchAndApply, supabase]);

  const signIn = (email: string, password: string) =>
    supabase.auth.signInWithPassword({ email, password });

  const signUp = (email: string, password: string, fullName: string) =>
    supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } });

  const signInWithGoogle = () =>
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });

  const signOut = () => supabase.auth.signOut();

  const resetPassword = (email: string) =>
    supabase.auth.resetPasswordForEmail(email, {
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
