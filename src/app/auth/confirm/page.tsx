'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { postAuthDestination } from '@/lib/postAuthRedirect';

export default function AuthConfirmPage() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();

    const handleTokens = async () => {
      // %% Check query params first (token_hash flow from Supabase PKCE) %%%%%%%
      const searchParams = new URLSearchParams(window.location.search);
      const tokenHash = searchParams.get('token_hash');
      const qType = searchParams.get('type');

      if (tokenHash && qType) {
        if (qType === 'recovery') {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: 'recovery',
          });
          if (error) {
            router.replace('/login?error=invalid_link');
            return;
          }
          router.replace('/reset-password');
          return;
        }

        if (qType === 'signup') {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: 'signup',
          });
          if (error) {
            router.replace('/login?error=invalid_link');
            return;
          }
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) {
            router.replace('/login?error=invalid_link');
            return;
          }
          // New signups go to /welcome for the onboarding experience.
          // If the profile already exists and has an active membership, route
          // them to their normal destination instead.
          const { data: profile } = await supabase
            .from('profiles')
            .select('role, member_type, subscription_status, membership_override')
            .eq('id', user.id)
            .maybeSingle();
          const destination = profile ? postAuthDestination(profile) : '/welcome';
          router.replace(destination);
          return;
        }

        // Magic link or other email OTP
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: qType as 'magiclink' | 'invite' | 'email_change' | 'email',
        });
        if (error) {
          router.replace('/login?error=invalid_link');
          return;
        }
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.replace('/login?error=invalid_link');
          return;
        }
        const { data: profile } = await supabase
          .from('profiles')
          .select('role, member_type, subscription_status, membership_override')
          .eq('id', user.id)
          .maybeSingle();
        router.replace(profile ? postAuthDestination(profile) : '/signup');
        return;
      }

      // %% Hash fragment tokens (Supabase implicit flow) %%%%%%%%%%%%%%%%%%%%%%%
      const hash = window.location.hash;
      if (!hash) {
        router.replace('/login?error=invalid_link');
        return;
      }

      const params = new URLSearchParams(hash.substring(1));
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      const hType = params.get('type');

      if (!accessToken || !refreshToken) {
        router.replace('/login?error=invalid_link');
        return;
      }

      if (hType === 'recovery') {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) {
          router.replace('/login?error=invalid_link');
          return;
        }
        router.replace('/reset-password');
        return;
      }

      if (hType === 'signup') {
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error || !data.session) {
          router.replace('/login?error=invalid_link');
          return;
        }
        const { data: profile } = await supabase
          .from('profiles')
          .select('role, member_type, subscription_status, membership_override')
          .eq('id', data.session.user.id)
          .maybeSingle();
        // New signups land on /welcome; existing profiles follow normal routing.
        const destination = profile ? postAuthDestination(profile) : '/welcome';
        router.replace(destination);
        return;
      }

      // Magic link / sign-in
      const { data, error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (error || !data.session) {
        router.replace('/login?error=invalid_link');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role, member_type, subscription_status, membership_override')
        .eq('id', data.session.user.id)
        .maybeSingle();

      router.replace(profile ? postAuthDestination(profile) : '/signup');
    };

    handleTokens();
  }, [router]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm text-muted-foreground">Signing you in...</p>
      </div>
    </div>
  );
}
