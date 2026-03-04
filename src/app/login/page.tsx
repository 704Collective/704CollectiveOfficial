'use client';

import { Suspense } from 'react';
import Image from 'next/image';
import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/client';

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', backgroundColor: '#000000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '48px', height: '48px', border: '2px solid rgba(255,255,255,0.1)', borderTopColor: '#C6A664', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      </div>
    }>
      <Login />
    </Suspense>
  );
}

function Login() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const isDeactivated = searchParams.get('deactivated') === 'true';
  usePageTitle('Sign In');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  useEffect(() => {
    if (!loading && user) {
      const path = window.location.pathname;
      if (path !== '/setup-password' && path !== '/update-password') {
        router.push('/dashboard');
      }
    }
  }, [user, authLoading, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const result = loginSchema.safeParse({ email, password });
    if (!result.success) {
      const fieldErrors: { email?: string; password?: string } = {};
      result.error.issues.forEach((err) => {
        if (err.path[0] === 'email') fieldErrors.email = err.message;
        if (err.path[0] === 'password') fieldErrors.password = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      if (error.message.includes('Invalid login credentials')) {
        toast.error('Invalid email or password. Please try again.');
      } else if (error.message.includes('Email not confirmed')) {
        toast.error('Please check your email and confirm your account.');
      } else {
        toast.error(error.message);
      }
      setLoading(false);
      return;
    }

    toast.success('Welcome back!');
    router.push('/dashboard');
  };

  const handleGoogleLogin = async () => {
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      toast.error('Failed to sign in with Google');
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#000000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div style={{ width: '100%', maxWidth: '420px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '12px', textDecoration: 'none' }}>
            <Image src="/logo-nav.png" alt="704 Collective" width={48} height={48} style={{ height: '48px', width: 'auto' }} />
            <span style={{ color: '#FFFFFF', fontSize: '1.5rem', fontWeight: 600 }}>704 Collective</span>
          </Link>
          <p style={{ marginTop: '8px', color: 'rgba(255, 255, 255, 0.5)', fontSize: '0.9375rem' }}>
            Welcome back
          </p>
        </div>

        {/* Deactivated Alert */}
        {isDeactivated && (
          <div
            style={{
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '24px',
              color: '#ef4444',
              fontSize: '0.875rem',
              textAlign: 'center',
            }}
          >
            This account is no longer active. Please contact support at hello@704collective.com.
          </div>
        )}

        {/* Login Card */}
        <div
          style={{
            backgroundColor: '#1A1A1A',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            padding: '40px 32px',
          }}
        >
          <form onSubmit={handleLogin}>
            {/* Email */}
            <div style={{ marginBottom: '20px' }}>
              <label
                htmlFor="email"
                style={{
                  display: 'block',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  color: 'rgba(255, 255, 255, 0.7)',
                  marginBottom: '8px',
                }}
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  backgroundColor: '#2E2E2E',
                  border: errors.email ? '1px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  color: '#FFFFFF',
                  fontSize: '0.9375rem',
                  outline: 'none',
                  transition: 'border-color 200ms ease',
                  boxSizing: 'border-box',
                }}
                onFocus={(e) => {
                  if (!errors.email) e.currentTarget.style.borderColor = '#C6A664';
                }}
                onBlur={(e) => {
                  if (!errors.email) e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                }}
              />
              {errors.email && (
                <p style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '6px' }}>{errors.email}</p>
              )}
            </div>

            {/* Password */}
            <div style={{ marginBottom: '16px' }}>
              <label
                htmlFor="password"
                style={{
                  display: 'block',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  color: 'rgba(255, 255, 255, 0.7)',
                  marginBottom: '8px',
                }}
              >
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px 48px 12px 16px',
                    backgroundColor: '#2E2E2E',
                    border: errors.password ? '1px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    color: '#FFFFFF',
                    fontSize: '0.9375rem',
                    outline: 'none',
                    transition: 'border-color 200ms ease',
                    boxSizing: 'border-box',
                  }}
                  onFocus={(e) => {
                    if (!errors.password) e.currentTarget.style.borderColor = '#C6A664';
                  }}
                  onBlur={(e) => {
                    if (!errors.password) e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'rgba(255, 255, 255, 0.4)',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {errors.password && (
                <p style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '6px' }}>{errors.password}</p>
              )}
            </div>

            {/* Forgot Password */}
            <div style={{ textAlign: 'right', marginBottom: '24px' }}>
              <Link
                href="/reset-password"
                style={{
                  fontSize: '0.8125rem',
                  color: 'rgba(255, 255, 255, 0.4)',
                  textDecoration: 'none',
                  transition: 'color 200ms ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#C6A664'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255, 255, 255, 0.4)'; }}
              >
                Forgot your password?
              </Link>
            </div>

            {/* Sign In Button */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '14px',
                backgroundColor: '#FFFFFF',
                color: '#000000',
                fontWeight: 600,
                fontSize: '0.9375rem',
                border: 'none',
                borderRadius: '8px',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
                transition: 'all 200ms ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              {loading ? (
                <>
                  <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {/* Divider */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              margin: '24px 0',
            }}
          >
            <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(255, 255, 255, 0.08)' }} />
            <span style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Or continue with
            </span>
            <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(255, 255, 255, 0.08)' }} />
          </div>

          {/* Google Button */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            style={{
              width: '100%',
              padding: '14px',
              backgroundColor: 'transparent',
              color: '#FFFFFF',
              fontWeight: 500,
              fontSize: '0.9375rem',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'all 200ms ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.04)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Continue with Google
          </button>
        </div>

        {/* Sign Up Link */}
        <p style={{ textAlign: 'center', marginTop: '28px', fontSize: '0.875rem', color: 'rgba(255, 255, 255, 0.5)' }}>
          Don{"'"}t have an account?{' '}
          <Link
            href="/social"
            style={{ color: '#C6A664', textDecoration: 'none', fontWeight: 600 }}
            onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline'; }}
            onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none'; }}
          >
            Join 704 Collective
          </Link>
        </p>
      </div>
    </div>
  );
}