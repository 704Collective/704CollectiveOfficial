'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { User, Session } from '@supabase/supabase-js';

interface Profile {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  // Role & member type
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
  // Subscription
  subscription_status: string | null;
  membership_override: boolean;
  stripe_customer_id: string | null;
  first_payment_at: string | null;
  member_since?: string | null;
  subscription_ends_at?: string | null;
  cancel_at_period_end?: boolean;
  // Misc
  calendar_token?: string;
  phone?: string | null;
}

interface AuthState {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  // Convenience flags
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    profile: null,
    session: null,
    loading: true,
    isAdmin: false,
    isSuperAdmin: false,
    isActiveMember: false,
    isBusinessMember: false,
    isBanned: false,
    isPendingApplication: false,
  });

  const supabaseRef = useRef(createClient());
  const profileLoadedForRef = useRef<string | null>(null);

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> =>
        Promise.race([
          promise,
          new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error(`Supabase query timed out after ${ms}ms`)), ms)
          ),
        ]);

      const { data: profile, error: profileError } = await withTimeout(
        supabaseRef.current
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .is('deleted_at', null)
          .maybeSingle()
          .then((res) => res),
        5000
      );

      if (profileError) {
        console.error('[AuthContext] Profile fetch error:', profileError.message);
        return {
          profile: null,
          isAdmin: false,
          isSuperAdmin: false,
          isActiveMember: false,
          isBusinessMember: false,
          isBanned: false,
          isPendingApplication: false,
        };
      }

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

      console.log('[Auth] fetchProfile result:', {
        profile: !!profile,
        role,
        isAdmin,
        isSuperAdmin,
        isActiveMember,
        isBusinessMember,
        isBanned,
      });

      return {
        profile: profile as Profile | null,
        isAdmin,
        isSuperAdmin,
        isActiveMember,
        isBusinessMember,
        isBanned,
        isPendingApplication,
      };
    } catch (err) {
      console.error('[AuthContext] fetchProfile failed or timed out:', err);
      return {
        profile: null,
        isAdmin: false,
        isSuperAdmin: false,
        isActiveMember: false,
        isBusinessMember: false,
        isBanned: false,
        isPendingApplication: false,
      };
    }
  }, []);

  const applyProfileState = useCallback(
    async (user: User, session: Session) => {
      profileLoadedForRef.current = user.id;
      const result = await fetchProfile(user.id);
      setState({
        user,
        session,
        loading: false,
        ...result,
      });
    },
    [fetchProfile]
  );

  useEffect(() => {
    let mounted = true;

    const {
      data: { subscription },
    } = supabaseRef.current.auth.onAuthStateChange(async (event, session) => {
      console.log('[Auth] onAuthStateChange fired:', event, 'session:', !!session, 'mounted:', mounted);
      if (!mounted) return;

      if (session?.user) {
        // SIGNED_IN is ignored — fires before INITIAL_SESSION and causes timeouts.
        // INITIAL_SESSION and TOKEN_REFRESHED handle all cases correctly.
        if (event === 'SIGNED_IN') {
          console.log('[Auth] Ignoring SIGNED_IN event, waiting for INITIAL_SESSION');
          return;
        }
        await applyProfileState(session.user, session);
        if (!mounted) return;
      } else {
        if (mounted) {
          setState({
            user: null,
            profile: null,
            session: null,
            loading: false,
            isAdmin: false,
            isSuperAdmin: false,
            isActiveMember: false,
            isBusinessMember: false,
            isBanned: false,
            isPendingApplication: false,
          });
        }
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [applyProfileState]);

  // Expose a manual refresh — useful after profile updates (e.g. password set, plan upgrade)
  const refreshProfile = useCallback(async () => {
    const { data: { session } } = await supabaseRef.current.auth.getSession();
    if (session?.user) {
      await applyProfileState(session.user, session);
    }
  }, [applyProfileState]);

  const signIn = async (email: string, password: string) =>
    supabaseRef.current.auth.signInWithPassword({ email, password });

  const signUp = async (email: string, password: string, fullName: string) =>
    supabaseRef.current.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });

  const signInWithGoogle = async () =>
    supabaseRef.current.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });

  const signOut = async () => supabaseRef.current.auth.signOut();

  const resetPassword = async (email: string) =>
    supabaseRef.current.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });

  return (
    <AuthContext.Provider
      value={{ ...state, signIn, signUp, signInWithGoogle, signOut, resetPassword, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext must be used inside AuthProvider');
  return ctx;
}