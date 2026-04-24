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
import { Eye, EyeOff, Loader2, Mail, ArrowLeft } from 'lucide-react';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/client';
import Nav from '@/components/Nav';
import { MarketingPageRoot } from '@/components/MarketingPageRoot';
import { postAuthDestination } from '@/lib/postAuthRedirect';

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const emailSchema = z.string().email('Please enter a valid email address');

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100dvh', backgroundColor: '#000000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
  const { user, profile, loading: authLoading } = useAuth();
  const isDeactivated = searchParams.get('deactivated') === 'true';
  const isBanned = searchParams.get('error') === 'banned';
  usePageTitle('Login');

  useEffect(() => {
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');
    if (error) {
      if (error === 'no_account') {
        toast.error("You don't have an account. Please register first.");
      } else if (
        errorDescription?.includes('unable to fetch records') ||
        errorDescription?.includes('confirmation_token') ||
        errorDescription?.includes('email_change')
      ) {
        toast.error("You don't have an account. Please register first.");
      } else {
        toast.error(errorDescription || 'Sign in failed. Please try again.');
      }
    }
  }, []);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  // Magic link state (inline — primary sign-in option)
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [magicLinkLoading, setMagicLinkLoading] = useState(false);
  const [magicLinkEmail, setMagicLinkEmail] = useState('');
  const [magicLinkError, setMagicLinkError] = useState('');
  const [magicLinkCooldown, setMagicLinkCooldown] = useState(0);

  // Legacy magic-link mode (kept for existing flows triggered from elsewhere)
  const [magicLinkMode, setMagicLinkMode] = useState(false);

  // Tab switcher
  const [activeTab, setActiveTab] = useState<'magic' | 'password'>('magic');

  // Smart error hint
  const [showGoogleHint, setShowGoogleHint] = useState(false);

  // Cooldown countdown for magic link
  useEffect(() => {
    if (magicLinkCooldown <= 0) return;
    const timer = setTimeout(() => setMagicLinkCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [magicLinkCooldown]);

  // If a live OAuth session exists but has no profile (ghost session that
  // wasn't cleared by the callback), sign out so the login form works normally.
  useEffect(() => {
    const clearGhostSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', session.user.id)
        .maybeSingle();
      if (!existingProfile) {
        await supabase.auth.signOut();
      }
    };
    clearGhostSession();
  }, []);

  useEffect(() => {
    if (!authLoading && user && profile) {
      const path = window.location.pathname;
      if (path !== '/setup-password') {
        router.replace(postAuthDestination(profile));
      }
    }
  }, [user, profile, authLoading, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setShowGoogleHint(false);

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
        // Check if email exists in profiles — if so, they likely signed up with Google
        const { data } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', email.trim().toLowerCase())
          .maybeSingle();

        if (data) {
          setShowGoogleHint(true);
        } else {
          toast.error('Invalid email or password. Please try again.');
        }
      } else if (error.message.includes('Email not confirmed')) {
        toast.error('Please check your email and confirm your account.');
      } else {
        toast.error(error.message);
      }
      setLoading(false);
      return;
    }

    const { data: authUser } = await supabase.auth.getUser();
    const uid = authUser.user?.id;
    if (!uid) {
      setLoading(false);
      toast.error('Could not resolve session');
      return;
    }
    const { data: prof } = await supabase
      .from('profiles')
      .select('role, member_type, subscription_status, membership_override')
      .eq('id', uid)
      .maybeSingle();

    toast.success('Welcome back!');
    router.push(postAuthDestination(prof));
    setLoading(false);
  };

  const handleGoogleLogin = async () => {
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?source=login` },
    });
    if (error) toast.error('Failed to sign in with Google');
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setMagicLinkError('');

    const emailToUse = (magicLinkMode ? magicLinkEmail : magicLinkEmail || email).trim();
    const result = emailSchema.safeParse(emailToUse);
    if (!result.success) {
      setMagicLinkError('Please enter a valid email address');
      return;
    }

    setMagicLinkLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: emailToUse,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          shouldCreateUser: false,
        },
      });
      if (error) {
        setMagicLinkError('Something went wrong. Please try again.');
        setMagicLinkLoading(false);
        return;
      }
    } catch {
      setMagicLinkError('Something went wrong. Please try again.');
      setMagicLinkLoading(false);
      return;
    }
    setMagicLinkLoading(false);
    setMagicLinkSent(true);
    setMagicLinkCooldown(60);
  };

  const handleInlineMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setMagicLinkError('');

    const result = emailSchema.safeParse(magicLinkEmail);
    if (!result.success) {
      setMagicLinkError('Please enter a valid email address');
      return;
    }

    setMagicLinkLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: magicLinkEmail.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          shouldCreateUser: false,
        },
      });
      if (error) {
        setMagicLinkError('Something went wrong. Please try again.');
        setMagicLinkLoading(false);
        return;
      }
    } catch {
      setMagicLinkError('Something went wrong. Please try again.');
      setMagicLinkLoading(false);
      return;
    }
    setMagicLinkLoading(false);
    setMagicLinkSent(true);
    setMagicLinkCooldown(60);
  };

  const inputStyle = {
    width: '100%',
    padding: '13px 16px',
    backgroundColor: '#2E2E2E',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '8px',
    color: '#FFFFFF',
    fontSize: '16px',
    outline: 'none',
    transition: 'border-color 200ms ease',
    boxSizing: 'border-box' as const,
    minHeight: '48px',
  };

  return (
    <>
    <Nav />
    <MarketingPageRoot>
    <div style={{ minHeight: '100dvh', backgroundColor: '#000000', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', paddingTop: '80px' }}>
      <div style={{ width: '100%', maxWidth: '420px' }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
            <Image src="/logo-nav.png" alt="704 Collective" width={40} height={40} />
            <span style={{ color: '#FFFFFF', fontSize: 'clamp(1.25rem, 5vw, 1.5rem)', fontWeight: 600 }}>
              704 Collective
            </span>
          </Link>
          <p style={{ marginTop: '8px', color: 'rgba(255, 255, 255, 0.5)', fontSize: '0.9375rem' }}>
            Welcome back
          </p>
        </div>

        {/* Banned Alert */}
        {isBanned && (
          <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '12px', padding: '16px', marginBottom: '20px', color: '#ef4444', fontSize: '0.875rem', textAlign: 'center' }}>
            Your account has been banned. Please contact <a href="mailto:hello@704collective.com" style={{ color: '#ef4444', fontWeight: 600, textDecoration: 'underline' }}>hello@704collective.com</a> if you believe this is a mistake.
          </div>
        )}

        {/* Deactivated Alert */}
        {isDeactivated && (
          <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '12px', padding: '16px', marginBottom: '20px', color: '#ef4444', fontSize: '0.875rem', textAlign: 'center' }}>
            This account is no longer active. Please contact support at hello@704collective.com.
          </div>
        )}

        {/* Card */}
        <div style={{ backgroundColor: '#1A1A1A', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '16px', padding: 'clamp(24px, 6vw, 40px) clamp(20px, 5vw, 32px)' }}>

          {/* ── MAGIC LINK MODE (legacy — accessible from Google hint) ── */}
          {magicLinkMode ? (
            <div>
              <button
                type="button"
                onClick={() => { setMagicLinkMode(false); setMagicLinkSent(false); setMagicLinkError(''); setMagicLinkCooldown(0); }}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', fontSize: '0.8125rem', marginBottom: '20px', padding: '0' }}
              >
                <ArrowLeft size={14} /> Back to sign in
              </button>

              {magicLinkSent ? (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ width: '56px', height: '56px', borderRadius: '50%', backgroundColor: 'rgba(198,166,100,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                    <Mail size={24} color="#C6A664" />
                  </div>
                  <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#FFFFFF', marginBottom: '8px' }}>Check your email</h2>
                  <p style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>
                    Check your email for a sign-in link. It expires in 1 hour.
                  </p>
                  {magicLinkCooldown > 0 ? (
                    <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.3)', marginTop: '12px' }}>
                      Resend available in {magicLinkCooldown}s
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { setMagicLinkSent(false); setMagicLinkError(''); }}
                      style={{ fontSize: '0.8125rem', color: '#C6A664', background: 'none', border: 'none', cursor: 'pointer', padding: '0', marginTop: '12px', textDecoration: 'underline' }}
                    >
                      Send again
                    </button>
                  )}
                </div>
              ) : (
                <form onSubmit={handleMagicLink}>
                  <p style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.5)', marginBottom: '20px', lineHeight: 1.6 }}>
                    Enter your email and we{"'"}ll send you a one-click sign-in link.
                  </p>
                  <div style={{ marginBottom: '16px' }}>
                    <label htmlFor="magic-email" style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginBottom: '8px' }}>
                      Email
                    </label>
                    <input
                      id="magic-email"
                      type="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      value={magicLinkEmail}
                      onChange={(e) => setMagicLinkEmail(e.target.value)}
                      style={{ ...inputStyle, border: magicLinkError ? '1px solid #ef4444' : '1px solid rgba(255,255,255,0.1)' }}
                      onFocus={(e) => { if (!magicLinkError) e.currentTarget.style.borderColor = '#C6A664'; }}
                      onBlur={(e) => { if (!magicLinkError) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
                    />
                    {magicLinkError && <p style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '6px' }}>{magicLinkError}</p>}
                  </div>
                  <button
                    type="submit"
                    disabled={magicLinkLoading || magicLinkCooldown > 0}
                    style={{ width: '100%', padding: '14px', minHeight: '48px', backgroundColor: '#FFFFFF', color: '#000000', fontWeight: 600, fontSize: '0.9375rem', border: 'none', borderRadius: '8px', cursor: (magicLinkLoading || magicLinkCooldown > 0) ? 'not-allowed' : 'pointer', opacity: (magicLinkLoading || magicLinkCooldown > 0) ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                  >
                    {magicLinkLoading ? <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />Sending...</> : magicLinkCooldown > 0 ? `Resend in ${magicLinkCooldown}s` : 'Send Sign-In Link'}
                  </button>
                </form>
              )}
            </div>
          ) : (
            /* ── MAIN SIGN-IN VIEW ── */
            <>
              {/* ── TAB SWITCHER ── */}
              <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: '24px' }}>
                <button
                  type="button"
                  onClick={() => { setActiveTab('magic'); setMagicLinkError(''); setErrors({}); }}
                  style={{
                    flex: 1,
                    padding: '12px 16px',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: activeTab === 'magic' ? '2px solid #C6A664' : '2px solid transparent',
                    color: activeTab === 'magic' ? '#C6A664' : 'rgba(255,255,255,0.5)',
                    fontSize: '0.9375rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    marginBottom: '-1px',
                    transition: 'all 200ms ease',
                  }}
                >
                  Magic link
                </button>
                <button
                  type="button"
                  onClick={() => { setActiveTab('password'); setMagicLinkError(''); setErrors({}); }}
                  style={{
                    flex: 1,
                    padding: '12px 16px',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: activeTab === 'password' ? '2px solid #C6A664' : '2px solid transparent',
                    color: activeTab === 'password' ? '#C6A664' : 'rgba(255,255,255,0.5)',
                    fontSize: '0.9375rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    marginBottom: '-1px',
                    transition: 'all 200ms ease',
                  }}
                >
                  Password
                </button>
              </div>

              {/* ── MAGIC LINK TAB ── */}
              {activeTab === 'magic' && (
                <form onSubmit={handleInlineMagicLink}>
                  <div style={{ marginBottom: '12px' }}>
                    <label htmlFor="magic-inline-email" style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginBottom: '8px' }}>
                      Email
                    </label>
                    <input
                      id="magic-inline-email"
                      type="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      value={magicLinkEmail}
                      onChange={(e) => { setMagicLinkEmail(e.target.value); setMagicLinkError(''); setMagicLinkSent(false); }}
                      style={{ ...inputStyle, border: magicLinkError ? '1px solid #ef4444' : '1px solid rgba(255,255,255,0.1)' }}
                      onFocus={(e) => { if (!magicLinkError) e.currentTarget.style.borderColor = '#C6A664'; }}
                      onBlur={(e) => { if (!magicLinkError) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
                    />
                    {magicLinkError && <p style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '6px' }}>{magicLinkError}</p>}
                  </div>

                  {magicLinkSent && (
                    <div style={{ backgroundColor: 'rgba(198,166,100,0.08)', border: '1px solid rgba(198,166,100,0.2)', borderRadius: '10px', padding: '12px 16px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Mail size={16} color="#C6A664" style={{ flexShrink: 0 }} />
                      <p style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.8)', lineHeight: 1.5, margin: 0 }}>
                        Check your email for a sign-in link. It expires in 1 hour.
                      </p>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={magicLinkLoading || magicLinkCooldown > 0}
                    style={{ width: '100%', padding: '14px', minHeight: '48px', backgroundColor: '#FFFFFF', color: '#000000', fontWeight: 600, fontSize: '0.9375rem', border: 'none', borderRadius: '8px', cursor: (magicLinkLoading || magicLinkCooldown > 0) ? 'not-allowed' : 'pointer', opacity: (magicLinkLoading || magicLinkCooldown > 0) ? 0.7 : 1, transition: 'all 200ms ease', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                  >
                    {magicLinkLoading
                      ? <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />Sending...</>
                      : magicLinkCooldown > 0
                      ? `Resend in ${magicLinkCooldown}s`
                      : <><Mail size={16} />Send sign-in link</>
                    }
                  </button>
                </form>
              )}

              {/* ── PASSWORD TAB ── */}
              {activeTab === 'password' && (
                <form onSubmit={handleLogin}>
                  {/* Email for password form */}
                  <div style={{ marginBottom: '16px' }}>
                    <label htmlFor="email" style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'rgba(255, 255, 255, 0.7)', marginBottom: '8px' }}>
                      Email
                    </label>
                    <input
                      id="email"
                      type="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setShowGoogleHint(false); }}
                      style={{ ...inputStyle, border: errors.email ? '1px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.1)' }}
                      onFocus={(e) => { if (!errors.email) e.currentTarget.style.borderColor = '#C6A664'; }}
                      onBlur={(e) => { if (!errors.email) e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'; }}
                    />
                    {errors.email && <p style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '6px' }}>{errors.email}</p>}
                  </div>

                  {/* Password */}
                  <div style={{ marginBottom: '16px' }}>
                    <label htmlFor="password" style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'rgba(255, 255, 255, 0.7)', marginBottom: '8px' }}>
                      Password
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        style={{ ...inputStyle, padding: '13px 52px 13px 16px', border: errors.password ? '1px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.1)' }}
                        onFocus={(e) => { if (!errors.password) e.currentTarget.style.borderColor = '#C6A664'; }}
                        onBlur={(e) => { if (!errors.password) e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'; }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        style={{ position: 'absolute', right: '0', top: '0', bottom: '0', width: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255, 255, 255, 0.4)' }}
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    {errors.password && <p style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '6px' }}>{errors.password}</p>}
                  </div>

                  {/* Google hint — shown when email exists but password fails */}
                  {showGoogleHint && (
                    <div style={{ backgroundColor: 'rgba(198,166,100,0.08)', border: '1px solid rgba(198,166,100,0.25)', borderRadius: '10px', padding: '14px 16px', marginBottom: '16px' }}>
                      <p style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.8)', lineHeight: 1.55, marginBottom: '10px' }}>
                        It looks like you signed up with Google. Try signing in with Google below, or use a magic link instead.
                      </p>
                      <button
                        type="button"
                        onClick={() => { setMagicLinkMode(true); setMagicLinkEmail(email); }}
                        style={{ fontSize: '0.8125rem', color: '#C6A664', background: 'none', border: 'none', cursor: 'pointer', padding: '0', textDecoration: 'underline' }}
                      >
                        Send me a magic link →
                      </button>
                    </div>
                  )}

                  {/* Forgot Password */}
                  <div style={{ textAlign: 'right', marginBottom: '20px' }}>
                    <Link
                      href="/reset-password"
                      style={{ fontSize: '0.8125rem', color: 'rgba(255, 255, 255, 0.4)', textDecoration: 'none', transition: 'color 200ms ease', display: 'inline-block', padding: '4px 0' }}
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
                    style={{ width: '100%', padding: '14px', minHeight: '48px', backgroundColor: 'transparent', color: '#FFFFFF', fontWeight: 600, fontSize: '0.9375rem', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, transition: 'all 200ms ease', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                  >
                    {loading ? <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />Signing in...</> : 'Sign in with password'}
                  </button>
                </form>
              )}

              {/* Divider */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', margin: '24px 0' }}>
                <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(255, 255, 255, 0.08)' }} />
                <span style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Or continue with</span>
                <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(255, 255, 255, 0.08)' }} />
              </div>

              {/* ── TERTIARY: Google ── */}
              <button
                type="button"
                onClick={handleGoogleLogin}
                style={{ width: '100%', padding: '14px', minHeight: '48px', backgroundColor: 'transparent', color: '#FFFFFF', fontWeight: 500, fontSize: '0.9375rem', border: '1px solid rgba(255, 255, 255, 0.15)', borderRadius: '8px', cursor: 'pointer', transition: 'all 200ms ease', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)'; e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.04)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)'; e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Continue with Google
              </button>
            </>
          )}
        </div>

        {/* Sign Up Link */}
        <p style={{ textAlign: 'center', marginTop: '28px', fontSize: '0.875rem', color: 'rgba(255, 255, 255, 0.5)' }}>
          Don{"'"}t have an account?{' '}
          <Link
            href="/signup"
            style={{ color: '#C6A664', textDecoration: 'none', fontWeight: 600 }}
            onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline'; }}
            onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none'; }}
          >
            Join 704 Collective
          </Link>
        </p>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
      `}</style>
    </div>
    </MarketingPageRoot>
    </>
  );
}