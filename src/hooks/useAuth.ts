'use client';

import { useEffect, useState, useCallback } from 'react';
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
}

interface AuthState {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  isActiveMember: boolean;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    profile: null,
    session: null,
    loading: true,
    isAdmin: false,
    isActiveMember: false,
  });

  const supabase = createClient();

  const fetchProfile = useCallback(
    async (userId: string) => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .is('deleted_at', null)
        .single();

      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);

      const isAdmin = roles?.some((r) => r.role === 'admin') ?? false;
      const isActiveMember =
        profile?.subscription_status === 'active' ||
        profile?.membership_override === true;

      return { profile, isAdmin, isActiveMember };
    },
    [supabase]
  );

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const { profile, isAdmin, isActiveMember } = await fetchProfile(
          session.user.id
        );
        setState({
          user: session.user,
          profile,
          session,
          loading: false,
          isAdmin,
          isActiveMember,
        });
      } else {
        setState((prev) => ({ ...prev, loading: false }));
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        const { profile, isAdmin, isActiveMember } = await fetchProfile(
          session.user.id
        );
        setState({
          user: session.user,
          profile,
          session,
          loading: false,
          isAdmin,
          isActiveMember,
        });
      } else {
        setState({
          user: null,
          profile: null,
          session: null,
          loading: false,
          isAdmin: false,
          isActiveMember: false,
        });
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase, fetchProfile]);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { data, error };
  };

  const signUp = async (
    email: string,
    password: string,
    fullName: string
  ) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    });
    return { data, error };
  };

  const signInWithGoogle = async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    return { data, error };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    return { error };
  };

  const resetPassword = async (email: string) => {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    return { data, error };
  };

  return {
    ...state,
    signIn,
    signUp,
    signInWithGoogle,
    signOut,
    resetPassword,
  };
}