'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { User, Session } from '@supabase/supabase-js';

interface Profile {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  member_type: string;
  subscription_status: string;
  membership_override: boolean;
  stripe_customer_id: string | null;
  member_since?: string;
  calendar_token?: string;
  subscription_end?: string;
  subscription_ends_at?: string | null;
  cancel_at_period_end?: boolean;
}

interface AuthState {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  isActiveMember: boolean;
}

interface AuthContextValue extends AuthState {
  signIn: (email: string, password: string) => Promise<{ data: unknown; error: unknown }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ data: unknown; error: unknown }>;
  signInWithGoogle: () => Promise<{ data: unknown; error: unknown }>;
  signOut: () => Promise<{ error: unknown }>;
  resetPassword: (email: string) => Promise<{ data: unknown; error: unknown }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    profile: null,
    session: null,
    loading: true,
    isAdmin: false,
    isActiveMember: false,
  });

  const supabaseRef = useRef(createClient());

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> =>
        Promise.race([
          promise,
          new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error(`Supabase query timed out after ${ms}ms`)), ms)
          ),
        ]);

      const [profileRes, rolesRes] = await withTimeout(
        Promise.all([
          supabaseRef.current
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .is('deleted_at', null)
            .maybeSingle(),
          supabaseRef.current
            .from('user_roles')
            .select('role')
            .eq('user_id', userId),
        ]),
        5000
      );

      const { data: profile, error: profileError } = profileRes;
      const { data: roles, error: rolesError } = rolesRes;

      if (profileError) {
        console.error('[AuthContext] Profile fetch error:', profileError.message);
        return { profile: null, isAdmin: false, isActiveMember: false };
      }

      if (rolesError) {
        console.error('[AuthContext] Roles fetch error:', rolesError.message);
      }

      const isAdmin = roles?.some((r) => r.role === 'admin') ?? false;
      const isActiveMember =
        profile?.subscription_status === 'active' ||
        profile?.membership_override === true;

      console.log('[Auth] fetchProfile result:', { profile: !!profile, isAdmin, isActiveMember });
      return { profile, isAdmin, isActiveMember };
    } catch (err) {
      console.error('[AuthContext] fetchProfile failed or timed out:', err);
      return { profile: null, isAdmin: false, isActiveMember: false };
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const {
      data: { subscription },
    } = supabaseRef.current.auth.onAuthStateChange(async (event, session) => {
      console.log('[Auth] onAuthStateChange fired:', event, 'session:', !!session, 'mounted:', mounted);
      if (!mounted) return;

      if (session?.user) {
        console.log('[Auth] fetching profile for:', session.user.id);
        const { profile, isAdmin, isActiveMember } = await fetchProfile(session.user.id);
        if (mounted) {
          setState({
            user: session.user,
            profile,
            session,
            loading: false,
            isAdmin,
            isActiveMember,
          });
        }
      } else {
        if (mounted) {
          setState({
            user: null,
            profile: null,
            session: null,
            loading: false,
            isAdmin: false,
            isActiveMember: false,
          });
        }
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const signIn = async (email: string, password: string) => {
    return await supabaseRef.current.auth.signInWithPassword({ email, password });
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    return await supabaseRef.current.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
  };

  const signInWithGoogle = async () => {
    return await supabaseRef.current.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  };

  const signOut = async () => {
    return await supabaseRef.current.auth.signOut();
  };

  const resetPassword = async (email: string) => {
    return await supabaseRef.current.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
  };

  return (
    <AuthContext.Provider
      value={{ ...state, signIn, signUp, signInWithGoogle, signOut, resetPassword }}
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