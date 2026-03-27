'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Header } from '@/components/Header';
import { Loader2 } from 'lucide-react';

export default function BusinessPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user || !profile) {
      router.replace('/login');
      return;
    }
    const p = profile as any;
    if (p.member_type !== 'business' && p.role !== 'super_admin' && p.role !== 'admin') {
      router.replace('/dashboard');
    }
  }, [user, profile, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0a0a0a' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#C6A664' }} />
      </div>
    );
  }

  const p = profile as any;
  const isBusiness = p?.member_type === 'business' || p?.role === 'super_admin' || p?.role === 'admin';
  if (!isBusiness) return null;

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0a0a0a' }}>
      <Header />
      <div className="w-full max-w-3xl mx-auto px-4 py-6 sm:px-6 md:max-w-5xl lg:px-8 lg:py-8">
        {children}
      </div>
    </div>
  );
}