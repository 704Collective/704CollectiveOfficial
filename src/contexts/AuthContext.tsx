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

  // Tracks whether the component is still mounted — set to false in cleanup
  // so async callbacks never call setState on an unmounted provider.
  const isMountedRef = useRef(true);

  // Deduplication guard: once a SIGNED_IN has been processed for a given user
  // ID, any further SIGNED_IN for the same ID within this provider mount is
  // dropped. This prevents the infinite re-render loop caused by Supabase
  // firing SIGNED_IN on every tab focus / token refresh.
  const lastProcessedUserIdRef = useRef<string | null>(null);

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data: profile, error: profileError } = await supabaseRef.current
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .is('deleted_at', null)
        .maybeSingle();

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
      const result = await fetchProfile(user.id);
      // Guard: don't call setState if the component has been unmounted
      // (async fetch may complete after navigation away)
      if (isMountedRef.current) {
        setState({
          user,
          session,
          loading: false,
          ...result,
        });
      }
    },
    [fetchProfile]
  );

  // Keep a stable ref to applyProfileState so the subscription effect below
  // can always call the latest version without needing it in its dependency
  // array — which would otherwise cause the subscription to be torn down and
  // re-created on every render, re-firing SIGNED_IN and looping infinitely.
  const applyProfileStateRef = useRef(applyProfileState);
  useEffect(() => {
    applyProfileStateRef.current = applyProfileState;
  }, [applyProfileState]);

  // Set up the Supabase auth subscription exactly ONCE (empty dep array).
  // All mutable values are accessed via refs so they're always current without
  // requiring the effect to re-run.
  useEffect(() => {
    isMountedRef.current = true;

    const {
      data: { subscription },
    } = supabaseRef.current.auth.onAuthStateChange(async (event, session) => {
      console.log('[Auth] onAuthStateChange fired:', event, 'session:', !!session);

      if (!isMountedRef.current) return;

      if (session?.user) {
        // Skip repeated SIGNED_IN events for the same user — Supabase fires
        // these on tab focus, token refresh, and navigation. The dashboard
        // self-heals via refreshProfile if the profile is missing (see
        // dashboard/page.tsx), so suppressing here is safe.
        if (event === 'SIGNED_IN' && lastProcessedUserIdRef.current === session.user.id) {
          console.log('[Auth] Skipping redundant SIGNED_IN — already processed for', session.user.id);
          return;
        }

        lastProcessedUserIdRef.current = session.user.id;

        await applyProfileStateRef.current(session.user, session);
      } else {
        if (isMountedRef.current) {
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
      isMountedRef.current = false;
      subscription.unsubscribe();
    };
  }, []); // Empty array — subscription is created exactly once per provider mount

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

// Utility for pages that need to check the session directly without depending
// on the auth event system — used as a self-healing fallback when SIGNED_IN
// deduplication suppresses the event and the profile has not been loaded yet.
export async function getInitialSession() {
  const { createClient } = await import('@/lib/supabase/client');
  const { data: { session } } = await createClient().auth.getSession();
  return session;
}
