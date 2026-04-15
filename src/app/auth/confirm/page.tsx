'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { postAuthDestination } from '@/lib/postAuthRedirect';

export default function AuthConfirmPage() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();

    const handleHashTokens = async () => {
      const hash = window.location.hash;
      if (!hash) {
        router.replace('/login?error=invalid_link');
        return;
      }

      const params = new URLSearchParams(hash.substring(1));
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');

      if (!accessToken || !refreshToken) {
        router.replace('/login?error=invalid_link');
        return;
      }

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

      if (!profile) {
        router.replace('/signup');
        return;
      }

      router.replace(postAuthDestination(profile));
    };

    handleHashTokens();
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
